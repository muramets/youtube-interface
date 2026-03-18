// =============================================================================
// aiChat — thinking persistence tests
//
// Focused tests for thinking accumulator, stopped-message persistence,
// and regression guard ensuring thinking doesn't leak into AI history.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

let streamChatResult: Record<string, unknown> = {};

vi.mock("firebase-functions/v2/https", () => ({
    onRequest: (_config: unknown, handler: (...args: unknown[]) => unknown) => handler,
}));

vi.mock("firebase-functions/params", () => ({
    defineSecret: () => ({ value: () => "fake-key" }),
}));

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

vi.mock("../../shared/db.js", () => {
    const mockFieldValue = {
        serverTimestamp: () => "SERVER_TIMESTAMP",
        delete: () => "DELETE_FIELD",
        arrayUnion: (...args: unknown[]) => args,
    };
    return {
        admin: { firestore: { FieldValue: mockFieldValue } },
        db: {
            collection: vi.fn(),
            doc: vi.fn(),
            batch: vi.fn(() => ({ set: mockBatchSet, update: mockBatchUpdate, commit: mockBatchCommit })),
        },
    };
});

vi.mock("../../shared/auth.js", () => ({
    verifyAuthToken: vi.fn().mockResolvedValue("user-1"),
    verifyChannelAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../helpers.js", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("../helpers.js");
    return {
        logAiUsage: vi.fn().mockResolvedValue(undefined),
        MAX_TEXT_LENGTH: 100_000,
        deepStripUndefined: actual.deepStripUndefined,
    };
});

vi.mock("../../config/models.js", () => ({
    ALLOWED_MODEL_IDS: new Set(["gemini-2.0-flash"]),
    DEFAULT_MODEL_ID: "gemini-2.0-flash",
    validateThinkingOptionId: vi.fn(() => undefined),
    resolveModelId: vi.fn((id: string) => id || "gemini-2.0-flash"),
    MODEL_REGISTRY: [{ id: "gemini-2.0-flash", provider: "gemini", contextLimit: 1_000_000 }],
    UTILITY_MODEL_ID: "gemini-2.0-flash",
}));

vi.mock("../../services/ai/providerRouter.js", () => ({
    createProviderRouter: vi.fn(() => ({
        streamChat: vi.fn(async () => streamChatResult),
    })),
}));

vi.mock("../../services/gemini/factory.js", () => ({
    geminiFactory: vi.fn(),
}));

vi.mock("../../services/gemini/context.js", () => ({
    geminiContext: vi.fn(() => ({})),
}));

vi.mock("../../services/claude/factory.js", () => ({
    claudeFactory: vi.fn(),
}));

vi.mock("../../services/tools/definitions.js", () => ({
    TOOL_DECLARATIONS: [],
}));

vi.mock("../sseWriter.js", () => ({
    writeSSE: vi.fn(),
}));

vi.mock("../../shared/imageTokens.js", () => ({
    estimateImageTokens: vi.fn(() => 0),
}));

vi.mock("../../services/memory.js", () => ({
    buildMemory: vi.fn().mockResolvedValue({
        history: [],
        usedSummary: false,
    }),
    formatContextLabel: vi.fn(() => ""),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { db } from "../../shared/db.js";
import { writeSSE } from "../sseWriter.js";

const mockDb = db as unknown as {
    collection: ReturnType<typeof vi.fn>;
    doc: ReturnType<typeof vi.fn>;
};

/** Create a minimal Firestore doc mock */
function mockDoc(id: string, data: Record<string, unknown>) {
    return { id, data: () => data, exists: true };
}

/** Set up Firestore mocks for conversation history */
function setupFirestoreMocks(messageDocs: ReturnType<typeof mockDoc>[], convData: Record<string, unknown> = {}) {
    const messagesSnap = { docs: messageDocs };
    const convDoc = { data: () => convData, exists: true };
    const settingsDoc = { data: () => ({}), exists: false };

    const mockMsgDocRef = { id: "pre-generated-msg-id" };

    // db.collection(messagesPath).orderBy().get() → messages
    // db.collection(messagesPath).doc() → pre-generated ref for server-only writer
    mockDb.collection.mockReturnValue({
        orderBy: () => ({ get: vi.fn().mockResolvedValue(messagesSnap) }),
        doc: vi.fn().mockReturnValue(mockMsgDocRef),
    });

    // db.doc(convPath).get() → conversation doc
    // db.doc(settingsPath).get() → settings doc
    mockDb.doc.mockImplementation((path: string) => {
        if (path.includes("/settings/")) {
            return { get: vi.fn().mockResolvedValue(settingsDoc), update: vi.fn().mockResolvedValue(undefined) };
        }
        return {
            get: vi.fn().mockResolvedValue(convDoc),
            update: vi.fn().mockResolvedValue(undefined),
            onSnapshot: vi.fn().mockReturnValue(vi.fn()), // returns unsubscribe no-op
        };
    });
}

function makeReq(body: Record<string, unknown> = {}) {
    return {
        method: "POST",
        headers: { authorization: "Bearer fake-token" },
        body: {
            channelId: "chan-1",
            conversationId: "conv-1",
            text: "hello",
            model: "gemini-2.0-flash",
            ...body,
        },
    };
}

function makeRes() {
    const events: unknown[] = [];
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
        // Track what writeSSE receives
        _events: events,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("aiChat — toolCalls in history mapper", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchSet.mockClear();
        mockBatchUpdate.mockClear();
        mockBatchCommit.mockClear().mockResolvedValue(undefined);
        streamChatResult = {};
    });

    it("mapper includes toolCalls in HistoryMessage when present in Firestore doc", async () => {
        const toolCallsData = [
            { name: "browseTrendVideos", args: { channelId: "ch1" }, result: { videos: [{ id: "v1" }] } },
        ];

        streamChatResult = { text: "Reply", partial: false };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "show trends", status: "complete" }),
            mockDoc("msg-2", { role: "model", text: "here are trends", status: "complete", toolCalls: toolCallsData }),
            mockDoc("msg-3", { role: "user", text: "follow up", status: undefined }),
        ]);

        const { buildMemory } = await import("../../services/memory.js");
        const mockBuildMemory = buildMemory as ReturnType<typeof vi.fn>;
        mockBuildMemory.mockResolvedValueOnce({ history: [], usedSummary: false });

        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const req = makeReq();
        const res = makeRes();

        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        // buildMemory receives priorMessages (allMessages.slice(0, -1))
        const buildMemoryCall = mockBuildMemory.mock.calls[0][0];
        const priorMessages = buildMemoryCall.allMessages as Array<Record<string, unknown>>;

        // msg-2 (model with toolCalls) should be in priorMessages
        const modelMsg = priorMessages.find(m => m.id === "msg-2");
        expect(modelMsg).toBeDefined();
        expect(modelMsg!.toolCalls).toEqual(toolCallsData);
    });

    it("mapper omits toolCalls when absent in Firestore doc (undefined)", async () => {
        streamChatResult = { text: "Reply", partial: false };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "hello", status: "complete" }),
            mockDoc("msg-2", { role: "model", text: "hi there", status: "complete" }), // no toolCalls
            mockDoc("msg-3", { role: "user", text: "follow up", status: undefined }),
        ]);

        const { buildMemory } = await import("../../services/memory.js");
        const mockBuildMemory = buildMemory as ReturnType<typeof vi.fn>;
        mockBuildMemory.mockResolvedValueOnce({ history: [], usedSummary: false });

        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const req = makeReq();
        const res = makeRes();

        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        const buildMemoryCall = mockBuildMemory.mock.calls[0][0];
        const priorMessages = buildMemoryCall.allMessages as Array<Record<string, unknown>>;

        const modelMsg = priorMessages.find(m => m.id === "msg-2");
        expect(modelMsg).toBeDefined();
        expect(modelMsg!.toolCalls).toBeUndefined();
    });
});

describe("aiChat — contextBreakdown.toolResults", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchSet.mockClear();
        mockBatchUpdate.mockClear();
        mockBatchCommit.mockClear().mockResolvedValue(undefined);
        streamChatResult = {};
    });

    it("toolResults > 0 after streamChat with tool calls", async () => {
        const toolCallsResult = [
            { name: "browseTrendVideos", args: { channelId: "ch1" }, result: { videos: [{ id: "v1", title: "Trending" }] } },
        ];
        streamChatResult = {
            text: "Here are the videos",
            partial: false,
            toolCalls: toolCallsResult,
        };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "hello", status: undefined }),
        ]);

        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const req = makeReq();
        const res = makeRes();

        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        // Find the "done" SSE event and check contextBreakdown
        const doneCalls = (writeSSE as ReturnType<typeof vi.fn>).mock.calls
            .filter((call: unknown[]) => (call[1] as Record<string, unknown>)?.type === "done");
        expect(doneCalls).toHaveLength(1);

        const donePayload = doneCalls[0][1] as Record<string, unknown>;
        const breakdown = donePayload.contextBreakdown as Record<string, unknown>;
        expect(breakdown.toolResults).toBeGreaterThan(0);
    });

    it("toolResults === 0 after streamChat without tool calls", async () => {
        streamChatResult = {
            text: "Simple answer",
            partial: false,
        };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "hello", status: undefined }),
        ]);

        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const req = makeReq();
        const res = makeRes();

        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        const doneCalls = (writeSSE as ReturnType<typeof vi.fn>).mock.calls
            .filter((call: unknown[]) => (call[1] as Record<string, unknown>)?.type === "done");
        expect(doneCalls).toHaveLength(1);

        const donePayload = doneCalls[0][1] as Record<string, unknown>;
        const breakdown = donePayload.contextBreakdown as Record<string, unknown>;
        expect(breakdown.toolResults).toBe(0);
    });
});

describe("aiChat — thinking persistence", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchSet.mockClear();
        mockBatchUpdate.mockClear();
        mockBatchCommit.mockClear().mockResolvedValue(undefined);
        streamChatResult = {};
    });

    it("TT.3: includes thinking in stopped message when onThought was called", async () => {
        // Setup: provider returns partial=true (stopped response)
        const THINKING = "Let me analyze this step by step...";
        streamChatResult = {
            text: "Partial answer",
            partial: true,
            tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "hello", status: undefined }),
        ]);

        // The router mock captures callbacks, but onThought is called
        // by the provider during streaming. We simulate this by making
        // streamChat call onThought before returning.
        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async (opts: Record<string, unknown>) => {
                const cbs = opts.callbacks as Record<string, (...args: unknown[]) => void>;
                // Simulate thinking chunks
                cbs.onThought?.(THINKING);
                return streamChatResult;
            }),
        });

        const req = makeReq();
        const res = makeRes();

        // Import and call the handler
        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        // Verify message was persisted via batch.set with thinking
        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const stoppedMsg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        expect(stoppedMsg.thinking).toBe(THINKING);
        expect(stoppedMsg.thinkingElapsedMs).toBeTypeOf("number");
        expect(stoppedMsg.thinkingElapsedMs).toBeGreaterThanOrEqual(0);
        expect(stoppedMsg.status).toBe("stopped");
    });

    it("TT.4: does NOT include thinking when no onThought callbacks received", async () => {
        streamChatResult = {
            text: "Partial answer",
            partial: true,
            tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "hello", status: undefined }),
        ]);

        // Provider does NOT call onThought
        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const req = makeReq();
        const res = makeRes();

        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        // Server-only writer: ALL responses are persisted via batch.set
        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const stoppedMsg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        expect(stoppedMsg.thinking).toBeUndefined();
        expect(stoppedMsg.thinkingElapsedMs).toBeUndefined();
    });

    it("TT.5: allMessages mapping does NOT include thinking field (regression guard)", async () => {
        // Setup: Firestore has messages WITH thinking field (from previous persistence)
        streamChatResult = { text: "Reply", partial: false };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "first question", status: "complete" }),
            mockDoc("msg-2", {
                role: "model",
                text: "first answer",
                status: "complete",
                thinking: "SECRET THINKING — must NOT leak to AI history",
                thinkingElapsedMs: 5000,
            }),
            mockDoc("msg-3", { role: "user", text: "follow up", status: undefined }),
        ]);

        // Capture what buildMemory receives
        const { buildMemory } = await import("../../services/memory.js");
        const mockBuildMemory = buildMemory as ReturnType<typeof vi.fn>;
        mockBuildMemory.mockResolvedValueOnce({ history: [], usedSummary: false });

        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const req = makeReq();
        const res = makeRes();

        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        // buildMemory is called with allMessages (priorMessages = allMessages.slice(0,-1))
        const buildMemoryCall = mockBuildMemory.mock.calls[0][0];
        const allMessagesPassedToMemory = buildMemoryCall.allMessages as Array<Record<string, unknown>>;

        // Verify NO message has thinking in the history
        for (const msg of allMessagesPassedToMemory) {
            expect(msg).not.toHaveProperty("thinking");
            expect(msg).not.toHaveProperty("thinkingElapsedMs");
        }
    });

    it("TT.5b: onThought empty text is ignored (no accumulation)", async () => {
        streamChatResult = {
            text: "Partial answer",
            partial: true,
        };

        setupFirestoreMocks([
            mockDoc("msg-1", { role: "user", text: "hello", status: undefined }),
        ]);

        const { createProviderRouter } = await import("../../services/ai/providerRouter.js");
        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async (opts: Record<string, unknown>) => {
                const cbs = opts.callbacks as Record<string, (...args: unknown[]) => void>;
                // Empty text should be ignored
                cbs.onThought?.("");
                cbs.onThought?.("");
                return streamChatResult;
            }),
        });

        const req = makeReq();
        const res = makeRes();

        const { aiChat } = await import("../aiChat.js");
        await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);

        // Verify writeSSE was NOT called with thought events (empty text filtered)
        const thoughtCalls = (writeSSE as ReturnType<typeof vi.fn>).mock.calls
            .filter((call: unknown[]) => (call[1] as Record<string, unknown>)?.type === "thought");
        expect(thoughtCalls).toHaveLength(0);

        // Persisted message should NOT have thinking (empty text filtered)
        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const persistedMsg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        expect(persistedMsg.thinking).toBeUndefined();
    });
});

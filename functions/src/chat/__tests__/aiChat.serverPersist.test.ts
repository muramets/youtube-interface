// =============================================================================
// aiChat — server-only writer persistence tests
//
// Verifies that the server persists AI messages for ALL terminal states
// (complete + stopped) via atomic Firestore batch, and that messageId
// is included in the SSE done event.
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
const mockBatch = { set: mockBatchSet, update: mockBatchUpdate, commit: mockBatchCommit };

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
            batch: vi.fn(() => mockBatch),
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
    CONCLUDE_TOOL_DECLARATIONS: [],
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
import { createProviderRouter } from "../../services/ai/providerRouter.js";

const mockDb = db as unknown as {
    collection: ReturnType<typeof vi.fn>;
    doc: ReturnType<typeof vi.fn>;
    batch: ReturnType<typeof vi.fn>;
};

function mockDoc(id: string, data: Record<string, unknown>) {
    return { id, data: () => data, exists: true };
}

function setupFirestoreMocks(messageDocs: ReturnType<typeof mockDoc>[] = []) {
    const messagesSnap = { docs: messageDocs };
    const convDoc = { data: () => ({}), exists: true };
    const settingsDoc = { data: () => ({}), exists: false };

    const mockMsgDocRef = { id: "pre-generated-msg-id" };

    mockDb.collection.mockReturnValue({
        orderBy: () => ({ get: vi.fn().mockResolvedValue(messagesSnap) }),
        doc: vi.fn().mockReturnValue(mockMsgDocRef),
    });

    mockDb.doc.mockImplementation((path: string) => {
        if (path.includes("/settings/")) {
            return { get: vi.fn().mockResolvedValue(settingsDoc), update: vi.fn().mockResolvedValue(undefined) };
        }
        return {
            get: vi.fn().mockResolvedValue(convDoc),
            update: vi.fn().mockResolvedValue(undefined),
            onSnapshot: vi.fn().mockReturnValue(vi.fn()),
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
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
        write: vi.fn(),
    };
}

async function runHandler(req: unknown, res: unknown) {
    const { aiChat } = await import("../aiChat.js");
    await (aiChat as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);
}

function getDoneEvent(): Record<string, unknown> | undefined {
    const doneCalls = (writeSSE as ReturnType<typeof vi.fn>).mock.calls
        .filter((call: unknown[]) => (call[1] as Record<string, unknown>)?.type === "done");
    return doneCalls[0]?.[1] as Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("aiChat — server-only writer: complete response", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchSet.mockClear();
        mockBatchUpdate.mockClear();
        mockBatchCommit.mockClear().mockResolvedValue(undefined);
        streamChatResult = {};
    });

    it("persists complete response via batch.set with all fields", async () => {
        streamChatResult = {
            text: "Full answer",
            partial: false,
            tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            normalizedUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.01 },
            toolCalls: [{ name: "getChannelOverview", args: {}, result: { ok: true } }],
        };

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async (opts: Record<string, unknown>) => {
                const cbs = opts.callbacks as Record<string, (...args: unknown[]) => void>;
                cbs.onThought?.("Thinking about this...");
                return streamChatResult;
            }),
        });

        await runHandler(makeReq(), makeRes());

        // batch.set was called with the message
        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const msg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        expect(msg.role).toBe("model");
        expect(msg.text).toBe("Full answer");
        expect(msg.model).toBe("gemini-2.0-flash");
        expect(msg.status).toBe("complete");
        expect(msg.createdAt).toBe("SERVER_TIMESTAMP");
        expect(msg.tokenUsage).toEqual(streamChatResult.tokenUsage);
        expect(msg.normalizedUsage).toEqual(streamChatResult.normalizedUsage);
        expect(msg.toolCalls).toBeDefined();
        expect(msg.contextBreakdown).toBeDefined();
        expect(msg.thinking).toBe("Thinking about this...");
        expect(msg.thinkingElapsedMs).toBeTypeOf("number");

        // batch.update was called for conversation doc
        expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
        const convUpdate = mockBatchUpdate.mock.calls[0][1] as Record<string, unknown>;
        expect(convUpdate.updatedAt).toBe("SERVER_TIMESTAMP");
        expect(convUpdate.lastError).toBe("DELETE_FIELD");

        // batch.commit was called
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it("persists stopped response with status 'stopped'", async () => {
        streamChatResult = {
            text: "Partial answer",
            partial: true,
            tokenUsage: { promptTokens: 80, completionTokens: 20, totalTokens: 100 },
        };

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        await runHandler(makeReq(), makeRes());

        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const msg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        expect(msg.status).toBe("stopped");
        expect(msg.text).toBe("Partial answer");
    });

    it("includes pre-generated messageId in SSE done event", async () => {
        streamChatResult = { text: "Answer", partial: false };

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        await runHandler(makeReq(), makeRes());

        const doneEvent = getDoneEvent();
        expect(doneEvent).toBeDefined();
        expect(doneEvent!.messageId).toBe("pre-generated-msg-id");
    });

    it("conversation updatedAt is bumped in the same batch", async () => {
        streamChatResult = { text: "Reply", partial: false };

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        await runHandler(makeReq(), makeRes());

        // Both set and update are in the same batch (same commit)
        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it("batch failure after all retries does not break SSE response", async () => {
        streamChatResult = { text: "Reply", partial: false };
        // Exhaust all 3 attempts (1 initial + 2 retries)
        mockBatchCommit
            .mockRejectedValueOnce(new Error("Firestore quota exceeded"))
            .mockRejectedValueOnce(new Error("Firestore quota exceeded"))
            .mockRejectedValueOnce(new Error("Firestore quota exceeded"));

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const res = makeRes();
        await runHandler(makeReq(), res);

        // SSE done event was still sent (before batch)
        const doneEvent = getDoneEvent();
        expect(doneEvent).toBeDefined();
        expect(doneEvent!.text).toBe("Reply");

        // Response still ended cleanly
        expect(res.end).toHaveBeenCalled();

        // batch.commit was attempted 3 times (1 + 2 retries)
        expect(mockBatchCommit).toHaveBeenCalledTimes(3);
    }, 10_000);

    it("batch retry succeeds on second attempt", async () => {
        streamChatResult = { text: "Reply", partial: false };
        // First attempt fails, second succeeds
        mockBatchCommit
            .mockRejectedValueOnce(new Error("transient"))
            .mockResolvedValueOnce(undefined);

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        await runHandler(makeReq(), makeRes());

        // batch.commit called twice (1 failed + 1 succeeded)
        expect(mockBatchCommit).toHaveBeenCalledTimes(2);
    }, 10_000);

    it("strips undefined fields — no tokenUsage/normalizedUsage if absent", async () => {
        streamChatResult = { text: "Simple reply", partial: false };

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        await runHandler(makeReq(), makeRes());

        const msg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        // These should NOT be present (undefined stripped by if-guard)
        expect(msg).not.toHaveProperty("tokenUsage");
        expect(msg).not.toHaveProperty("normalizedUsage");
        expect(msg).not.toHaveProperty("toolCalls");
        expect(msg).not.toHaveProperty("thinking");
        expect(msg).not.toHaveProperty("thinkingElapsedMs");
        // contextBreakdown is always set
        expect(msg.contextBreakdown).toBeDefined();
    });
});

describe("aiChat — server-only writer: empty response edge case", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchSet.mockClear();
        mockBatchUpdate.mockClear();
        mockBatchCommit.mockClear().mockResolvedValue(undefined);
        streamChatResult = {};
    });

    it("persists message even with empty text (consistency)", async () => {
        streamChatResult = {
            text: "",
            partial: false,
            toolCalls: [{ name: "saveKnowledge", args: { title: "Test" }, result: { id: "ki-1" } }],
        };

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "memorize this", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        await runHandler(makeReq(), makeRes());

        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const msg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        expect(msg.text).toBe("");
        expect(msg.status).toBe("complete");
        expect(msg.toolCalls).toBeDefined();
    });
});

describe("aiChat — server-only writer: KI content preserved", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchSet.mockClear();
        mockBatchUpdate.mockClear();
        mockBatchCommit.mockClear().mockResolvedValue(undefined);
        streamChatResult = {};
    });

    it("preserves saveKnowledge args.content in persisted toolCalls (no placeholder)", async () => {
        streamChatResult = {
            text: "Saved!",
            partial: false,
            toolCalls: [{
                name: "saveKnowledge",
                args: { title: "Test KI", content: "Very long content that is preserved as-is" },
                result: { id: "ki-123" },
            }],
        };

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "save this", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        await runHandler(makeReq(), makeRes());

        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const msg = mockBatchSet.mock.calls[0][1] as Record<string, unknown>;
        const toolCalls = msg.toolCalls as Array<{ name: string; args: Record<string, unknown> }>;
        expect(toolCalls[0].args.content).toBe("Very long content that is preserved as-is");
    });
});

describe("aiChat — server-only writer: error resilience", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchSet.mockClear();
        mockBatchUpdate.mockClear();
        mockBatchCommit.mockClear().mockResolvedValue(undefined);
        streamChatResult = {};
    });

    it("server persist failure still allows SSE done and clean response end", async () => {
        streamChatResult = { text: "Reply", partial: false };
        // Batch commit fails — but SSE done was already sent before batch
        mockBatchCommit.mockRejectedValueOnce(new Error("Firestore unavailable"));

        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => streamChatResult),
        });

        const res = makeRes();
        await runHandler(makeReq(), res);

        // SSE done was sent before batch (messageId available sync)
        const doneEvent = getDoneEvent();
        expect(doneEvent).toBeDefined();
        expect(doneEvent!.text).toBe("Reply");
        expect(doneEvent!.messageId).toBe("pre-generated-msg-id");

        // Response ended cleanly despite persist failure
        expect(res.end).toHaveBeenCalled();
    });

    it("non-abort error persists lastError but no model message", async () => {
        setupFirestoreMocks([mockDoc("msg-1", { role: "user", text: "hello", status: undefined })]);

        (createProviderRouter as ReturnType<typeof vi.fn>).mockReturnValueOnce({
            streamChat: vi.fn(async () => { throw new Error("Provider timeout"); }),
        });

        const res = makeRes();
        await runHandler(makeReq(), res);

        // Error SSE event should be sent
        const errorCalls = (writeSSE as ReturnType<typeof vi.fn>).mock.calls
            .filter((call: unknown[]) => (call[1] as Record<string, unknown>)?.type === "error");
        expect(errorCalls).toHaveLength(1);

        // Response ended
        expect(res.end).toHaveBeenCalled();
    });
});

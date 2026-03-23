import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGenerateText = vi.fn();

vi.mock("../../../services/ai/providerRouter.js", () => ({
    createProviderRouter: vi.fn(() => ({
        streamChat: vi.fn(),
        generateText: mockGenerateText,
    })),
}));

vi.mock("../../../services/gemini/factory.js", () => ({
    geminiFactory: vi.fn(),
}));

vi.mock("../../../services/claude/factory.js", () => ({
    claudeFactory: vi.fn(),
}));

vi.mock("../../../shared/models.js", () => ({
    MODEL_REGISTRY: [
        { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini", contextLimit: 1_000_000 },
        { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic", contextLimit: 1_000_000 },
    ],
}));

vi.mock("../../../services/memory.js", () => ({
    CHARS_PER_TOKEN: 4,
}));

vi.mock("../../../config/models.js", () => ({
    ALLOWED_MODEL_IDS: new Set(["gemini-2.5-pro", "claude-opus-4-6"]),
}));

// Mock firebase-functions (onCall wrapping)
vi.mock("firebase-functions/v2/https", () => {
    class HttpsError extends Error {
        code: string;
        constructor(code: string, message: string) {
            super(message);
            this.code = code;
            this.name = "HttpsError";
        }
    }
    return {
        onCall: (_config: unknown, handler: unknown) => handler,
        HttpsError,
    };
});

vi.mock("firebase-functions/params", () => ({
    defineSecret: vi.fn(() => ({ value: () => "test-key" })),
}));

import { consolidateMemories } from "../consolidateMemories.js";

// Helper to build a fake request
function makeRequest(overrides: Record<string, unknown> = {}) {
    return {
        auth: { uid: "user-1" },
        data: {
            model: "gemini-2.5-pro",
            memories: [
                { id: "m1", title: "Session 1", content: "Content 1", createdAt: "2026-01-15T10:00:00Z" },
                { id: "m2", title: "Session 2", content: "Content 2", createdAt: "2026-02-20T14:00:00Z" },
            ],
            ...overrides,
        },
    };
}

describe("consolidateMemories CF", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("happy path: returns consolidated result", async () => {
        const consolidatedResult = {
            memories: [{ title: "Merged", content: "Combined content" }],
            reasoning: "Merged overlapping topics",
            noChangesNeeded: false,
        };
        mockGenerateText.mockResolvedValue({
            text: JSON.stringify(consolidatedResult),
            parsed: consolidatedResult,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (consolidateMemories as any)(makeRequest());

        expect(result.memories).toHaveLength(1);
        expect(result.memories[0].title).toBe("Merged");
        expect(result.reasoning).toBe("Merged overlapping topics");
    });

    it("noChangesNeeded: true → passthrough", async () => {
        mockGenerateText.mockResolvedValue({
            text: "{}",
            parsed: { memories: [], reasoning: "Already optimal", noChangesNeeded: true },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (consolidateMemories as any)(makeRequest());

        expect(result.noChangesNeeded).toBe(true);
        expect(result.memories).toEqual([]);
    });

    it("throws unauthenticated when auth is missing", async () => {
        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (consolidateMemories as any)({ auth: null, data: {} }),
        ).rejects.toThrow(/Authentication required/);
    });

    it("throws invalid-argument for unsupported model", async () => {
        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (consolidateMemories as any)(makeRequest({ model: "gpt-4o" })),
        ).rejects.toThrow(/not supported/);
    });

    it("throws invalid-argument for less than 2 memories", async () => {
        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (consolidateMemories as any)(makeRequest({
                memories: [{ id: "m1", title: "Only one", content: "C", createdAt: "2026-01-01T00:00:00Z" }],
            })),
        ).rejects.toThrow(/At least 2 memories/);
    });

    it("throws invalid-argument when content exceeds context limit", async () => {
        const hugeContent = "x".repeat(3_000_000);
        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (consolidateMemories as any)(makeRequest({
                memories: [
                    { id: "m1", title: "Huge", content: hugeContent, createdAt: "2026-01-01T00:00:00Z" },
                    { id: "m2", title: "Also huge", content: hugeContent, createdAt: "2026-01-02T00:00:00Z" },
                ],
            })),
        ).rejects.toThrow(/exceed the context window/);
    });

    it("throws unavailable when LLM call fails", async () => {
        mockGenerateText.mockRejectedValue(new Error("Rate limit exceeded"));

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (consolidateMemories as any)(makeRequest()),
        ).rejects.toThrow(/AI model failed/);
    });

    it("passes intention to user prompt", async () => {
        mockGenerateText.mockResolvedValue({
            text: "{}",
            parsed: { memories: [{ title: "T", content: "C" }], reasoning: "R", noChangesNeeded: false },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (consolidateMemories as any)(makeRequest({ intention: "merge sessions" }));

        const callArgs = mockGenerateText.mock.calls[0][0];
        expect(callArgs.text).toContain("merge sessions");
    });
});

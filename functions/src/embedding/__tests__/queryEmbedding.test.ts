import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const { mockEmbedContent, mockLoggerWarn } = vi.hoisted(() => ({
    mockEmbedContent: vi.fn(),
    mockLoggerWarn: vi.fn(),
}));

vi.mock("../../services/gemini/client.js", () => ({
    getClient: vi.fn().mockResolvedValue({
        models: { embedContent: mockEmbedContent },
    }),
}));

vi.mock("firebase-functions/v2", () => ({
    logger: { warn: mockLoggerWarn },
}));

import { generateQueryEmbedding } from "../queryEmbedding.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function make768dVector(): number[] {
    return Array.from({ length: 768 }, (_, i) => i * 0.001);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateQueryEmbedding", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 768d embedding for a query string", async () => {
        const vector = make768dVector();
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: vector }],
        });

        const result = await generateQueryEmbedding("Iceland travel vlog", "test-api-key");

        expect(result).toEqual(vector);
        expect(result).toHaveLength(768);
    });

    it("sends raw query text without Title/Tags/Description wrappers", async () => {
        const vector = make768dVector();
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: vector }],
        });

        await generateQueryEmbedding("AI tools tutorial", "test-api-key");

        const callArgs = mockEmbedContent.mock.calls[0][0];
        expect(callArgs.contents).toBe("AI tools tutorial");
        expect(callArgs.contents).not.toContain("Title:");
        expect(callArgs.contents).not.toContain("Tags:");
        expect(callArgs.contents).not.toContain("Description:");
    });

    it("passes taskType RETRIEVAL_QUERY in config", async () => {
        const vector = make768dVector();
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: vector }],
        });

        await generateQueryEmbedding("search query", "test-api-key");

        const callArgs = mockEmbedContent.mock.calls[0][0];
        expect(callArgs.config.taskType).toBe("RETRIEVAL_QUERY");
        expect(callArgs.config.outputDimensionality).toBe(768);
    });

    it("uses gemini-embedding-001 model", async () => {
        const vector = make768dVector();
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: vector }],
        });

        await generateQueryEmbedding("test", "test-api-key");

        const callArgs = mockEmbedContent.mock.calls[0][0];
        expect(callArgs.model).toBe("gemini-embedding-001");
    });

    it("returns null and logs warning when API returns empty embeddings", async () => {
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: [] }],
        });

        const result = await generateQueryEmbedding("test query", "test-api-key");

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "queryEmbedding:emptyResponse",
            expect.objectContaining({ query: "test query" }),
        );
    });

    it("returns null and logs warning when API throws error", async () => {
        mockEmbedContent.mockRejectedValueOnce(new Error("API quota exceeded"));

        const result = await generateQueryEmbedding("test query", "test-api-key");

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "queryEmbedding:failed",
            expect.objectContaining({ error: "API quota exceeded" }),
        );
    });

    it("returns null when embeddings array is undefined", async () => {
        mockEmbedContent.mockResolvedValueOnce({});

        const result = await generateQueryEmbedding("test", "test-api-key");

        expect(result).toBeNull();
    });
});

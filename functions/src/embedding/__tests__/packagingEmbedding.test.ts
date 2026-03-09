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

import { generatePackagingEmbedding } from "../packagingEmbedding.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function make768dVector(): number[] {
    return Array.from({ length: 768 }, (_, i) => i * 0.001);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generatePackagingEmbedding", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 768d embedding array on normal input", async () => {
        const vector = make768dVector();
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: vector }],
        });

        const result = await generatePackagingEmbedding(
            "Test Video Title",
            ["tag1", "tag2"],
            "A short description",
            "test-api-key",
        );

        expect(result).toEqual(vector);
        expect(result).toHaveLength(768);

        // Verify input text format
        const callArgs = mockEmbedContent.mock.calls[0][0];
        expect(callArgs.model).toBe("gemini-embedding-001");
        expect(callArgs.contents).toContain("Title: Test Video Title");
        expect(callArgs.contents).toContain("Tags: tag1, tag2");
        expect(callArgs.contents).toContain("Description: A short description");
        expect(callArgs.config.outputDimensionality).toBe(768);
    });

    it("truncates long descriptions before API call", async () => {
        const vector = make768dVector();
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: vector }],
        });

        const longDescription = "x".repeat(5000);

        const result = await generatePackagingEmbedding(
            "Title",
            [],
            longDescription,
            "test-api-key",
        );

        expect(result).toEqual(vector);

        const callArgs = mockEmbedContent.mock.calls[0][0];
        const descInContent = callArgs.contents.split("Description: ")[1];
        expect(descInContent.length).toBe(3000);
    });

    it("handles empty tags array", async () => {
        const vector = make768dVector();
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: vector }],
        });

        const result = await generatePackagingEmbedding(
            "Title",
            [],
            "Description",
            "test-api-key",
        );

        expect(result).toEqual(vector);

        const callArgs = mockEmbedContent.mock.calls[0][0];
        expect(callArgs.contents).toContain("Tags: ");
    });

    it("returns null and logs warning on API error", async () => {
        mockEmbedContent.mockRejectedValueOnce(new Error("API quota exceeded"));

        const result = await generatePackagingEmbedding(
            "Title",
            ["tag1"],
            "Description",
            "test-api-key",
        );

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "packagingEmbedding:failed",
            expect.objectContaining({ error: "API quota exceeded" }),
        );
    });

    it("returns null when API returns empty embeddings", async () => {
        mockEmbedContent.mockResolvedValueOnce({
            embeddings: [{ values: [] }],
        });

        const result = await generatePackagingEmbedding(
            "Title",
            [],
            "Desc",
            "test-api-key",
        );

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "packagingEmbedding:emptyResponse",
            expect.objectContaining({ title: "Title" }),
        );
    });
});

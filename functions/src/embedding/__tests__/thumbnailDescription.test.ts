import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const { mockGenerateContent, mockLoggerWarn, mockDownloadThumbnail } = vi.hoisted(() => ({
    mockGenerateContent: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockDownloadThumbnail: vi.fn(),
}));

vi.mock("../../services/gemini/client.js", () => ({
    getClient: vi.fn().mockResolvedValue({
        models: { generateContent: mockGenerateContent },
    }),
}));

vi.mock("firebase-functions/v2", () => ({
    logger: { warn: mockLoggerWarn },
}));

vi.mock("../thumbnailDownload.js", () => ({
    downloadThumbnail: (...args: unknown[]) => mockDownloadThumbnail(...args),
}));

import { generateThumbnailDescription } from "../thumbnailDescription.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function downloadResult() {
    return {
        buffer: Buffer.from("fake-image-data"),
        mimeType: "image/jpeg",
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateThumbnailDescription", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns description when thumbnail is available", async () => {
        mockDownloadThumbnail.mockResolvedValueOnce(downloadResult());
        mockGenerateContent.mockResolvedValueOnce({
            text: "A vibrant thumbnail showing a person pointing at a chart with bold red text overlay.",
        });

        const result = await generateThumbnailDescription("testVideoId", "test-api-key");

        expect(result).toBe(
            "A vibrant thumbnail showing a person pointing at a chart with bold red text overlay.",
        );

        // Verify vision prompt and inline data
        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.model).toBe("gemini-2.0-flash");
        const parts = callArgs.contents[0].parts;
        expect(parts[0].text).toContain("similarity search");
        expect(parts[1].inlineData.mimeType).toBe("image/jpeg");
        expect(typeof parts[1].inlineData.data).toBe("string"); // base64
    });

    it("returns null when thumbnail download fails", async () => {
        mockDownloadThumbnail.mockResolvedValueOnce(null);

        const result = await generateThumbnailDescription("deletedVideoId", "test-api-key");

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "thumbnailDescription:downloadFailed",
            expect.objectContaining({ videoId: "deletedVideoId" }),
        );
        expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it("returns null and logs warning on Gemini API error", async () => {
        mockDownloadThumbnail.mockResolvedValueOnce(downloadResult());
        mockGenerateContent.mockRejectedValueOnce(new Error("Model overloaded"));

        const result = await generateThumbnailDescription("testVideoId", "test-api-key");

        expect(result).toBeNull();
        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "thumbnailDescription:failed",
            expect.objectContaining({
                videoId: "testVideoId",
                error: "Model overloaded",
            }),
        );
    });

    it("returns null when Gemini returns empty text", async () => {
        mockDownloadThumbnail.mockResolvedValueOnce(downloadResult());
        mockGenerateContent.mockResolvedValueOnce({ text: "" });

        const result = await generateThumbnailDescription("testVideoId", "test-api-key");

        expect(result).toBeNull();
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const { mockAxiosGet } = vi.hoisted(() => ({
    mockAxiosGet: vi.fn(),
}));

vi.mock("axios", () => ({
    default: { get: mockAxiosGet },
}));

import { downloadThumbnail } from "../thumbnailDownload.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function imageResponse(resolution: string) {
    return {
        data: Buffer.from(`fake-image-${resolution}`),
        headers: { "content-type": "image/jpeg" },
    };
}

function htmlResponse() {
    return {
        data: Buffer.from("<html>redirect</html>"),
        headers: { "content-type": "text/html" },
    };
}

function notFoundError() {
    const err = new Error("Request failed with status code 404");
    (err as Record<string, unknown>).response = { status: 404 };
    return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("downloadThumbnail", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns buffer from maxresdefault when available", async () => {
        mockAxiosGet.mockResolvedValueOnce(imageResponse("maxresdefault"));

        const result = await downloadThumbnail("testVideoId");

        expect(result).not.toBeNull();
        expect(result!.mimeType).toBe("image/jpeg");
        expect(result!.buffer).toBeInstanceOf(Buffer);
        expect(mockAxiosGet).toHaveBeenCalledTimes(1);
        expect(mockAxiosGet.mock.calls[0][0]).toContain("maxresdefault");
    });

    it("falls back to mqdefault when maxresdefault returns 404", async () => {
        mockAxiosGet
            .mockRejectedValueOnce(notFoundError())
            .mockResolvedValueOnce(imageResponse("mqdefault"));

        const result = await downloadThumbnail("testVideoId");

        expect(result).not.toBeNull();
        expect(mockAxiosGet).toHaveBeenCalledTimes(2);
        expect(mockAxiosGet.mock.calls[1][0]).toContain("mqdefault");
    });

    it("returns null when all resolutions fail (404)", async () => {
        mockAxiosGet
            .mockRejectedValueOnce(notFoundError())
            .mockRejectedValueOnce(notFoundError());

        const result = await downloadThumbnail("testVideoId");

        expect(result).toBeNull();
    });

    it("skips non-image responses (HTML redirect)", async () => {
        mockAxiosGet
            .mockResolvedValueOnce(htmlResponse())
            .mockResolvedValueOnce(htmlResponse());

        const result = await downloadThumbnail("testVideoId");

        expect(result).toBeNull();
    });

    it("passes correct timeout option", async () => {
        mockAxiosGet.mockResolvedValueOnce(imageResponse("maxresdefault"));

        await downloadThumbnail("testVideoId");

        expect(mockAxiosGet.mock.calls[0][1]).toEqual(
            expect.objectContaining({
                responseType: "arraybuffer",
                timeout: 10_000,
            }),
        );
    });
});

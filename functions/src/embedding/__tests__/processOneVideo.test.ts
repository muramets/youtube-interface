import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
    mockDocGet,
    mockDocSet,
    mockLoggerWarn,
    mockDownloadThumbnail,
    mockGeneratePackaging,
    mockGenerateThumbnailDesc,
    mockGenerateVisual,
} = vi.hoisted(() => ({
    mockDocGet: vi.fn(),
    mockDocSet: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockDownloadThumbnail: vi.fn(),
    mockGeneratePackaging: vi.fn(),
    mockGenerateThumbnailDesc: vi.fn(),
    mockGenerateVisual: vi.fn(),
}));

vi.mock("../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            set: (data: unknown, opts: unknown) => mockDocSet(path, data, opts),
        }),
    },
}));

vi.mock("firebase-functions/v2", () => ({
    logger: { warn: mockLoggerWarn, info: vi.fn() },
}));

vi.mock("../thumbnailDownload.js", () => ({
    downloadThumbnail: (...args: unknown[]) => mockDownloadThumbnail(...args),
}));

vi.mock("../packagingEmbedding.js", () => ({
    generatePackagingEmbedding: (...args: unknown[]) => mockGeneratePackaging(...args),
}));

vi.mock("../thumbnailDescription.js", () => ({
    generateThumbnailDescription: (...args: unknown[]) => mockGenerateThumbnailDesc(...args),
}));

vi.mock("../visualEmbedding.js", () => ({
    generateVisualEmbedding: (...args: unknown[]) => mockGenerateVisual(...args),
}));

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: {
        vector: (arr: number[]) => ({ __type: "vector", value: arr }),
    },
}));

import { processOneVideo, type VideoInput } from "../processOneVideo.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_VECTOR = Array.from({ length: 768 }, () => 0.1);
const MOCK_VISUAL_VECTOR = Array.from({ length: 1408 }, () => 0.05);
const MOCK_THUMBNAIL = { buffer: Buffer.from("fake-image"), mimeType: "image/jpeg" };

function makeInput(overrides: Partial<VideoInput> = {}): VideoInput {
    return {
        videoId: "vid1",
        youtubeChannelId: "UCabc",
        title: "Test Video",
        tags: ["tag1"],
        description: "A description",
        viewCount: 1000,
        publishedAt: "2026-01-01",
        thumbnailUrl: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
        channelTitle: "Test Channel",
        ...overrides,
    };
}

function embeddingSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data ?? null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processOneVideo", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDocSet.mockResolvedValue(undefined);
        mockDownloadThumbnail.mockResolvedValue(MOCK_THUMBNAIL);
        mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
        mockGenerateThumbnailDesc.mockResolvedValue("A colorful thumbnail");
        mockGenerateVisual.mockResolvedValue(MOCK_VISUAL_VECTOR);
    });

    // =====================================================================
    // New video (no existing doc)
    // =====================================================================

    describe("new video", () => {
        it("generates all embeddings for new video", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(false));

            const result = await processOneVideo(makeInput(), "test-key");

            expect(result.status).toBe("generated");
            expect(result.hasPackaging).toBe(true);
            expect(result.hasVisual).toBe(true);
            expect(result.thumbnailUnavailable).toBe(false);

            expect(mockDownloadThumbnail).toHaveBeenCalledWith("vid1");
            expect(mockGeneratePackaging).toHaveBeenCalled();
            expect(mockGenerateThumbnailDesc).toHaveBeenCalledWith(
                "vid1", MOCK_THUMBNAIL, "test-key",
            );
            expect(mockGenerateVisual).toHaveBeenCalledWith(
                "vid1", MOCK_THUMBNAIL,
            );

            expect(mockDocSet).toHaveBeenCalledWith(
                "globalVideoEmbeddings/vid1",
                expect.objectContaining({
                    videoId: "vid1",
                    packagingEmbedding: { __type: "vector", value: MOCK_VECTOR },
                    thumbnailDescription: "A colorful thumbnail",
                    visualEmbedding: { __type: "vector", value: MOCK_VISUAL_VECTOR },
                    failCount: 0,
                }),
                { merge: true },
            );
        });

        it("downloads thumbnail only once for description + visual", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(false));

            await processOneVideo(makeInput(), "test-key");

            expect(mockDownloadThumbnail).toHaveBeenCalledTimes(1);
        });
    });

    // =====================================================================
    // Already current
    // =====================================================================

    describe("already current", () => {
        it("returns alreadyCurrent when all embeddings are up to date", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(true, {
                packagingEmbeddingVersion: 1,
                visualEmbeddingVersion: 1,
                title: "Test Video",
                tags: ["tag1"],
                viewCount: 1000,
                thumbnailDescription: "existing desc",
                packagingEmbedding: MOCK_VECTOR,
                visualEmbedding: MOCK_VISUAL_VECTOR,
            }));

            const result = await processOneVideo(makeInput(), "test-key");

            expect(result.status).toBe("alreadyCurrent");
            expect(result.hasPackaging).toBe(true);
            expect(result.hasVisual).toBe(true);
            expect(mockDownloadThumbnail).not.toHaveBeenCalled();
            expect(mockGeneratePackaging).not.toHaveBeenCalled();
        });

        it("updates denormalized viewCount when changed", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(true, {
                packagingEmbeddingVersion: 1,
                visualEmbeddingVersion: 1,
                title: "Test Video",
                tags: ["tag1"],
                viewCount: 500, // old count
                thumbnailDescription: "existing",
                packagingEmbedding: MOCK_VECTOR,
                visualEmbedding: MOCK_VISUAL_VECTOR,
            }));

            await processOneVideo(makeInput({ viewCount: 1000 }), "test-key");

            expect(mockDocSet).toHaveBeenCalledWith(
                "globalVideoEmbeddings/vid1",
                expect.objectContaining({ viewCount: 1000, title: "Test Video" }),
                { merge: true },
            );
        });
    });

    // =====================================================================
    // Thumbnail unavailable
    // =====================================================================

    describe("thumbnail unavailable", () => {
        it("marks thumbnailUnavailable when download fails", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(false));
            mockDownloadThumbnail.mockResolvedValue(null);

            const result = await processOneVideo(makeInput(), "test-key");

            expect(result.status).toBe("generated");
            expect(result.thumbnailUnavailable).toBe(true);
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "processOneVideo:thumbnailUnavailable",
                { videoId: "vid1" },
            );

            // Packaging still generated (doesn't need thumbnail)
            expect(mockGeneratePackaging).toHaveBeenCalled();

            // Thumbnail-dependent generators NOT called
            expect(mockGenerateThumbnailDesc).not.toHaveBeenCalled();
            expect(mockGenerateVisual).not.toHaveBeenCalled();

            // Doc written with thumbnailUnavailable flag
            expect(mockDocSet).toHaveBeenCalledWith(
                "globalVideoEmbeddings/vid1",
                expect.objectContaining({
                    thumbnailUnavailable: true,
                    packagingEmbedding: { __type: "vector", value: MOCK_VECTOR },
                }),
                { merge: true },
            );
        });

        it("skips thumbnail-dependent work when flag already set", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(true, {
                packagingEmbeddingVersion: 1,
                visualEmbeddingVersion: 1,
                title: "Test Video",
                tags: ["tag1"],
                thumbnailDescription: null,
                thumbnailUnavailable: true,
                packagingEmbedding: MOCK_VECTOR,
            }));

            const result = await processOneVideo(makeInput(), "test-key");

            expect(result.status).toBe("alreadyCurrent");
            expect(mockDownloadThumbnail).not.toHaveBeenCalled();
        });
    });

    // =====================================================================
    // Re-generation triggers
    // =====================================================================

    describe("re-generation", () => {
        it("re-generates packaging when title changes", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(true, {
                packagingEmbeddingVersion: 1,
                visualEmbeddingVersion: 1,
                title: "Old Title",
                tags: ["tag1"],
                thumbnailDescription: "existing",
                packagingEmbedding: MOCK_VECTOR,
                visualEmbedding: MOCK_VISUAL_VECTOR,
            }));

            const result = await processOneVideo(
                makeInput({ title: "New Title" }), "test-key",
            );

            expect(result.status).toBe("generated");
            expect(mockGeneratePackaging).toHaveBeenCalled();
            // Visual and description not re-generated (still current)
            expect(mockDownloadThumbnail).not.toHaveBeenCalled();
        });

        it("re-generates packaging when tags change", async () => {
            mockDocGet.mockResolvedValue(embeddingSnap(true, {
                packagingEmbeddingVersion: 1,
                visualEmbeddingVersion: 1,
                title: "Test Video",
                tags: ["old-tag"],
                thumbnailDescription: "existing",
                packagingEmbedding: MOCK_VECTOR,
                visualEmbedding: MOCK_VISUAL_VECTOR,
            }));

            const result = await processOneVideo(makeInput(), "test-key");

            expect(result.status).toBe("generated");
            expect(mockGeneratePackaging).toHaveBeenCalled();
        });
    });

    // =====================================================================
    // Error handling
    // =====================================================================

    describe("error handling", () => {
        it("returns failed and increments failCount on error", async () => {
            mockDocGet.mockImplementation((path: string) => {
                if (path === "globalVideoEmbeddings/vid1") {
                    return Promise.resolve(embeddingSnap(true, { failCount: 1 }));
                }
                return Promise.resolve(embeddingSnap(false));
            });
            mockGeneratePackaging.mockRejectedValue(new Error("API error"));
            mockGenerateThumbnailDesc.mockRejectedValue(new Error("API error"));
            mockGenerateVisual.mockRejectedValue(new Error("API error"));

            const result = await processOneVideo(makeInput(), "test-key");

            expect(result.status).toBe("failed");
            expect(mockDocSet).toHaveBeenCalledWith(
                "globalVideoEmbeddings/vid1",
                expect.objectContaining({ failCount: 2 }),
                { merge: true },
            );
        });

        it("logs persistent failure when failCount reaches 3", async () => {
            mockDocGet.mockImplementation((path: string) => {
                if (path === "globalVideoEmbeddings/vid1") {
                    return Promise.resolve(embeddingSnap(true, { failCount: 2 }));
                }
                return Promise.resolve(embeddingSnap(false));
            });
            mockGeneratePackaging.mockRejectedValue(new Error("fail"));
            mockGenerateThumbnailDesc.mockRejectedValue(new Error("fail"));
            mockGenerateVisual.mockRejectedValue(new Error("fail"));

            await processOneVideo(makeInput(), "test-key");

            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "processOneVideo:persistentFailure",
                expect.objectContaining({ videoId: "vid1", failCount: 3 }),
            );
        });
    });
});

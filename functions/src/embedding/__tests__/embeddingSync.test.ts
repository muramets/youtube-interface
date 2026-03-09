import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
    mockCollectionGroupGet,
    mockCollectionGet,
    mockDocGet,
    mockDocSet,
    mockLoggerInfo,
    mockLoggerWarn,
    mockCheckBudget,
    mockRecordCost,
    mockGeneratePackaging,
    mockGenerateThumbnailDesc,
    mockGenerateVisual,
} = vi.hoisted(() => ({
    mockCollectionGroupGet: vi.fn(),
    mockCollectionGet: vi.fn(),
    mockDocGet: vi.fn(),
    mockDocSet: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockCheckBudget: vi.fn(),
    mockRecordCost: vi.fn(),
    mockGeneratePackaging: vi.fn(),
    mockGenerateThumbnailDesc: vi.fn(),
    mockGenerateVisual: vi.fn(),
}));

vi.mock("../../shared/db.js", () => ({
    db: {
        collectionGroup: () => ({ get: mockCollectionGroupGet }),
        collection: () => ({ get: mockCollectionGet }),
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            set: (data: unknown, opts: unknown) => mockDocSet(path, data, opts),
        }),
    },
}));

vi.mock("firebase-functions/v2", () => ({
    logger: {
        info: mockLoggerInfo,
        warn: mockLoggerWarn,
        error: vi.fn(),
    },
}));

vi.mock("../budgetTracker.js", () => ({
    checkBudget: (...args: unknown[]) => mockCheckBudget(...args),
    recordCost: (...args: unknown[]) => mockRecordCost(...args),
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

import { syncEmbeddings, discoverChannels } from "../embeddingSync.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrendChannelDoc(youtubeChannelId: string, userId: string, channelId: string) {
    return {
        id: youtubeChannelId,
        ref: {
            path: `users/${userId}/channels/${channelId}/trendChannels/${youtubeChannelId}`,
        },
    };
}

function makeVideoDoc(videoId: string, data: Record<string, unknown> = {}) {
    return {
        id: videoId,
        data: () => ({
            title: `Video ${videoId}`,
            tags: ["tag1"],
            description: "A description",
            viewCount: 1000,
            publishedAt: "2026-01-01",
            thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            channelTitle: "Test Channel",
            ...data,
        }),
    };
}

function embeddingSnap(exists: boolean, data?: Partial<Record<string, unknown>>) {
    return {
        exists,
        data: () => data ?? null,
    };
}

const MOCK_VECTOR = Array.from({ length: 768 }, () => 0.1);
const MOCK_VISUAL_VECTOR = Array.from({ length: 1408 }, () => 0.05);

// ---------------------------------------------------------------------------
// discoverChannels
// ---------------------------------------------------------------------------

describe("discoverChannels", () => {
    beforeEach(() => vi.clearAllMocks());

    it("deduplicates channels tracked by multiple users", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [
                makeTrendChannelDoc("UCabc", "user1", "ch1"),
                makeTrendChannelDoc("UCabc", "user2", "ch2"), // duplicate
                makeTrendChannelDoc("UCxyz", "user1", "ch1"),
            ],
        });

        const channels = await discoverChannels();

        expect(channels.size).toBe(2);
        expect(channels.has("UCabc")).toBe(true);
        expect(channels.has("UCxyz")).toBe(true);
        // First user's path wins
        expect(channels.get("UCabc")!.userId).toBe("user1");
    });
});

// ---------------------------------------------------------------------------
// syncEmbeddings
// ---------------------------------------------------------------------------

describe("syncEmbeddings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckBudget.mockResolvedValue({ allowed: true, remaining: 5, currentCost: 0 });
        mockRecordCost.mockResolvedValue(undefined);
        mockDocSet.mockResolvedValue(undefined);
        mockGenerateVisual.mockResolvedValue(MOCK_VISUAL_VECTOR);
    });

    it("creates new embedding doc for undiscovered video", async () => {
        // Discovery: 1 channel
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        // Videos for channel
        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        // No existing embedding doc
        mockDocGet.mockResolvedValue(embeddingSnap(false));

        // Generators
        mockGeneratePackaging.mockResolvedValueOnce(MOCK_VECTOR);
        mockGenerateThumbnailDesc.mockResolvedValueOnce("A colorful thumbnail");

        const result = await syncEmbeddings("test-key");

        expect(result.discovered).toBe(1);
        expect(result.generated).toBe(1);
        expect(result.alreadyCurrent).toBe(0);
        expect(result.failed).toBe(0);

        // Verify doc was written with all embedding types
        expect(mockDocSet).toHaveBeenCalledWith(
            "globalVideoEmbeddings/vid1",
            expect.objectContaining({
                videoId: "vid1",
                packagingEmbedding: MOCK_VECTOR,
                thumbnailDescription: "A colorful thumbnail",
                visualEmbedding: MOCK_VISUAL_VECTOR,
                visualEmbeddingVersion: 1,
            }),
            { merge: true },
        );
    });

    it("skips video with current version (alreadyCurrent)", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        // Existing embedding doc — current version for all types, same title/tags
        mockDocGet.mockImplementation((path: string) => {
            if (path === "globalVideoEmbeddings/vid1") {
                return Promise.resolve(embeddingSnap(true, {
                    packagingEmbeddingVersion: 1,
                    visualEmbeddingVersion: 1,
                    title: "Video vid1",
                    tags: ["tag1"],
                    viewCount: 1000,
                    thumbnailDescription: "existing description",
                    packagingEmbedding: MOCK_VECTOR,
                    visualEmbedding: MOCK_VISUAL_VECTOR,
                }));
            }
            return Promise.resolve(embeddingSnap(false));
        });

        const result = await syncEmbeddings("test-key");

        expect(result.alreadyCurrent).toBe(1);
        expect(result.generated).toBe(0);
        expect(mockGeneratePackaging).not.toHaveBeenCalled();
        expect(mockGenerateVisual).not.toHaveBeenCalled();
    });

    it("re-generates when title changes", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1", { title: "New Title" })],
        });

        // Existing doc with old title (visual current — only packaging re-generates)
        mockDocGet.mockImplementation((path: string) => {
            if (path === "globalVideoEmbeddings/vid1") {
                return Promise.resolve(embeddingSnap(true, {
                    packagingEmbeddingVersion: 1,
                    visualEmbeddingVersion: 1,
                    title: "Old Title",
                    tags: ["tag1"],
                    viewCount: 1000,
                    thumbnailDescription: "existing",
                    packagingEmbedding: MOCK_VECTOR,
                    visualEmbedding: MOCK_VISUAL_VECTOR,
                }));
            }
            return Promise.resolve(embeddingSnap(false));
        });

        mockGeneratePackaging.mockResolvedValueOnce(MOCK_VECTOR);

        const result = await syncEmbeddings("test-key");

        expect(result.generated).toBe(1);
        expect(mockGeneratePackaging).toHaveBeenCalled();
    });

    it("re-generates when version is outdated", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        mockDocGet.mockImplementation((path: string) => {
            if (path === "globalVideoEmbeddings/vid1") {
                return Promise.resolve(embeddingSnap(true, {
                    packagingEmbeddingVersion: 0, // outdated
                    visualEmbeddingVersion: 1,
                    title: "Video vid1",
                    tags: ["tag1"],
                    viewCount: 1000,
                    thumbnailDescription: "existing",
                    packagingEmbedding: MOCK_VECTOR,
                    visualEmbedding: MOCK_VISUAL_VECTOR,
                }));
            }
            return Promise.resolve(embeddingSnap(false));
        });

        mockGeneratePackaging.mockResolvedValueOnce(MOCK_VECTOR);

        const result = await syncEmbeddings("test-key");

        expect(result.generated).toBe(1);
    });

    it("returns early with skippedBudget when budget exhausted", async () => {
        mockCheckBudget.mockResolvedValue({ allowed: false, remaining: 0, currentCost: 5 });

        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 3,
            docs: [makeVideoDoc("v1"), makeVideoDoc("v2"), makeVideoDoc("v3")],
        });

        const result = await syncEmbeddings("test-key");

        expect(result.skippedBudget).toBe(3);
        expect(result.generated).toBe(0);
        expect(mockGeneratePackaging).not.toHaveBeenCalled();
    });

    it("continues processing when single video fails", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 2,
            docs: [makeVideoDoc("vid1"), makeVideoDoc("vid2")],
        });

        // vid1: no existing doc → generate
        // vid2: no existing doc → generate
        mockDocGet.mockResolvedValue(embeddingSnap(false));

        // vid1 fails, vid2 succeeds
        mockGeneratePackaging
            .mockRejectedValueOnce(new Error("API error"))
            .mockResolvedValueOnce(MOCK_VECTOR);

        mockGenerateThumbnailDesc
            .mockRejectedValueOnce(new Error("API error"))
            .mockResolvedValueOnce("Description for vid2");

        const result = await syncEmbeddings("test-key");

        expect(result.failed).toBe(1);
        expect(result.generated).toBe(1);
    });

    it("logs warning for persistent failures (failCount >= 3)", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        // Existing doc with failCount 2 → will become 3
        mockDocGet.mockImplementation((path: string) => {
            if (path === "globalVideoEmbeddings/vid1") {
                return Promise.resolve(embeddingSnap(true, {
                    failCount: 2,
                    packagingEmbeddingVersion: 0, // outdated, triggers generation
                    title: "Video vid1",
                    tags: ["tag1"],
                }));
            }
            return Promise.resolve(embeddingSnap(false));
        });

        mockGeneratePackaging.mockRejectedValueOnce(new Error("Persistent error"));
        mockGenerateThumbnailDesc.mockRejectedValueOnce(new Error("Persistent error"));

        await syncEmbeddings("test-key");

        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "embeddingSync:persistentFailure",
            expect.objectContaining({ videoId: "vid1", failCount: 3 }),
        );
    });

    it("warns on empty discovery (no trend channels)", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({ docs: [] });

        const result = await syncEmbeddings("test-key");

        expect(result.discovered).toBe(0);
        expect(mockLoggerWarn).toHaveBeenCalledWith("embeddingSync:noVideosFound");
    });

    it("warns on high failure rate (>10%)", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        // 5 videos, 3 fail (>10%)
        mockCollectionGet.mockResolvedValueOnce({
            size: 5,
            docs: [
                makeVideoDoc("v1"), makeVideoDoc("v2"), makeVideoDoc("v3"),
                makeVideoDoc("v4"), makeVideoDoc("v5"),
            ],
        });

        mockDocGet.mockResolvedValue(embeddingSnap(false));

        // 3 fail, 2 succeed
        mockGeneratePackaging
            .mockRejectedValueOnce(new Error("fail"))
            .mockRejectedValueOnce(new Error("fail"))
            .mockRejectedValueOnce(new Error("fail"))
            .mockResolvedValueOnce(MOCK_VECTOR)
            .mockResolvedValueOnce(MOCK_VECTOR);
        mockGenerateThumbnailDesc
            .mockRejectedValueOnce(new Error("fail"))
            .mockRejectedValueOnce(new Error("fail"))
            .mockRejectedValueOnce(new Error("fail"))
            .mockResolvedValueOnce("desc")
            .mockResolvedValueOnce("desc");

        await syncEmbeddings("test-key");

        expect(mockLoggerWarn).toHaveBeenCalledWith(
            "embeddingSync:highFailureRate",
            expect.objectContaining({ generated: 2, failed: 3 }),
        );
    });

    it("generates visual embedding alongside packaging for new video", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        mockDocGet.mockResolvedValue(embeddingSnap(false));
        mockGeneratePackaging.mockResolvedValueOnce(MOCK_VECTOR);
        mockGenerateThumbnailDesc.mockResolvedValueOnce("desc");
        mockGenerateVisual.mockResolvedValueOnce(MOCK_VISUAL_VECTOR);

        await syncEmbeddings("test-key");

        expect(mockGenerateVisual).toHaveBeenCalledWith("vid1");
        const embeddingCall = mockDocSet.mock.calls.find(
            (c: unknown[]) => c[0] === "globalVideoEmbeddings/vid1",
        );
        expect(embeddingCall![1]).toEqual(
            expect.objectContaining({
                visualEmbedding: MOCK_VISUAL_VECTOR,
                visualEmbeddingVersion: 1,
            }),
        );
    });

    it("saves packaging when visual fails (partial save)", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        mockDocGet.mockResolvedValue(embeddingSnap(false));
        mockGeneratePackaging.mockResolvedValueOnce(MOCK_VECTOR);
        mockGenerateThumbnailDesc.mockResolvedValueOnce("desc");
        mockGenerateVisual.mockResolvedValueOnce(null); // visual failed

        const result = await syncEmbeddings("test-key");

        expect(result.generated).toBe(1);

        const embeddingCall = mockDocSet.mock.calls.find(
            (c: unknown[]) => c[0] === "globalVideoEmbeddings/vid1",
        );
        expect(embeddingCall![1]).toEqual(
            expect.objectContaining({
                packagingEmbedding: MOCK_VECTOR,
                visualEmbedding: null, // saved as null
                visualEmbeddingVersion: 1,
            }),
        );
    });

    it("writes coverage stats to system/embeddingStats", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        mockDocGet.mockResolvedValue(embeddingSnap(false));
        mockGeneratePackaging.mockResolvedValueOnce(MOCK_VECTOR);
        mockGenerateThumbnailDesc.mockResolvedValueOnce("desc");

        await syncEmbeddings("test-key");

        // Find the call that wrote to embeddingStats
        const statsCall = mockDocSet.mock.calls.find(
            (c: unknown[]) => c[0] === "system/embeddingStats",
        );
        expect(statsCall).toBeDefined();
        expect(statsCall![1]).toEqual(
            expect.objectContaining({
                byChannel: {
                    UCabc: { packaging: 1, visual: 1, total: 1 },
                },
                updatedAt: expect.any(Number),
            }),
        );
    });

    it("logs complete summary", async () => {
        mockCollectionGroupGet.mockResolvedValueOnce({
            docs: [makeTrendChannelDoc("UCabc", "user1", "ch1")],
        });

        mockCollectionGet.mockResolvedValueOnce({
            size: 1,
            docs: [makeVideoDoc("vid1")],
        });

        mockDocGet.mockResolvedValue(embeddingSnap(false));
        mockGeneratePackaging.mockResolvedValueOnce(MOCK_VECTOR);
        mockGenerateThumbnailDesc.mockResolvedValueOnce("desc");

        const result = await syncEmbeddings("test-key");

        expect(mockLoggerInfo).toHaveBeenCalledWith(
            "embeddingSync:complete",
            expect.objectContaining({
                discovered: 1,
                generated: 1,
                alreadyCurrent: 0,
                failed: 0,
                skippedBudget: 0,
            }),
        );

        expect(result.durationMs).toBeGreaterThanOrEqual(0);
        expect(result.estimatedCost).toBeGreaterThan(0);
    });
});

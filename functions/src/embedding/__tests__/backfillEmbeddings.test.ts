import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
    mockCollectionGet,
    mockDocGet,
    mockDocSet,
    mockDocDelete,
    mockLoggerInfo,
    mockLoggerWarn,
    mockLoggerError,
    mockCheckBudget,
    mockRecordCost,
    mockGeneratePackaging,
    mockGenerateThumbnailDesc,
    mockGenerateVisual,
    mockDiscoverChannels,
    mockCreateTask,
    mockQueuePath,
} = vi.hoisted(() => ({
    mockCollectionGet: vi.fn(),
    mockDocGet: vi.fn(),
    mockDocSet: vi.fn(),
    mockDocDelete: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerError: vi.fn(),
    mockCheckBudget: vi.fn(),
    mockRecordCost: vi.fn(),
    mockGeneratePackaging: vi.fn(),
    mockGenerateThumbnailDesc: vi.fn(),
    mockGenerateVisual: vi.fn(),
    mockDiscoverChannels: vi.fn(),
    mockCreateTask: vi.fn(),
    mockQueuePath: vi.fn().mockReturnValue(
        "projects/test-project/locations/us-central1/queues/embedding-backfill",
    ),
}));

vi.mock("../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            set: (data: unknown, opts?: unknown) => mockDocSet(path, data, opts),
            delete: () => mockDocDelete(path),
        }),
        collection: (path: string) => ({
            get: () => mockCollectionGet(path),
        }),
    },
}));

vi.mock("firebase-functions/v2", () => ({
    logger: {
        info: mockLoggerInfo,
        warn: mockLoggerWarn,
        error: mockLoggerError,
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

vi.mock("../embeddingSync.js", () => ({
    discoverChannels: (...args: unknown[]) => mockDiscoverChannels(...args),
}));

vi.mock("@google-cloud/tasks", () => ({
    CloudTasksClient: class {
        queuePath(...args: unknown[]) { return mockQueuePath(...args); }
        createTask(...args: unknown[]) { return mockCreateTask(...args); }
    },
}));

import { processBackfill } from "../backfillEmbeddings.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_VECTOR = Array.from({ length: 768 }, () => 0.1);
const MOCK_VISUAL_VECTOR = Array.from({ length: 1408 }, () => 0.05);
const SELF_URL = "https://backfill-abc-uc.a.run.app";

function makeChannelMap(channels: Array<{ id: string; userId: string; channelId: string }>) {
    const map = new Map<string, { userId: string; channelId: string; trendChannelId: string }>();
    for (const ch of channels) {
        map.set(ch.id, { userId: ch.userId, channelId: ch.channelId, trendChannelId: ch.id });
    }
    return map;
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

function embeddingSnap(exists: boolean, data?: Record<string, unknown>) {
    return {
        exists,
        data: () => data ?? null,
    };
}

function videoDocSnap(exists: boolean, data?: Record<string, unknown>) {
    return {
        exists,
        data: () => data ?? null,
    };
}

/**
 * Create a mock backfillState doc snapshot.
 * Pads the videos array with dummy entries so that `testVideos`
 * start at the given `offset` in the array (for correct slicing).
 */
function backfillStateAtOffset(
    offset: number,
    testVideos: Array<{ videoId: string; youtubeChannelId: string }>,
    channels: Array<{ id: string; userId: string; channelId: string }>,
) {
    const channelPaths: Record<string, { userId: string; channelId: string; trendChannelId: string }> = {};
    for (const ch of channels) {
        channelPaths[ch.id] = { userId: ch.userId, channelId: ch.channelId, trendChannelId: ch.id };
    }
    const padding = Array.from({ length: offset }, (_, i) => ({
        videoId: `_pad_${String(i).padStart(4, "0")}`,
        youtubeChannelId: channels[0].id,
    }));
    const allVideos = [...padding, ...testVideos];
    return {
        exists: true,
        data: () => ({
            channelPaths,
            videos: allVideos,
            totalVideos: allVideos.length,
            createdAt: Date.now(),
        }),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processBackfill", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckBudget.mockResolvedValue({ allowed: true, remaining: 5, currentCost: 0 });
        mockRecordCost.mockResolvedValue(undefined);
        mockDocSet.mockResolvedValue(undefined);
        mockDocDelete.mockResolvedValue(undefined);
        mockCreateTask.mockResolvedValue([]);
        mockGenerateVisual.mockResolvedValue(MOCK_VISUAL_VECTOR);
        process.env.GCLOUD_PROJECT = "test-project";
    });

    // =======================================================================
    // Batch 0 — Discovery
    // =======================================================================

    describe("batch 0 (discovery)", () => {
        it("discovers channels, writes backfillState, processes first batch", async () => {
            // Discovery: 1 channel with 2 videos
            mockDiscoverChannels.mockResolvedValueOnce(
                makeChannelMap([{ id: "UCabc", userId: "user1", channelId: "ch1" }]),
            );

            // Video collection for channel
            mockCollectionGet.mockResolvedValueOnce({
                docs: [makeVideoDoc("vid1"), makeVideoDoc("vid2")],
            });

            // backfillState does not exist
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve({ exists: false, data: () => null });
                }
                // Embedding docs don't exist
                if (path.startsWith("globalVideoEmbeddings/")) {
                    return Promise.resolve(embeddingSnap(false));
                }
                // Video docs for description
                const videoId = path.split("/").pop();
                return Promise.resolve(videoDocSnap(true, {
                    title: `Video ${videoId}`,
                    tags: ["tag1"],
                    description: "A description",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: "Test Channel",
                }));
            });

            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockResolvedValue("A colorful thumbnail");

            const result = await processBackfill({ apiKey: "test-key", offset: 0, selfUrl: SELF_URL });

            // State was written
            expect(mockDocSet).toHaveBeenCalledWith(
                "system/backfillState",
                expect.objectContaining({
                    totalVideos: 2,
                    videos: expect.arrayContaining([
                        expect.objectContaining({ videoId: "vid1" }),
                        expect.objectContaining({ videoId: "vid2" }),
                    ]),
                }),
                undefined,
            );

            // Videos were processed
            expect(result.body).toMatchObject({
                batchGenerated: 2,
                batchFailed: 0,
                totalProcessed: 2,
                message: "Backfill complete",
            });
        });

        it("returns early when no channels found", async () => {
            mockDiscoverChannels.mockResolvedValueOnce(new Map());
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve({ exists: false, data: () => null });
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 0, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({
                message: "No trend channels found",
                totalVideos: 0,
            });
            expect(mockLoggerWarn).toHaveBeenCalledWith("backfill:noChannelsFound");
        });
    });

    // =======================================================================
    // Batch 1+ — From state
    // =======================================================================

    describe("batch 1+ (from state)", () => {
        it("reads backfillState and slices by offset", async () => {
            const videos = Array.from({ length: 150 }, (_, i) => ({
                videoId: `vid${String(i).padStart(3, "0")}`,
                youtubeChannelId: "UCabc",
            }));

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve({
                        exists: true,
                        data: () => ({
                            channelPaths: {
                                UCabc: { userId: "user1", channelId: "ch1", trendChannelId: "UCabc" },
                            },
                            videos,
                            totalVideos: 150,
                            createdAt: Date.now(),
                        }),
                    });
                }
                if (path.startsWith("globalVideoEmbeddings/")) {
                    return Promise.resolve(embeddingSnap(false));
                }
                // Video docs for description
                return Promise.resolve(videoDocSnap(true, {
                    title: "A video",
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: "https://i.ytimg.com/vi/x/mqdefault.jpg",
                    channelTitle: "Test Channel",
                }));
            });

            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockResolvedValue("thumbnail desc");

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // Should NOT call discoverChannels (reads from state)
            expect(mockDiscoverChannels).not.toHaveBeenCalled();

            // Processed batch of 50 (150 - 100)
            expect(result.body).toMatchObject({
                batch: 1,
                totalProcessed: 150,
                totalRemaining: 0,
                message: "Backfill complete",
            });
        });

        it("reads video doc from trendChannel for description", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                if (path === "globalVideoEmbeddings/vid1") {
                    return Promise.resolve(embeddingSnap(false));
                }
                if (path === "users/user1/channels/ch1/trendChannels/UCabc/videos/vid1") {
                    return Promise.resolve(videoDocSnap(true, {
                        title: "Video vid1",
                        tags: ["special"],
                        description: "Special description for packaging",
                        viewCount: 5000,
                        publishedAt: "2026-02-01",
                        thumbnail: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
                        channelTitle: "Test Channel",
                    }));
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockResolvedValue("desc");

            await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // Verify packaging was called with description from video doc
            expect(mockGeneratePackaging).toHaveBeenCalledWith(
                "Video vid1",
                ["special"],
                "Special description for packaging",
                "test-key",
            );
        });

        it("skips videos with current version (idempotent)", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [
                            { videoId: "vid1", youtubeChannelId: "UCabc" },
                            { videoId: "vid2", youtubeChannelId: "UCabc" },
                        ],
                        channels,
                    ));
                }
                if (path === "globalVideoEmbeddings/vid1") {
                    // vid1: all current → skip
                    return Promise.resolve(embeddingSnap(true, {
                        packagingEmbeddingVersion: 1,
                        thumbnailDescription: "existing desc",
                        visualEmbeddingVersion: 1,
                    }));
                }
                if (path === "globalVideoEmbeddings/vid2") {
                    // vid2: no embedding doc → needs generation
                    return Promise.resolve(embeddingSnap(false));
                }
                // Video doc for vid2
                return Promise.resolve(videoDocSnap(true, {
                    title: "Video vid2",
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: "https://i.ytimg.com/vi/vid2/mqdefault.jpg",
                    channelTitle: "Test Channel",
                }));
            });

            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockResolvedValue("desc");

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // Only vid2 was generated (vid1 skipped)
            expect(result.body).toMatchObject({ batchGenerated: 1 });
            expect(mockGeneratePackaging).toHaveBeenCalledTimes(1);
        });

        it("generates 0 when all videos are current", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [
                            { videoId: "vid1", youtubeChannelId: "UCabc" },
                            { videoId: "vid2", youtubeChannelId: "UCabc" },
                        ],
                        channels,
                    ));
                }
                // Both have all current versions
                if (path.startsWith("globalVideoEmbeddings/")) {
                    return Promise.resolve(embeddingSnap(true, {
                        packagingEmbeddingVersion: 1,
                        thumbnailDescription: "existing",
                        visualEmbeddingVersion: 1,
                    }));
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchGenerated: 0 });
            expect(mockGeneratePackaging).not.toHaveBeenCalled();
            expect(mockGenerateThumbnailDesc).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // Chain control
    // =======================================================================

    describe("chain control", () => {
        it("enqueues next batch when more videos remain", async () => {
            // 250 videos total, offset 100 → batch of 100, 50 remaining → enqueue offset=200
            const videos = Array.from({ length: 250 }, (_, i) => ({
                videoId: `vid${String(i).padStart(3, "0")}`,
                youtubeChannelId: "UCabc",
            }));

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve({
                        exists: true,
                        data: () => ({
                            channelPaths: {
                                UCabc: { userId: "user1", channelId: "ch1", trendChannelId: "UCabc" },
                            },
                            videos,
                            totalVideos: 250,
                            createdAt: Date.now(),
                        }),
                    });
                }
                if (path.startsWith("globalVideoEmbeddings/")) {
                    // All already have current versions → skip generation
                    return Promise.resolve(embeddingSnap(true, {
                        packagingEmbeddingVersion: 1,
                        thumbnailDescription: "existing",
                        visualEmbeddingVersion: 1,
                    }));
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({
                message: "Batch complete, next enqueued",
                totalRemaining: 50,
            });

            // Cloud Task was created with offset=200
            expect(mockCreateTask).toHaveBeenCalledWith(
                expect.objectContaining({
                    parent: "projects/test-project/locations/us-central1/queues/embedding-backfill",
                    task: expect.objectContaining({
                        httpRequest: expect.objectContaining({
                            url: SELF_URL,
                            body: Buffer.from(JSON.stringify({ offset: 200 })).toString("base64"),
                        }),
                    }),
                }),
            );
        });

        it("last batch deletes backfillState and does NOT enqueue", async () => {
            // 50 remaining (< BATCH_SIZE)
            const videos = Array.from({ length: 150 }, (_, i) => ({
                videoId: `vid${String(i).padStart(3, "0")}`,
                youtubeChannelId: "UCabc",
            }));

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve({
                        exists: true,
                        data: () => ({
                            channelPaths: {
                                UCabc: { userId: "user1", channelId: "ch1", trendChannelId: "UCabc" },
                            },
                            videos,
                            totalVideos: 150,
                            createdAt: Date.now(),
                        }),
                    });
                }
                if (path.startsWith("globalVideoEmbeddings/")) {
                    return Promise.resolve(embeddingSnap(true, {
                        packagingEmbeddingVersion: 1,
                        thumbnailDescription: "existing",
                    }));
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ message: "Backfill complete" });
            expect(mockDocDelete).toHaveBeenCalledWith("system/backfillState");
            expect(mockCreateTask).not.toHaveBeenCalled();
            expect(mockLoggerInfo).toHaveBeenCalledWith(
                "backfill:complete",
                expect.objectContaining({ totalProcessed: 150 }),
            );
        });

        it("budget exhausted stops chain, does NOT enqueue, does NOT delete state", async () => {
            mockCheckBudget.mockResolvedValue({ allowed: false, remaining: 0, currentCost: 5 });

            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({
                message: "Budget exhausted — chain stopped",
                batch: 1,
            });
            expect(mockCreateTask).not.toHaveBeenCalled();
            expect(mockDocDelete).not.toHaveBeenCalled();
            expect(mockGeneratePackaging).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // Error handling
    // =======================================================================

    describe("error handling", () => {
        it("continues with next video when one fails", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [
                            { videoId: "vid1", youtubeChannelId: "UCabc" },
                            { videoId: "vid2", youtubeChannelId: "UCabc" },
                        ],
                        channels,
                    ));
                }
                if (path.startsWith("globalVideoEmbeddings/")) {
                    return Promise.resolve(embeddingSnap(false));
                }
                // Video docs
                return Promise.resolve(videoDocSnap(true, {
                    title: "A video",
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: "https://i.ytimg.com/vi/x/mqdefault.jpg",
                    channelTitle: "Test Channel",
                }));
            });

            // vid1 fails, vid2 succeeds (mock by videoId argument — order-independent for concurrency)
            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockImplementation(
                (videoId: string) => videoId === "vid1"
                    ? Promise.reject(new Error("API error"))
                    : Promise.resolve("desc for vid2"),
            );

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({
                batchGenerated: 1,
                batchFailed: 1,
            });
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "backfill:videoFailed",
                expect.objectContaining({ videoId: "vid1" }),
            );
        });

        it("logs batch summary with correct counts", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                if (path.startsWith("globalVideoEmbeddings/")) {
                    return Promise.resolve(embeddingSnap(false));
                }
                return Promise.resolve(videoDocSnap(true, {
                    title: "Video",
                    tags: [],
                    description: "",
                    viewCount: 100,
                    publishedAt: "2026-01-01",
                    thumbnail: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
                    channelTitle: "Ch",
                }));
            });

            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockResolvedValue("desc");

            await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(mockLoggerInfo).toHaveBeenCalledWith(
                "backfill:batchComplete",
                expect.objectContaining({
                    batch: 1,
                    batchGenerated: 1,
                    batchFailed: 0,
                    totalProcessed: 101,
                    totalRemaining: 0,
                    estimatedCost: expect.any(Number),
                }),
            );
        });
    });

    // =======================================================================
    // Visual embedding
    // =======================================================================

    describe("visual embedding", () => {
        it("generates visual embedding alongside packaging + description", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                if (path === "globalVideoEmbeddings/vid1") {
                    return Promise.resolve(embeddingSnap(false));
                }
                return Promise.resolve(videoDocSnap(true, {
                    title: "Video vid1",
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
                    channelTitle: "Test Channel",
                }));
            });

            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockResolvedValue("desc");
            mockGenerateVisual.mockResolvedValue(MOCK_VISUAL_VECTOR);

            await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

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

        it("skips visual when visualEmbeddingVersion is current", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                if (path === "globalVideoEmbeddings/vid1") {
                    // Has packaging + description + visual → fully current
                    return Promise.resolve(embeddingSnap(true, {
                        packagingEmbeddingVersion: 1,
                        thumbnailDescription: "existing",
                        visualEmbeddingVersion: 1,
                    }));
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchGenerated: 0 });
            expect(mockGenerateVisual).not.toHaveBeenCalled();
        });

        it("generates only visual when packaging is current but visual is missing", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                if (path === "globalVideoEmbeddings/vid1") {
                    // Has packaging + description, missing visual
                    return Promise.resolve(embeddingSnap(true, {
                        packagingEmbeddingVersion: 1,
                        thumbnailDescription: "existing",
                        packagingEmbedding: MOCK_VECTOR,
                        // no visualEmbeddingVersion → needs visual
                    }));
                }
                return Promise.resolve(videoDocSnap(true, {
                    title: "Video vid1",
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
                    channelTitle: "Test Channel",
                }));
            });

            mockGenerateVisual.mockResolvedValue(MOCK_VISUAL_VECTOR);

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchGenerated: 1 });
            expect(mockGenerateVisual).toHaveBeenCalledWith("vid1");
            // Packaging should NOT be regenerated (reuses existing)
            expect(mockGeneratePackaging).not.toHaveBeenCalled();
        });

        it("saves packaging + description when visual fails (partial save)", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                if (path === "globalVideoEmbeddings/vid1") {
                    return Promise.resolve(embeddingSnap(false));
                }
                return Promise.resolve(videoDocSnap(true, {
                    title: "Video vid1",
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
                    channelTitle: "Test Channel",
                }));
            });

            mockGeneratePackaging.mockResolvedValue(MOCK_VECTOR);
            mockGenerateThumbnailDesc.mockResolvedValue("desc");
            mockGenerateVisual.mockResolvedValue(null); // visual failed

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchGenerated: 1 });

            const embeddingCall = mockDocSet.mock.calls.find(
                (c: unknown[]) => c[0] === "globalVideoEmbeddings/vid1",
            );
            expect(embeddingCall![1]).toEqual(
                expect.objectContaining({
                    packagingEmbedding: MOCK_VECTOR,
                    thumbnailDescription: "desc",
                    visualEmbedding: null,
                    visualEmbeddingVersion: 1,
                }),
            );
        });
    });

    // =======================================================================
    // Resume
    // =======================================================================

    describe("resume", () => {
        it("resumes from existing backfillState with provided offset", async () => {
            // State exists with 300 videos, offset=200 → process batch starting at 200
            const videos = Array.from({ length: 300 }, (_, i) => ({
                videoId: `vid${String(i).padStart(3, "0")}`,
                youtubeChannelId: "UCabc",
            }));

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve({
                        exists: true,
                        data: () => ({
                            channelPaths: {
                                UCabc: { userId: "user1", channelId: "ch1", trendChannelId: "UCabc" },
                            },
                            videos,
                            totalVideos: 300,
                            createdAt: Date.now(),
                        }),
                    });
                }
                if (path.startsWith("globalVideoEmbeddings/")) {
                    return Promise.resolve(embeddingSnap(true, {
                        packagingEmbeddingVersion: 1,
                        thumbnailDescription: "existing",
                        visualEmbeddingVersion: 1,
                    }));
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 200, selfUrl: SELF_URL });

            // Did NOT re-discover
            expect(mockDiscoverChannels).not.toHaveBeenCalled();

            // Processed last 100 videos (300-200)
            expect(result.body).toMatchObject({
                batch: 2,
                totalProcessed: 300,
                totalRemaining: 0,
                message: "Backfill complete",
            });
        });
    });
});

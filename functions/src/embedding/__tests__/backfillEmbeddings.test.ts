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
    mockProcessOneVideo,
    mockDiscoverChannels,
    mockEnqueueBatch,
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
    mockProcessOneVideo: vi.fn(),
    mockDiscoverChannels: vi.fn(),
    mockEnqueueBatch: vi.fn(),
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

vi.mock("../processOneVideo.js", () => ({
    processOneVideo: (...args: unknown[]) => mockProcessOneVideo(...args),
}));

vi.mock("../embeddingSync.js", () => ({
    discoverChannels: (...args: unknown[]) => mockDiscoverChannels(...args),
}));

vi.mock("../taskQueue.js", () => ({
    enqueueBatch: (...args: unknown[]) => mockEnqueueBatch(...args),
    pLimit: () => {
        // Simple pass-through for testing (no actual concurrency limiting needed)
        return <T>(fn: () => Promise<T>) => fn();
    },
}));

import { processBackfill } from "../backfillEmbeddings.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Default ProcessResult returned by mockProcessOneVideo */
function generatedResult() {
    return { status: "generated" as const, hasPackaging: true, hasVisual: true, thumbnailUnavailable: false };
}

function alreadyCurrentResult() {
    return { status: "alreadyCurrent" as const, hasPackaging: true, hasVisual: true, thumbnailUnavailable: false };
}

function failedResult() {
    return { status: "failed" as const, hasPackaging: false, hasVisual: false, thumbnailUnavailable: false };
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
        mockEnqueueBatch.mockResolvedValue(undefined);
        mockProcessOneVideo.mockResolvedValue(generatedResult());
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
                // Video docs for reading video data
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

            // processOneVideo was called for each video
            expect(mockProcessOneVideo).toHaveBeenCalledTimes(2);

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
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
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

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // Should NOT call discoverChannels (reads from state)
            expect(mockDiscoverChannels).not.toHaveBeenCalled();

            // processOneVideo called for 50 videos (150 - 100)
            expect(mockProcessOneVideo).toHaveBeenCalledTimes(50);

            // Processed batch of 50 (150 - 100)
            expect(result.body).toMatchObject({
                batch: 1,
                totalProcessed: 150,
                totalRemaining: 0,
                message: "Backfill complete",
            });
        });

        it("reads video doc from trendChannel and passes correct VideoInput to processOneVideo", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
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

            await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // Verify processOneVideo was called with correct VideoInput built from the video doc
            expect(mockProcessOneVideo).toHaveBeenCalledWith(
                {
                    videoId: "vid1",
                    youtubeChannelId: "UCabc",
                    title: "Video vid1",
                    tags: ["special"],
                    description: "Special description for packaging",
                    viewCount: 5000,
                    publishedAt: "2026-02-01",
                    thumbnailUrl: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
                    channelTitle: "Test Channel",
                },
                "test-key",
            );
        });

        it("counts alreadyCurrent results as neither generated nor failed", async () => {
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
                // Video docs
                const videoId = path.split("/").pop();
                return Promise.resolve(videoDocSnap(true, {
                    title: `Video ${videoId}`,
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: "Test Channel",
                }));
            });

            // vid1 is already current, vid2 generates
            mockProcessOneVideo
                .mockResolvedValueOnce(alreadyCurrentResult())
                .mockResolvedValueOnce(generatedResult());

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // Only vid2 was generated (vid1 was alreadyCurrent — not counted as generated)
            expect(result.body).toMatchObject({ batchGenerated: 1, batchFailed: 0 });
            // processOneVideo was called for BOTH videos
            expect(mockProcessOneVideo).toHaveBeenCalledTimes(2);
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
                // Video docs
                const videoId = path.split("/").pop();
                return Promise.resolve(videoDocSnap(true, {
                    title: `Video ${videoId}`,
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: "Test Channel",
                }));
            });

            // Both videos are already current
            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchGenerated: 0 });
            // processOneVideo IS called for both (it decides internally to skip)
            expect(mockProcessOneVideo).toHaveBeenCalledTimes(2);
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

            // All already current (no cost recorded)
            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({
                message: "Batch complete, next enqueued",
                totalRemaining: 50,
            });

            // enqueueBatch was called with selfUrl and next offset
            expect(mockEnqueueBatch).toHaveBeenCalledWith(SELF_URL, 200);
        });

        it("last batch deletes backfillState and does NOT enqueue", async () => {
            // 150 videos total, offset 100 → batch of 50 (last batch)
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

            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ message: "Backfill complete" });
            expect(mockDocDelete).toHaveBeenCalledWith("system/backfillState");
            expect(mockEnqueueBatch).not.toHaveBeenCalled();
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
            expect(mockEnqueueBatch).not.toHaveBeenCalled();
            expect(mockDocDelete).not.toHaveBeenCalled();
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
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

            // vid1 fails (processOneVideo returns failed), vid2 succeeds
            mockProcessOneVideo
                .mockResolvedValueOnce(failedResult())
                .mockResolvedValueOnce(generatedResult());

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({
                batchGenerated: 1,
                batchFailed: 1,
            });
        });

        it("counts missing video doc as failed", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
                }
                // Video doc does not exist
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchFailed: 1, batchGenerated: 0 });
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "backfill:videoDocNotFound",
                expect.objectContaining({ videoId: "vid1" }),
            );
        });

        it("counts missing channel path as failed", async () => {
            // Create state where channelPaths does NOT include the video's youtubeChannelId
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve({
                        exists: true,
                        data: () => ({
                            channelPaths: {
                                // No entry for "UCmissing"
                                UCabc: { userId: "user1", channelId: "ch1", trendChannelId: "UCabc" },
                            },
                            videos: [
                                ...Array.from({ length: 100 }, (_, i) => ({
                                    videoId: `_pad_${String(i).padStart(4, "0")}`,
                                    youtubeChannelId: "UCabc",
                                })),
                                { videoId: "vid1", youtubeChannelId: "UCmissing" },
                            ],
                            totalVideos: 101,
                            createdAt: Date.now(),
                        }),
                    });
                }
                return Promise.resolve({ exists: false, data: () => null });
            });

            const result = await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchFailed: 1, batchGenerated: 0 });
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "backfill:missingChannelPath",
                expect.objectContaining({ videoId: "vid1", youtubeChannelId: "UCmissing" }),
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
    // processOneVideo integration
    // =======================================================================

    describe("processOneVideo integration", () => {
        it("calls processOneVideo for every video in batch", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [
                            { videoId: "vid1", youtubeChannelId: "UCabc" },
                            { videoId: "vid2", youtubeChannelId: "UCabc" },
                            { videoId: "vid3", youtubeChannelId: "UCabc" },
                        ],
                        channels,
                    ));
                }
                const videoId = path.split("/").pop();
                return Promise.resolve(videoDocSnap(true, {
                    title: `Video ${videoId}`,
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: "Test Channel",
                }));
            });

            await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            expect(mockProcessOneVideo).toHaveBeenCalledTimes(3);
            // Each call should pass apiKey as second argument
            for (const call of mockProcessOneVideo.mock.calls) {
                expect(call[1]).toBe("test-key");
            }
        });

        it("records cost only for generated videos", async () => {
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
                const videoId = path.split("/").pop();
                return Promise.resolve(videoDocSnap(true, {
                    title: `Video ${videoId}`,
                    tags: ["tag1"],
                    description: "desc",
                    viewCount: 1000,
                    publishedAt: "2026-01-01",
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: "Test Channel",
                }));
            });

            // vid1 already current (no cost), vid2 generated (cost)
            mockProcessOneVideo
                .mockResolvedValueOnce(alreadyCurrentResult())
                .mockResolvedValueOnce(generatedResult());

            await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // recordCost should be called with cost for 1 generated video
            expect(mockRecordCost).toHaveBeenCalledTimes(1);
            expect(mockRecordCost).toHaveBeenCalledWith(expect.any(Number));
            // Cost should be > 0 (1 video * COST_PER_VIDEO)
            expect(mockRecordCost.mock.calls[0][0]).toBeGreaterThan(0);
        });

        it("does not record cost when all videos are already current", async () => {
            const channels = [{ id: "UCabc", userId: "user1", channelId: "ch1" }];
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/backfillState") {
                    return Promise.resolve(backfillStateAtOffset(
                        100,
                        [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                        channels,
                    ));
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

            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

            await processBackfill({ apiKey: "test-key", offset: 100, selfUrl: SELF_URL });

            // No cost recorded when 0 generated
            expect(mockRecordCost).not.toHaveBeenCalled();
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

            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

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

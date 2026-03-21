import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const {
    mockDocGet,
    mockDocSet,
    mockDocUpdate,
    mockDocDelete,
    mockCollectionAdd,
    mockLoggerInfo,
    mockLoggerWarn,
    mockLoggerError,
    mockCheckBudget,
    mockRecordCost,
    mockProcessOneVideo,
    mockEnqueueBatch,
    mockBatchDelete,
    mockBatchCommit,
    mockGetAll,
} = vi.hoisted(() => ({
    mockDocGet: vi.fn(),
    mockDocSet: vi.fn(),
    mockDocUpdate: vi.fn(),
    mockDocDelete: vi.fn(),
    mockCollectionAdd: vi.fn(),
    mockLoggerInfo: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockLoggerError: vi.fn(),
    mockCheckBudget: vi.fn(),
    mockRecordCost: vi.fn(),
    mockProcessOneVideo: vi.fn(),
    mockEnqueueBatch: vi.fn(),
    mockBatchDelete: vi.fn(),
    mockBatchCommit: vi.fn().mockResolvedValue(undefined),
    mockGetAll: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            set: (data: unknown, opts?: unknown) => mockDocSet(path, data, opts),
            update: (data: unknown) => mockDocUpdate(path, data),
            delete: () => mockDocDelete(path),
        }),
        collection: (path: string) => ({
            add: (data: unknown) => mockCollectionAdd(path, data),
        }),
        batch: () => ({
            delete: mockBatchDelete,
            commit: mockBatchCommit,
        }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
    },
    admin: {
        firestore: {
            FieldValue: {
                increment: (n: number) => ({ _increment: n }),
                serverTimestamp: () => ({ _serverTimestamp: true }),
            },
        },
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

vi.mock("../taskQueue.js", () => ({
    enqueueBatch: (...args: unknown[]) => mockEnqueueBatch(...args),
    pLimit: () => <T>(fn: () => Promise<T>) => fn(),
}));

import { processSyncBatch } from "../embeddingSyncBatch.js";
import type { SyncState } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SELF_URL = "https://embeddingsyncbatch-abc-uc.a.run.app";

function makeSyncState(overrides: Partial<SyncState> = {}): SyncState {
    const videos = overrides.videos ?? [
        { videoId: "vid1", youtubeChannelId: "UCabc" },
        { videoId: "vid2", youtubeChannelId: "UCabc" },
    ];

    // Auto-compute coverageByChannel from videos (mirrors launcher logic)
    const coverageByChannel: SyncState["coverageByChannel"] = {};
    for (const v of videos) {
        if (!coverageByChannel[v.youtubeChannelId]) {
            coverageByChannel[v.youtubeChannelId] = { packaging: 0, visual: 0, total: 0 };
        }
        coverageByChannel[v.youtubeChannelId].total++;
    }

    return {
        channelPaths: {
            UCabc: { userId: "user1", channelId: "ch1", trendChannelId: "UCabc", channelTitle: "Channel UCabc" },
        },
        videos,
        totalVideos: overrides.totalVideos ?? videos.length,
        createdAt: Date.now(),
        totalGenerated: 0,
        totalFailed: 0,
        totalSkippedBudget: 0,
        estimatedCost: 0,
        coverageByChannel,
        ...overrides,
    };
}

function stateSnap(state: SyncState) {
    return { exists: true, data: () => state };
}

function noSnap() {
    return { exists: false, data: () => null };
}

function videoDocSnap(data: Record<string, unknown>) {
    return {
        exists: true,
        data: () => ({
            title: "Test Video",
            tags: ["tag1"],
            description: "desc",
            viewCount: 1000,
            publishedAt: "2026-01-01",
            thumbnail: "https://i.ytimg.com/vi/vid1/mqdefault.jpg",
            channelTitle: "Test Channel",
            ...data,
        }),
    };
}

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

describe("processSyncBatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckBudget.mockResolvedValue({ allowed: true, remaining: 5, currentCost: 0 });
        mockRecordCost.mockResolvedValue(undefined);
        mockDocSet.mockResolvedValue(undefined);
        mockDocUpdate.mockResolvedValue(undefined);
        mockDocDelete.mockResolvedValue(undefined);
        mockEnqueueBatch.mockResolvedValue(undefined);
        mockCollectionAdd.mockResolvedValue(undefined);
        mockBatchCommit.mockResolvedValue(undefined);
        mockGetAll.mockResolvedValue([]);
        mockProcessOneVideo.mockResolvedValue(generatedResult());
    });

    // =======================================================================
    // Early exits
    // =======================================================================

    describe("early exits", () => {
        it("returns early when syncState does not exist", async () => {
            mockDocGet.mockResolvedValue(noSnap());

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body.message).toBe("No syncState found — nothing to do");
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "embeddingSyncBatch:noSyncState", { offset: 0 },
            );
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
        });

        it("cleans up and returns when offset is beyond total videos", async () => {
            const state = makeSyncState({ totalVideos: 2 });
            mockDocGet.mockResolvedValue(stateSnap(state));

            const result = await processSyncBatch({ apiKey: "key", offset: 200, selfUrl: SELF_URL });

            expect(result.body.message).toBe("Sync complete (empty batch)");
            expect(mockDocDelete).toHaveBeenCalledWith("system/syncState");
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // Budget exhaustion
    // =======================================================================

    describe("budget exhaustion", () => {
        it("updates totalSkippedBudget and finalizes when budget is exhausted", async () => {
            mockCheckBudget.mockResolvedValue({ allowed: false, remaining: 0, currentCost: 5 });

            const state = makeSyncState({ totalVideos: 50 });
            // First get = syncState read, second get = finalize re-read
            mockDocGet
                .mockResolvedValueOnce(stateSnap(state))
                .mockResolvedValueOnce(stateSnap({ ...state, totalSkippedBudget: 50 }));
            // Coverage stats query

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body.message).toBe("Budget exhausted — chain stopped");
            expect(result.body.skippedBudget).toBe(50);

            // totalSkippedBudget updated atomically
            expect(mockDocUpdate).toHaveBeenCalledWith(
                "system/syncState",
                { totalSkippedBudget: { _increment: 50 } },
            );

            // finalize ran: stats written + state deleted
            expect(mockDocSet).toHaveBeenCalledWith(
                "system/embeddingStats",
                expect.objectContaining({ byChannel: expect.any(Object) }),
                undefined,
            );
            expect(mockDocDelete).toHaveBeenCalledWith("system/syncState");

            // No videos processed
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
            expect(mockEnqueueBatch).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // Batch processing
    // =======================================================================

    describe("batch processing", () => {
        it("processes videos and updates counters atomically", async () => {
            const state = makeSyncState();
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            // finalize: re-read state + coverage stats

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body.message).toBe("Sync complete");
            expect(result.body).toMatchObject({ batchGenerated: 2, batchFailed: 0 });
            expect(mockProcessOneVideo).toHaveBeenCalledTimes(2);

            // Counters updated atomically
            expect(mockDocUpdate).toHaveBeenCalledWith(
                "system/syncState",
                expect.objectContaining({
                    totalGenerated: { _increment: 2 },
                    totalFailed: { _increment: 0 },
                }),
            );
        });

        it("counts alreadyCurrent results as neither generated nor failed", async () => {
            const state = makeSyncState();
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            mockProcessOneVideo
                .mockResolvedValueOnce(alreadyCurrentResult())
                .mockResolvedValueOnce(generatedResult());

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchGenerated: 1, batchFailed: 0 });
        });

        it("counts missing channel path as failed", async () => {
            const state = makeSyncState({
                videos: [{ videoId: "vid1", youtubeChannelId: "UCmissing" }],
                totalVideos: 1,
            });
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(noSnap());
            });

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchFailed: 1, batchGenerated: 0 });
            expect(mockProcessOneVideo).not.toHaveBeenCalled();
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "embeddingSyncBatch:missingChannelPath",
                expect.objectContaining({ videoId: "vid1" }),
            );
        });

        it("counts missing video doc as failed", async () => {
            const state = makeSyncState({
                videos: [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                totalVideos: 1,
            });
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(noSnap());
            });

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchFailed: 1, batchGenerated: 0 });
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "embeddingSyncBatch:videoDocNotFound",
                expect.objectContaining({ videoId: "vid1" }),
            );
        });

        it("records cost only for generated videos", async () => {
            const state = makeSyncState();
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            mockProcessOneVideo
                .mockResolvedValueOnce(alreadyCurrentResult())
                .mockResolvedValueOnce(generatedResult());

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockRecordCost).toHaveBeenCalledTimes(1);
            expect(mockRecordCost.mock.calls[0][0]).toBeGreaterThan(0);
        });

        it("does not record cost when all videos are already current", async () => {
            const state = makeSyncState();
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });
            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockRecordCost).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // Chain control
    // =======================================================================

    describe("chain control", () => {
        it("enqueues next batch when more videos remain", async () => {
            const videos = Array.from({ length: 150 }, (_, i) => ({
                videoId: `vid${String(i).padStart(3, "0")}`,
                youtubeChannelId: "UCabc",
            }));
            const state = makeSyncState({ videos, totalVideos: 150 });

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });
            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body.message).toBe("Batch complete, next enqueued");
            expect(result.body).toMatchObject({ totalRemaining: 50 });
            expect(mockEnqueueBatch).toHaveBeenCalledWith(SELF_URL, 100);
        });

        it("finalizes on last batch instead of enqueuing", async () => {
            const state = makeSyncState();
            // First get = syncState, second get = finalize re-read
            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                    return Promise.resolve(videoDocSnap({}));
                });

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body.message).toBe("Sync complete");
            expect(mockEnqueueBatch).not.toHaveBeenCalled();
            expect(mockDocDelete).toHaveBeenCalledWith("system/syncState");
        });
    });

    // =======================================================================
    // Finalize — coverage stats
    // =======================================================================

    describe("finalize: coverage stats", () => {
        it("writes per-channel coverage stats from inline tracking", async () => {
            const state = makeSyncState({
                videos: [
                    { videoId: "vid1", youtubeChannelId: "UCabc" },
                    { videoId: "vid2", youtubeChannelId: "UCabc" },
                ],
                totalVideos: 2,
            });

            // vid1: has both, vid2: has packaging only (thumbnailUnavailable)
            mockProcessOneVideo
                .mockResolvedValueOnce({ status: "generated", hasPackaging: true, hasVisual: true, thumbnailUnavailable: false })
                .mockResolvedValueOnce({ status: "generated", hasPackaging: true, hasVisual: false, thumbnailUnavailable: true });

            // finalize re-read: coverage accumulated by batch (2 packaging, 1 visual)
            const finalState = {
                ...state,
                totalGenerated: 2,
                coverageByChannel: { UCabc: { packaging: 2, visual: 1, total: 2 } },
            };

            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") return Promise.resolve(stateSnap(finalState));
                    return Promise.resolve(videoDocSnap({}));
                });

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockDocSet).toHaveBeenCalledWith(
                "system/embeddingStats",
                expect.objectContaining({
                    byChannel: {
                        UCabc: { packaging: 2, visual: 1, total: 2 },
                    },
                }),
                undefined,
            );
        });

        it("includes coverage increments in syncState update", async () => {
            const state = makeSyncState();

            mockProcessOneVideo
                .mockResolvedValueOnce({ status: "generated", hasPackaging: true, hasVisual: true, thumbnailUnavailable: false })
                .mockResolvedValueOnce({ status: "alreadyCurrent", hasPackaging: true, hasVisual: false, thumbnailUnavailable: true });

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            // Coverage deltas written as part of atomic update
            expect(mockDocUpdate).toHaveBeenCalledWith(
                "system/syncState",
                expect.objectContaining({
                    "coverageByChannel.UCabc.packaging": { _increment: 2 },
                    "coverageByChannel.UCabc.visual": { _increment: 1 },
                }),
            );
        });
    });

    // =======================================================================
    // Finalize — notifications
    // =======================================================================

    describe("finalize: notifications", () => {
        it("sends success notification when videos were generated", async () => {
            const state = makeSyncState({
                videos: [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                totalVideos: 1,
            });

            // First read = batch, second read = finalize re-read with accumulated counters
            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") {
                        return Promise.resolve(stateSnap({
                            ...state,
                            totalGenerated: 1,
                            totalSkippedBudget: 0,
                        }));
                    }
                    return Promise.resolve(videoDocSnap({}));
                });

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockCollectionAdd).toHaveBeenCalledWith(
                "users/user1/channels/ch1/notifications",
                expect.objectContaining({
                    title: "Smart Search Updated: 1 videos processed",
                    type: "success",
                    category: "smart-search",
                }),
            );
        });

        it("sends warning notification when all videos were skipped for budget", async () => {
            mockCheckBudget.mockResolvedValue({ allowed: false, remaining: 0, currentCost: 5 });

            const state = makeSyncState({ totalVideos: 10 });

            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") {
                        return Promise.resolve(stateSnap({
                            ...state,
                            totalGenerated: 0,
                            totalSkippedBudget: 10,
                        }));
                    }
                    return Promise.resolve(noSnap());
                });

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockCollectionAdd).toHaveBeenCalledWith(
                "users/user1/channels/ch1/notifications",
                expect.objectContaining({
                    title: "Smart Search Paused: monthly budget limit reached",
                    type: "warning",
                }),
            );
        });

        it("does not send notification when 0 generated and 0 skipped", async () => {
            const state = makeSyncState({
                videos: [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                totalVideos: 1,
            });

            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") {
                        return Promise.resolve(stateSnap({
                            ...state,
                            totalGenerated: 0,
                            totalSkippedBudget: 0,
                        }));
                    }
                    return Promise.resolve(videoDocSnap({}));
                });
            mockProcessOneVideo.mockResolvedValue(alreadyCurrentResult());

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockCollectionAdd).not.toHaveBeenCalled();
        });

        it("deduplicates notifications to unique user/channel pairs", async () => {
            const state = makeSyncState({
                channelPaths: {
                    UCabc: { userId: "user1", channelId: "ch1", trendChannelId: "UCabc", channelTitle: "Channel UCabc" },
                    UCxyz: { userId: "user1", channelId: "ch1", trendChannelId: "UCxyz", channelTitle: "Channel UCxyz" },
                },
                videos: [
                    { videoId: "vid1", youtubeChannelId: "UCabc" },
                    { videoId: "vid2", youtubeChannelId: "UCxyz" },
                ],
                totalVideos: 2,
            });

            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") {
                        return Promise.resolve(stateSnap({ ...state, totalGenerated: 2 }));
                    }
                    return Promise.resolve(videoDocSnap({}));
                });

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            // Same user/channel → only 1 notification, not 2
            expect(mockCollectionAdd).toHaveBeenCalledTimes(1);
        });
    });

    // =======================================================================
    // Finalize — anomaly detection
    // =======================================================================

    describe("finalize: anomaly detection", () => {
        it("warns on high failure rate (>10%)", async () => {
            // 5 videos: 3 fail, 2 succeed = 60% failure rate
            const videos = Array.from({ length: 5 }, (_, i) => ({
                videoId: `vid${i}`,
                youtubeChannelId: "UCabc",
            }));
            const state = makeSyncState({ videos, totalVideos: 5 });

            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") {
                        return Promise.resolve(stateSnap({
                            ...state,
                            totalGenerated: 2,
                            totalFailed: 3,
                        }));
                    }
                    return Promise.resolve(videoDocSnap({}));
                });

            // 3 fail, 2 succeed
            mockProcessOneVideo
                .mockResolvedValueOnce(failedResult())
                .mockResolvedValueOnce(failedResult())
                .mockResolvedValueOnce(failedResult())
                .mockResolvedValueOnce(generatedResult())
                .mockResolvedValueOnce(generatedResult());

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "embeddingSync:highFailureRate",
                expect.objectContaining({ generated: 2, failed: 3 }),
            );
        });

        it("does not warn when failure rate is below 10%", async () => {
            const videos = Array.from({ length: 10 }, (_, i) => ({
                videoId: `vid${i}`,
                youtubeChannelId: "UCabc",
            }));
            const state = makeSyncState({ videos, totalVideos: 10 });

            mockDocGet
                .mockImplementationOnce(() => Promise.resolve(stateSnap(state)))
                .mockImplementation((path: string) => {
                    if (path === "system/syncState") {
                        return Promise.resolve(stateSnap({
                            ...state,
                            totalGenerated: 9,
                            totalFailed: 1,
                        }));
                    }
                    return Promise.resolve(videoDocSnap({}));
                });

            // 1 fail, 9 succeed
            mockProcessOneVideo
                .mockResolvedValueOnce(failedResult())
                .mockResolvedValue(generatedResult());

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(mockLoggerWarn).not.toHaveBeenCalledWith(
                "embeddingSync:highFailureRate",
                expect.anything(),
            );
        });
    });

    // =======================================================================
    // Queue cleanup
    // =======================================================================

    describe("queue cleanup", () => {
        it("deletes successfully processed videos from queue", async () => {
            const state = makeSyncState({
                videos: [
                    { videoId: "vid1", youtubeChannelId: "UCabc" },
                    { videoId: "vid2", youtubeChannelId: "UCabc" },
                ],
                totalVideos: 2,
            });

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            mockProcessOneVideo
                .mockResolvedValueOnce(generatedResult())
                .mockResolvedValueOnce(alreadyCurrentResult());

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            // Both videos are successful (generated + alreadyCurrent)
            expect(mockBatchDelete).toHaveBeenCalledTimes(2);
            expect(mockBatchCommit).toHaveBeenCalled();
            expect(mockLoggerInfo).toHaveBeenCalledWith(
                "embeddingSyncBatch:queueCleanup",
                expect.objectContaining({ cleaned: 2, failed: 0 }),
            );
        });

        it("does not delete failed videos from queue (retained for retry)", async () => {
            const state = makeSyncState({
                videos: [
                    { videoId: "vid-ok", youtubeChannelId: "UCabc" },
                    { videoId: "vid-fail", youtubeChannelId: "UCabc" },
                ],
                totalVideos: 2,
            });

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            mockProcessOneVideo
                .mockResolvedValueOnce(generatedResult())
                .mockResolvedValueOnce(failedResult());

            await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            // Only 1 video deleted (the successful one), not the failed one
            expect(mockBatchDelete).toHaveBeenCalledTimes(1);
            expect(mockLoggerInfo).toHaveBeenCalledWith(
                "embeddingSyncBatch:queueCleanup",
                expect.objectContaining({ cleaned: 1, failed: 1 }),
            );
        });

        it("handles cleanup batch failure gracefully", async () => {
            const state = makeSyncState({
                videos: [{ videoId: "vid1", youtubeChannelId: "UCabc" }],
                totalVideos: 1,
            });

            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            mockBatchCommit.mockRejectedValueOnce(new Error("Cleanup failed"));

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            // Processing still succeeds despite cleanup failure
            expect(result.body).toMatchObject({ batchGenerated: 1 });
            expect(mockLoggerWarn).toHaveBeenCalledWith(
                "embeddingSyncBatch:queueCleanupFailed",
                expect.objectContaining({ error: expect.any(Error) }),
            );
        });
    });

    // =======================================================================
    // Error handling
    // =======================================================================

    describe("error handling", () => {
        it("returns 500 with error message on unexpected exception", async () => {
            mockDocGet.mockRejectedValue(new Error("Firestore unavailable"));

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.statusCode).toBe(500);
            expect(result.body.error).toBe("Firestore unavailable");
            expect(mockLoggerError).toHaveBeenCalledWith(
                "embeddingSyncBatch:error",
                expect.objectContaining({ error: "Firestore unavailable" }),
            );
        });

        it("continues with next video when one fails via processOneVideo", async () => {
            const state = makeSyncState();
            mockDocGet.mockImplementation((path: string) => {
                if (path === "system/syncState") return Promise.resolve(stateSnap(state));
                return Promise.resolve(videoDocSnap({}));
            });

            mockProcessOneVideo
                .mockResolvedValueOnce(failedResult())
                .mockResolvedValueOnce(generatedResult());

            const result = await processSyncBatch({ apiKey: "key", offset: 0, selfUrl: SELF_URL });

            expect(result.body).toMatchObject({ batchGenerated: 1, batchFailed: 1 });
        });
    });
});

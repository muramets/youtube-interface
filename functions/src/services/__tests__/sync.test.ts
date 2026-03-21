import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { YouTubeVideoItem } from "../../types";

/* ---------- Fixture helpers ---------- */

function makeTrendChannel(overrides?: Partial<{
    id: string;
    name: string;
    uploadsPlaylistId: string;
}>) {
    return {
        id: overrides?.id ?? "UCtest123",
        name: overrides?.name ?? "Test Channel",
        uploadsPlaylistId: overrides?.uploadsPlaylistId ?? "UUtest123",
        isVisible: true,
    };
}

function makeVideo(overrides?: Partial<{
    id: string;
    title: string;
    viewCount: string;
    likeCount: string;
    commentCount: string;
    publishedAt: string;
    channelTitle: string;
    description: string;
    tags: string[];
    duration: string;
    thumbnails: YouTubeVideoItem["snippet"]["thumbnails"];
}>): YouTubeVideoItem {
    return {
        id: overrides?.id ?? "vid-1",
        snippet: {
            title: overrides?.title ?? "Test Video",
            publishedAt: overrides?.publishedAt ?? "2025-01-15T10:00:00Z",
            channelTitle: overrides?.channelTitle ?? "Test Channel",
            description: overrides?.description ?? "A test video description",
            tags: overrides?.tags ?? ["tag1", "tag2"],
            thumbnails: overrides?.thumbnails ?? {
                default: { url: "https://i.ytimg.com/default.jpg" },
                medium: { url: "https://i.ytimg.com/medium.jpg" },
                high: { url: "https://i.ytimg.com/high.jpg" },
                maxres: { url: "https://i.ytimg.com/maxres.jpg" },
            },
        },
        statistics: {
            viewCount: overrides?.viewCount ?? "1000",
            likeCount: overrides?.likeCount ?? "50",
            commentCount: overrides?.commentCount ?? "10",
        },
        contentDetails: {
            duration: overrides?.duration ?? "PT10M30S",
        },
    };
}

/* ---------- Mock: shared/db ---------- */

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = () => ({
    set: mockBatchSet,
    update: mockBatchUpdate,
    commit: mockBatchCommit,
});

const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocRef = vi.fn((path: string) => ({
    path,
    update: mockDocUpdate,
    set: mockDocSet,
}));

const mockCollectionAdd = vi.fn().mockResolvedValue({ id: "notif-1" });

// Snapshot idempotency query chain
let mockSnapshotQueryEmpty = true;
const mockCollectionDoc = vi.fn((docId: string) => ({
    id: docId,
    set: mockDocSet,
}));
const mockCollectionWhere = vi.fn().mockReturnThis();
const mockCollectionLimit = vi.fn().mockReturnThis();
const mockCollectionGet = vi.fn(() =>
    Promise.resolve({ empty: mockSnapshotQueryEmpty }),
);

const mockCollection = vi.fn((path: string) => ({
    path,
    add: mockCollectionAdd,
    doc: mockCollectionDoc,
    where: mockCollectionWhere,
    limit: mockCollectionLimit,
    get: mockCollectionGet,
}));

const mockGetAll = vi.fn().mockResolvedValue([]);

vi.mock("../../shared/db.js", () => ({
    db: {
        batch: mockBatch,
        doc: mockDocRef,
        collection: mockCollection,
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
    },
    admin: {
        firestore: {
            FieldValue: {
                serverTimestamp: () => "SERVER_TIMESTAMP",
            },
        },
    },
}));

/* ---------- Mock: embeddingQueue ---------- */

const mockIsContentChanged = vi.fn().mockReturnValue(false);
const mockEnqueueVideo = vi.fn();

vi.mock("../../embedding/embeddingQueue.js", () => ({
    isContentChanged: (...args: unknown[]) => mockIsContentChanged(...args),
    enqueueVideoForEmbedding: (...args: unknown[]) => mockEnqueueVideo(...args),
}));

/* ---------- Mock: firebase-functions logger ---------- */

vi.mock("firebase-functions/v2", () => ({
    logger: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    },
}));

/* ---------- Mock: YouTubeService ---------- */

const mockGetPlaylistVideos = vi.fn();
const mockGetVideoDetails = vi.fn();
const mockGetChannelAvatar = vi.fn();
const mockGetChannelSubscriberCounts = vi.fn();

class MockYouTubeService {
    getPlaylistVideos = mockGetPlaylistVideos;
    getVideoDetails = mockGetVideoDetails;
    getChannelAvatar = mockGetChannelAvatar;
    getChannelSubscriberCounts = mockGetChannelSubscriberCounts;
}

vi.mock("../youtube", () => ({
    YouTubeService: MockYouTubeService,
}));

/* ---------- Mock: percentiles ---------- */

const mockGetPercentileDistribution = vi.fn().mockReturnValue({
    p25: 250,
    median: 500,
    p75: 750,
    max: 1000,
});

vi.mock("../../shared/percentiles.js", () => ({
    getPercentileDistribution: (...args: unknown[]) =>
        mockGetPercentileDistribution(...args),
}));

/* ---------- Import after mocks ---------- */

const { SyncService } = await import("../sync");

/* ---------- Constants ---------- */

const USER_ID = "user-1";
const CHANNEL_ID = "ch-1";
const API_KEY = "test-api-key";
const FIXED_TIME = new Date("2025-06-15T14:30:00.000Z").getTime();

/* ---------- Tests ---------- */

describe("SyncService", () => {
    let service: InstanceType<typeof SyncService>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_TIME);

        vi.clearAllMocks();
        mockSnapshotQueryEmpty = true;

        // Re-wire the chained query mocks (clearAllMocks resets return values)
        mockCollectionWhere.mockReturnThis();
        mockCollectionLimit.mockReturnThis();
        mockCollectionGet.mockImplementation(() =>
            Promise.resolve({ empty: mockSnapshotQueryEmpty }),
        );
        mockBatchCommit.mockResolvedValue(undefined);
        mockDocUpdate.mockResolvedValue(undefined);
        mockDocSet.mockResolvedValue(undefined);
        mockCollectionAdd.mockResolvedValue({ id: "notif-1" });
        mockGetAll.mockResolvedValue([]);
        mockIsContentChanged.mockReturnValue(false);

        service = new SyncService();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /* ================================================================
     * syncChannel
     * ================================================================ */
    describe("syncChannel", () => {
        function setupHappyPath(videos: YouTubeVideoItem[] = [makeVideo()]) {
            const videoIds = videos.map((v) => v.id);
            mockGetPlaylistVideos.mockResolvedValue({
                videoIds,
                quotaUsed: 2,
            });
            mockGetVideoDetails.mockResolvedValue({
                videos,
                quotaUsed: 3,
            });
        }

        // ─── 1. Happy path ───────────────────────────────────────────────
        it("fetches videos, writes batch, creates snapshot, updates channel stats", async () => {
            const videos = [
                makeVideo({ id: "v1", viewCount: "1000" }),
                makeVideo({ id: "v2", viewCount: "2000" }),
            ];
            setupHappyPath(videos);
            const tc = makeTrendChannel();

            const result = await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                tc,
                API_KEY,
            );

            // YouTube API was called
            expect(mockGetPlaylistVideos).toHaveBeenCalledWith(
                tc.uploadsPlaylistId,
            );
            expect(mockGetVideoDetails).toHaveBeenCalledWith(["v1", "v2"]);

            // Batch write (videos)
            expect(mockBatchSet).toHaveBeenCalledTimes(2);
            expect(mockBatchCommit).toHaveBeenCalledTimes(1);

            // Snapshot created
            expect(mockDocSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    timestamp: FIXED_TIME,
                    videoViews: { v1: 1000, v2: 2000 },
                    videoCount: 2,
                    type: "manual",
                }),
            );

            // Channel stats updated
            expect(mockDocUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    lastUpdated: FIXED_TIME,
                    totalViewCount: 3000,
                    averageViews: 1500,
                    videoCount: 2,
                }),
            );

            // Return value
            expect(result).toEqual({
                videosProcessed: 2,
                quotaList: 2,
                quotaDetails: 3,
            });
        });

        // ─── 2. Empty playlist ───────────────────────────────────────────
        it("returns early with 0 processed when playlist is empty", async () => {
            mockGetPlaylistVideos.mockResolvedValue({
                videoIds: [],
                quotaUsed: 1,
            });

            const result = await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(result).toEqual({
                videosProcessed: 0,
                quotaList: 1,
                quotaDetails: 0,
            });
            expect(mockGetVideoDetails).not.toHaveBeenCalled();
            expect(mockBatchSet).not.toHaveBeenCalled();
        });

        // ─── 3. Avatar refresh: calls getChannelAvatar and updates doc ───
        it("refreshes avatar when refreshAvatar=true and URL is returned", async () => {
            setupHappyPath();
            mockGetChannelAvatar.mockResolvedValue({
                avatarUrl: "https://yt.com/avatar.jpg",
                quotaUsed: 1,
            });

            const tc = makeTrendChannel({ id: "UCavatar" });
            const result = await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                tc,
                API_KEY,
                true,
            );

            expect(mockGetChannelAvatar).toHaveBeenCalledWith("UCavatar");
            // Avatar update call — the doc().update() for avatar
            expect(mockDocUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    avatarUrl: "https://yt.com/avatar.jpg",
                }),
            );
            // Avatar quota added to quotaDetails
            expect(result.quotaDetails).toBe(4); // 1 (avatar) + 3 (video details)
        });

        // ─── 4. Avatar refresh: null URL → no Firestore update ───────────
        it("does not update Firestore when avatar URL is null", async () => {
            setupHappyPath();
            mockGetChannelAvatar.mockResolvedValue({
                avatarUrl: undefined,
                quotaUsed: 1,
            });

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
                true,
            );

            // doc().update() should only be called for channel stats, not avatar
            // The avatar-specific update uses { avatarUrl: ... } — check it's NOT present
            const avatarUpdateCalls = mockDocUpdate.mock.calls.filter(
                (call) => call[0]?.avatarUrl !== undefined,
            );
            expect(avatarUpdateCalls).toHaveLength(0);
        });

        // ─── 5. Snapshot idempotency: existing snapshot today → skip ─────
        it("skips snapshot creation when one already exists today", async () => {
            setupHappyPath();
            mockSnapshotQueryEmpty = false;

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            // The snapshot doc().set() should NOT be called
            // But batch.set() IS called (for videos). So we check mockDocSet specifically.
            // collection().doc().set() is mockDocSet — it should not have been called
            // for the snapshot.
            // Note: mockDocSet is used by both collection().doc().set() (snapshot)
            // and potentially elsewhere. We verify via collection().doc() call.
            expect(mockCollectionDoc).not.toHaveBeenCalled();
        });

        // ─── 6. Snapshot type is passed correctly ────────────────────────
        it("passes snapshotType='auto' to snapshot document", async () => {
            setupHappyPath();

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
                false,
                "auto",
            );

            expect(mockDocSet).toHaveBeenCalledWith(
                expect.objectContaining({ type: "auto" }),
            );
        });

        it("passes snapshotType='manual' by default", async () => {
            setupHappyPath();

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockDocSet).toHaveBeenCalledWith(
                expect.objectContaining({ type: "manual" }),
            );
        });

        // ─── 7. Large batch: >225 videos → multiple Firestore batches ───
        // batchSize = floor((500 - 50) / 2) = 225 (each video = 1 write + 1 potential queue write)
        it("uses multiple Firestore batches for >225 videos", async () => {
            const videos = Array.from({ length: 300 }, (_, i) =>
                makeVideo({ id: `v${i}`, viewCount: `${(i + 1) * 100}` }),
            );
            setupHappyPath(videos);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            // 300 videos → 2 batches (225 + 75)
            expect(mockBatchCommit).toHaveBeenCalledTimes(2);
            // 300 video writes + potential queue writes (mockIsContentChanged returns false by default → 0 queue writes)
            expect(mockBatchSet).toHaveBeenCalledTimes(300);
        });

        // ─── 8. Field mapping: counts parsed as numbers ─────────────────
        it("parses viewCount, likeCount, commentCount as integers", async () => {
            const video = makeVideo({
                id: "v-parse",
                viewCount: "12345",
                likeCount: "678",
                commentCount: "90",
            });
            setupHappyPath([video]);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    viewCount: 12345,
                    likeCount: 678,
                    commentCount: 90,
                }),
                { merge: true },
            );
        });

        it("defaults missing count fields to 0", async () => {
            const video = makeVideo({ id: "v-empty" });
            // Remove statistics values
            video.statistics = {} as YouTubeVideoItem["statistics"];
            setupHappyPath([video]);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    viewCount: 0,
                    likeCount: 0,
                    commentCount: 0,
                }),
                { merge: true },
            );
        });

        // ─── 9. Thumbnail priority: maxres > high > medium > default ────
        it("selects maxres thumbnail when available", async () => {
            const video = makeVideo({
                id: "v-thumb",
                thumbnails: {
                    default: { url: "https://default.jpg" },
                    medium: { url: "https://medium.jpg" },
                    high: { url: "https://high.jpg" },
                    maxres: { url: "https://maxres.jpg" },
                },
            });
            setupHappyPath([video]);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ thumbnail: "https://maxres.jpg" }),
                { merge: true },
            );
        });

        it("falls back to high when maxres is missing", async () => {
            const video = makeVideo({
                id: "v-thumb-high",
                thumbnails: {
                    default: { url: "https://default.jpg" },
                    medium: { url: "https://medium.jpg" },
                    high: { url: "https://high.jpg" },
                },
            });
            setupHappyPath([video]);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ thumbnail: "https://high.jpg" }),
                { merge: true },
            );
        });

        it("falls back to medium when maxres and high are missing", async () => {
            const video = makeVideo({
                id: "v-thumb-med",
                thumbnails: {
                    default: { url: "https://default.jpg" },
                    medium: { url: "https://medium.jpg" },
                },
            });
            setupHappyPath([video]);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ thumbnail: "https://medium.jpg" }),
                { merge: true },
            );
        });

        it("falls back to default when only default is available", async () => {
            const video = makeVideo({
                id: "v-thumb-def",
                thumbnails: {
                    default: { url: "https://default.jpg" },
                },
            });
            setupHappyPath([video]);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ thumbnail: "https://default.jpg" }),
                { merge: true },
            );
        });

        it("uses empty string when no thumbnails exist", async () => {
            const video = makeVideo({ id: "v-no-thumb" });
            video.snippet.thumbnails = undefined;
            setupHappyPath([video]);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ thumbnail: "" }),
                { merge: true },
            );
        });

        // ─── 10. Quota tracking ──────────────────────────────────────────
        it("returns correct quotaList and quotaDetails", async () => {
            mockGetPlaylistVideos.mockResolvedValue({
                videoIds: ["v1"],
                quotaUsed: 5,
            });
            mockGetVideoDetails.mockResolvedValue({
                videos: [makeVideo({ id: "v1" })],
                quotaUsed: 7,
            });

            const result = await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            expect(result.quotaList).toBe(5);
            expect(result.quotaDetails).toBe(7);
        });

        it("accumulates avatar quota into quotaDetails", async () => {
            mockGetPlaylistVideos.mockResolvedValue({
                videoIds: ["v1"],
                quotaUsed: 2,
            });
            mockGetVideoDetails.mockResolvedValue({
                videos: [makeVideo({ id: "v1" })],
                quotaUsed: 3,
            });
            mockGetChannelAvatar.mockResolvedValue({
                avatarUrl: "https://avatar.jpg",
                quotaUsed: 1,
            });

            const result = await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
                true,
            );

            expect(result.quotaList).toBe(2);
            expect(result.quotaDetails).toBe(4); // 1 avatar + 3 details
        });

        // ─── 11. Channel stats update ────────────────────────────────────
        it("updates totalViewCount, averageViews, performanceDistribution, videoCount", async () => {
            const videos = [
                makeVideo({ id: "v1", viewCount: "1000" }),
                makeVideo({ id: "v2", viewCount: "3000" }),
            ];
            setupHappyPath(videos);

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel({ id: "UCstats" }),
                API_KEY,
            );

            // getPercentileDistribution was called with correct data
            expect(mockGetPercentileDistribution).toHaveBeenCalledWith([
                { viewCount: 1000 },
                { viewCount: 3000 },
            ]);

            // Channel doc was updated
            expect(mockDocUpdate).toHaveBeenCalledWith({
                lastUpdated: FIXED_TIME,
                totalViewCount: 4000,
                averageViews: 2000,
                performanceDistribution: {
                    p25: 250,
                    median: 500,
                    p75: 750,
                    max: 1000,
                },
                videoCount: 2,
            });
        });

        // ─── Firestore paths ─────────────────────────────────────────────
        it("writes video docs to correct Firestore path", async () => {
            const tc = makeTrendChannel({ id: "UCpath" });
            setupHappyPath([makeVideo({ id: "vid-abc" })]);

            await service.syncChannel(USER_ID, CHANNEL_ID, tc, API_KEY);

            expect(mockDocRef).toHaveBeenCalledWith(
                `users/${USER_ID}/channels/${CHANNEL_ID}/trendChannels/UCpath/videos/vid-abc`,
            );
        });

        it("writes snapshot to correct collection path", async () => {
            const tc = makeTrendChannel({ id: "UCsnap" });
            setupHappyPath();

            await service.syncChannel(USER_ID, CHANNEL_ID, tc, API_KEY);

            expect(mockCollection).toHaveBeenCalledWith(
                `users/${USER_ID}/channels/${CHANNEL_ID}/trendChannels/UCsnap/snapshots`,
            );
        });

        // ─── Snapshot idempotency query checks correct UTC range ─────────
        it("queries snapshot idempotency with correct UTC day boundaries", async () => {
            setupHappyPath();

            await service.syncChannel(
                USER_ID,
                CHANNEL_ID,
                makeTrendChannel(),
                API_KEY,
            );

            // FIXED_TIME = 2025-06-15T14:30:00.000Z
            const dayStart = new Date("2025-06-15T00:00:00.000Z").getTime();
            const dayEnd = new Date("2025-06-15T23:59:59.999Z").getTime();

            expect(mockCollectionWhere).toHaveBeenCalledWith(
                "timestamp",
                ">=",
                dayStart,
            );
            expect(mockCollectionWhere).toHaveBeenCalledWith(
                "timestamp",
                "<=",
                dayEnd,
            );
            expect(mockCollectionLimit).toHaveBeenCalledWith(1);
        });

        // ─── Video doc data completeness ─────────────────────────────────
        it("writes all required fields to video doc with merge:true", async () => {
            const video = makeVideo({
                id: "v-full",
                title: "Full Video",
                viewCount: "999",
                likeCount: "55",
                commentCount: "11",
                publishedAt: "2025-03-01T12:00:00Z",
                channelTitle: "My Channel",
                description: "Full description",
                tags: ["a", "b"],
                duration: "PT5M",
            });
            const tc = makeTrendChannel({ id: "UCfull" });
            setupHappyPath([video]);

            await service.syncChannel(USER_ID, CHANNEL_ID, tc, API_KEY);

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                {
                    id: "v-full",
                    channelId: "UCfull",
                    channelTitle: "My Channel",
                    title: "Full Video",
                    thumbnail: "https://i.ytimg.com/maxres.jpg",
                    publishedAt: "2025-03-01T12:00:00Z",
                    publishedAtTimestamp: new Date(
                        "2025-03-01T12:00:00Z",
                    ).getTime(),
                    viewCount: 999,
                    likeCount: 55,
                    commentCount: 11,
                    duration: "PT5M",
                    description: "Full description",
                    tags: ["a", "b"],
                    lastUpdated: FIXED_TIME,
                },
                { merge: true },
            );
        });

        // ─── Embedding queue integration ─────────────────────────────────

        it("calls isContentChanged with pre-read data and enqueues when changed", async () => {
            const video = makeVideo({ id: "v-dirty", title: "New Title" });
            setupHappyPath([video]);

            // Pre-read returns existing doc with old title
            mockGetAll.mockResolvedValue([{
                exists: true,
                id: "v-dirty",
                data: () => ({
                    title: "Old Title",
                    tags: ["tag1", "tag2"],
                    description: "A test video description",
                    thumbnail: "https://i.ytimg.com/maxres.jpg",
                }),
            }]);
            mockIsContentChanged.mockReturnValue(true);

            await service.syncChannel(USER_ID, CHANNEL_ID, makeTrendChannel(), API_KEY);

            expect(mockIsContentChanged).toHaveBeenCalled();
            expect(mockEnqueueVideo).toHaveBeenCalled();
        });

        it("does not enqueue when content is unchanged", async () => {
            setupHappyPath([makeVideo()]);

            mockGetAll.mockResolvedValue([{
                exists: true,
                id: "vid-1",
                data: () => ({
                    title: "Test Video",
                    tags: ["tag1", "tag2"],
                    description: "A test video description",
                    thumbnail: "https://i.ytimg.com/maxres.jpg",
                }),
            }]);
            mockIsContentChanged.mockReturnValue(false);

            await service.syncChannel(USER_ID, CHANNEL_ID, makeTrendChannel(), API_KEY);

            expect(mockIsContentChanged).toHaveBeenCalled();
            expect(mockEnqueueVideo).not.toHaveBeenCalled();
        });

        it("enqueues new videos (not in Firestore yet)", async () => {
            setupHappyPath([makeVideo({ id: "v-new" })]);
            // Pre-read returns no existing docs
            mockGetAll.mockResolvedValue([{
                exists: false,
                id: "v-new",
                data: () => null,
            }]);
            mockIsContentChanged.mockReturnValue(true);

            await service.syncChannel(USER_ID, CHANNEL_ID, makeTrendChannel(), API_KEY);

            expect(mockIsContentChanged).toHaveBeenCalledWith(
                undefined,
                expect.objectContaining({ title: "Test Video" }),
            );
            expect(mockEnqueueVideo).toHaveBeenCalled();
        });

        it("uses trendChannel.name for channelTitle in queue entry", async () => {
            setupHappyPath([makeVideo()]);
            mockGetAll.mockResolvedValue([]);
            mockIsContentChanged.mockReturnValue(true);

            const tc = makeTrendChannel({ id: "UCname", name: "My Channel Name" });
            await service.syncChannel(USER_ID, CHANNEL_ID, tc, API_KEY);

            const entryArg = mockEnqueueVideo.mock.calls[0][1];
            expect(entryArg.channelTitle).toBe("My Channel Name");
        });

        it("continues video sync when db.getAll() fails (pre-read failure)", async () => {
            setupHappyPath([makeVideo()]);
            mockGetAll.mockRejectedValue(new Error("Firestore unavailable"));

            const result = await service.syncChannel(
                USER_ID, CHANNEL_ID, makeTrendChannel(), API_KEY,
            );

            // Video sync still completes
            expect(result.videosProcessed).toBe(1);
            expect(mockBatchSet).toHaveBeenCalled();
            expect(mockBatchCommit).toHaveBeenCalled();
        });

        it("does not exceed 500 ops per batch (225 videos max per chunk)", async () => {
            const videos = Array.from({ length: 225 }, (_, i) =>
                makeVideo({ id: `v${i}` }),
            );
            setupHappyPath(videos);
            mockGetAll.mockResolvedValue([]);
            mockIsContentChanged.mockReturnValue(true);

            await service.syncChannel(USER_ID, CHANNEL_ID, makeTrendChannel(), API_KEY);

            // 225 video writes + 225 queue writes = 450 ops (< 500)
            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
            // batch.set called: 225 (videos) + 225 (queue) = 450
            expect(mockBatchSet).toHaveBeenCalledTimes(225);
            expect(mockEnqueueVideo).toHaveBeenCalledTimes(225);
        });
    });

    /* ================================================================
     * refreshSubscriberCounts
     * ================================================================ */
    describe("refreshSubscriberCounts", () => {
        // ─── 12. Happy path ──────────────────────────────────────────────
        it("calls API and updates Firestore for each channel", async () => {
            const counts = new Map<string, number>([
                ["UC-a", 10000],
                ["UC-b", 25000],
            ]);
            mockGetChannelSubscriberCounts.mockResolvedValue({
                counts,
                quotaUsed: 1,
            });

            const result = await service.refreshSubscriberCounts(
                USER_ID,
                CHANNEL_ID,
                ["UC-a", "UC-b"],
                API_KEY,
            );

            expect(mockGetChannelSubscriberCounts).toHaveBeenCalledWith([
                "UC-a",
                "UC-b",
            ]);

            // Batch updates for each channel
            expect(mockBatchUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: `users/${USER_ID}/channels/${CHANNEL_ID}/trendChannels/UC-a`,
                }),
                { subscriberCount: 10000 },
            );
            expect(mockBatchUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: `users/${USER_ID}/channels/${CHANNEL_ID}/trendChannels/UC-b`,
                }),
                { subscriberCount: 25000 },
            );
            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
            expect(result).toBe(1);
        });

        // ─── 13. Empty array → 0, no API call ───────────────────────────
        it("returns 0 immediately for empty channel array", async () => {
            const result = await service.refreshSubscriberCounts(
                USER_ID,
                CHANNEL_ID,
                [],
                API_KEY,
            );

            expect(result).toBe(0);
            expect(mockGetChannelSubscriberCounts).not.toHaveBeenCalled();
            expect(mockBatchCommit).not.toHaveBeenCalled();
        });

        // ─── 14. Returns correct quotaUsed ───────────────────────────────
        it("returns quotaUsed from YouTube service", async () => {
            mockGetChannelSubscriberCounts.mockResolvedValue({
                counts: new Map([["UC-x", 100]]),
                quotaUsed: 3,
            });

            const result = await service.refreshSubscriberCounts(
                USER_ID,
                CHANNEL_ID,
                ["UC-x"],
                API_KEY,
            );

            expect(result).toBe(3);
        });
    });

    /* ================================================================
     * sendNotification
     * ================================================================ */
    describe("sendNotification", () => {
        const stats = {
            processedVideos: 10,
            processedChannels: 2,
            quota: 50,
            quotaList: 20,
            quotaDetails: 30,
        };

        // ─── 15. Writes notification with correct structure ──────────────
        it("writes notification with correct type, category, and quotaBreakdown", async () => {
            await service.sendNotification(
                USER_ID,
                CHANNEL_ID,
                "Sync Complete",
                "Processed 10 videos",
                stats,
            );

            expect(mockCollectionAdd).toHaveBeenCalledWith({
                title: "Sync Complete",
                message: "Processed 10 videos",
                type: "success",
                timestamp: "SERVER_TIMESTAMP",
                isRead: false,
                meta: "50",
                quotaBreakdown: {
                    list: 20,
                    details: 30,
                    search: 0,
                },
                category: "trends",
            });
        });

        // ─── 16. Writes to correct Firestore path ───────────────────────
        it("writes to the correct notifications collection path", async () => {
            await service.sendNotification(
                USER_ID,
                CHANNEL_ID,
                "Title",
                "Message",
                stats,
            );

            expect(mockCollection).toHaveBeenCalledWith(
                `users/${USER_ID}/channels/${CHANNEL_ID}/notifications`,
            );
        });

        it("converts quota to string for meta field", async () => {
            await service.sendNotification(USER_ID, CHANNEL_ID, "T", "M", {
                ...stats,
                quota: 123,
            });

            expect(mockCollectionAdd).toHaveBeenCalledWith(
                expect.objectContaining({ meta: "123" }),
            );
        });
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

// --- Mocks ---

const mockGetPlaylistVideos = vi.fn();
const mockGetVideoDetails = vi.fn();

vi.mock("../../../../youtube.js", () => ({
    YouTubeService: class {
        getPlaylistVideos = mockGetPlaylistVideos;
        getVideoDetails = mockGetVideoDetails;
    },
}));

const mockGetAll = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockDocGet = vi.fn();
const mockCollectionWhereGet = vi.fn().mockResolvedValue({ docs: [] });

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path, get: () => mockDocGet(path) }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        batch: () => ({
            set: mockBatchSet,
            commit: mockBatchCommit,
        }),
        collection: () => ({
            where: () => ({ get: () => mockCollectionWhereGet() }),
        }),
    },
}));

import { handleBrowseChannelVideos } from "../browseChannelVideos.js";

const CTX: ToolContext = { userId: "user1", channelId: "ch1", youtubeApiKey: "test-key" };

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

describe("handleBrowseChannelVideos", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockBatchCommit.mockResolvedValue(undefined);
    });

    // --- Args validation ---

    it("returns error when uploadsPlaylistId is missing", async () => {
        const result = await handleBrowseChannelVideos({}, CTX);
        expect(result.error).toContain("uploadsPlaylistId");
        expect(result.error).toContain("getChannelOverview");
    });

    it("returns error when uploadsPlaylistId is empty string", async () => {
        const result = await handleBrowseChannelVideos({ uploadsPlaylistId: "  " }, CTX);
        expect(result.error).toContain("uploadsPlaylistId");
    });

    it("returns error when YouTube API key is missing", async () => {
        const ctxNoKey: ToolContext = { userId: "user1", channelId: "ch1" };
        const result = await handleBrowseChannelVideos({ uploadsPlaylistId: "UUtest" }, ctxNoKey);
        expect(result.error).toContain("API key");
    });

    // --- Successful fetch ---

    it("fetches and returns videos from uploads playlist", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1", "v2", "v3"], quotaUsed: 1 });

        // All 3 videos cached in own collection
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: "Video 1", publishedAt: "2024-01-01", viewCount: 100, thumbnail: "thumb1.jpg" }),
            makeSnap(true, { title: "Video 2", publishedAt: "2024-01-02", viewCount: 200, thumbnail: "thumb2.jpg" }),
            makeSnap(true, { title: "Video 3", publishedAt: "2024-01-03", viewCount: 300, thumbnail: "thumb3.jpg" }),
        ]).mockResolvedValueOnce([
            makeSnap(false),
            makeSnap(false),
            makeSnap(false),
        ]);

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest123456789012345" },
            CTX,
        );

        expect(result.error).toBeUndefined();

        const videos = result.videos as Array<{ videoId: string; title: string }>;
        expect(videos).toHaveLength(3);
        expect(videos[0].videoId).toBe("v1");
        expect(videos[0].title).toBe("Video 1");

        expect(result.alreadyCached).toBe(3);
        expect(result.fetchedFromYouTube).toBe(0);
    });

    it("fetches missing videos from YouTube and caches them", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1", "v2"], quotaUsed: 1 });

        // v1 cached, v2 not found in either collection
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "Cached", publishedAt: "2024-01-01", viewCount: 100 }),
                makeSnap(false),
            ])
            .mockResolvedValueOnce([
                makeSnap(false),
                makeSnap(false),
            ]);

        // YouTube API returns v2
        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{
                id: "v2",
                snippet: {
                    title: "From YouTube",
                    channelTitle: "Test Channel",
                    publishedAt: "2024-01-02",
                    thumbnails: { medium: { url: "thumb2.jpg" } },
                },
                statistics: { viewCount: "500" },
            }],
            quotaUsed: 1,
        });

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest123456789012345" },
            CTX,
        );

        const videos = result.videos as Array<{ videoId: string }>;
        expect(videos).toHaveLength(2);
        expect(result.alreadyCached).toBe(1);
        expect(result.fetchedFromYouTube).toBe(1);

        // Verify cache write
        expect(mockBatchSet).toHaveBeenCalled();
        expect(mockBatchCommit).toHaveBeenCalled();
    });

    it("filters videos by publishedAfter", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1", "v2", "v3"], quotaUsed: 1 });

        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: "Old", publishedAt: "2023-06-01", viewCount: 50 }),
            makeSnap(true, { title: "Recent", publishedAt: "2024-01-15", viewCount: 200 }),
            makeSnap(true, { title: "New", publishedAt: "2024-02-01", viewCount: 300 }),
        ]).mockResolvedValueOnce([
            makeSnap(false),
            makeSnap(false),
            makeSnap(false),
        ]);

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest123456789012345", publishedAfter: "2024-01-01" },
            CTX,
        );

        const videos = result.videos as Array<{ title: string }>;
        expect(videos).toHaveLength(2);
        expect(videos.map(v => v.title)).toEqual(["Recent", "New"]);
    });

    it("reports progress at each phase", async () => {
        const progress = vi.fn();
        const ctxProgress: ToolContext = { ...CTX, reportProgress: progress };

        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1"], quotaUsed: 1 });
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: "V1", publishedAt: "2024-01-01" })])
            .mockResolvedValueOnce([makeSnap(false)]);

        await handleBrowseChannelVideos({ uploadsPlaylistId: "UUtest" }, ctxProgress);

        expect(progress).toHaveBeenCalledWith("Fetching video list from YouTube...");
        expect(progress).toHaveBeenCalledWith("Checking cache for existing videos...");
    });

    it("handles YouTube API failure gracefully during video fetch", async () => {
        mockGetPlaylistVideos.mockRejectedValueOnce(new Error("Quota exceeded"));

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest123456789012345" },
            CTX,
        );

        expect(result.error).toContain("Failed to fetch video list");
    });

    it("returns quotaUsed as sum of list + details", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1", "v2"], quotaUsed: 1 });

        // v1 cached, v2 missing
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "Cached", publishedAt: "2024-01-01" }),
                makeSnap(false),
            ])
            .mockResolvedValueOnce([
                makeSnap(false),
                makeSnap(false),
            ]);

        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{
                id: "v2",
                snippet: { title: "YT", channelTitle: "Ch", publishedAt: "2024-01-02", thumbnails: {} },
                statistics: { viewCount: "50" },
            }],
            quotaUsed: 1,
        });

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest" },
            CTX,
        );

        expect(result.quotaUsed).toBe(2); // 1 list + 1 details
    });

    // --- Own channel sync comparison ---

    it("includes ownChannelSync when own videos match target channelId", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1", "v2", "v3"], quotaUsed: 1 });

        // v1, v2 in own videos/ with matching channelId — v3 not in any cache
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "Own 1", publishedAt: "2024-01-01", viewCount: 100, channelId: "UCown" }),
                makeSnap(true, { title: "Own 2", publishedAt: "2024-01-02", viewCount: 200, channelId: "UCown" }),
                makeSnap(false),
            ])
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false), makeSnap(false)]);

        // v3 fetched from YouTube
        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{ id: "v3", snippet: { title: "YT 3", publishedAt: "2024-01-03" }, statistics: { viewCount: "300" }, contentDetails: {} }],
            quotaUsed: 1,
        });

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest", channelId: "UCown" },
            CTX,
        );

        const sync = result.ownChannelSync as { inApp: number; onYouTube: number; notInApp: number };
        expect(sync).toBeDefined();
        expect(sync.inApp).toBe(2);
        expect(sync.onYouTube).toBe(3);
        expect(sync.notInApp).toBe(1);
    });

    it("omits ownChannelSync when own videos have different channelId (foreign videos in collection)", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1"], quotaUsed: 1 });

        // v1 in own videos/ but belongs to a different channel
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "Foreign", publishedAt: "2024-01-01", viewCount: 50, channelId: "UCother" }),
            ])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest", channelId: "UCtarget" },
            CTX,
        );

        expect(result.ownChannelSync).toBeUndefined();
    });

    it("omits ownChannelSync when channelId not provided", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1"], quotaUsed: 1 });

        // v1 in own videos/ — but no channelId arg passed, so no sync and no trend check
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "Own", publishedAt: "2024-01-01", viewCount: 100, channelId: "UCown" }),
            ])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest" },
            CTX,
        );

        expect(result.ownChannelSync).toBeUndefined();
    });

    it("does not include channel info in response (SRP: overview is separate tool)", async () => {
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["v1"], quotaUsed: 1 });
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: "V1", publishedAt: "2024-01-01" })])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest" },
            CTX,
        );

        // No channel info — that's getChannelOverview's job
        expect(result.channel).toBeUndefined();
        expect(result.channelTitle).toBeUndefined();
        expect(result._systemNote).toBeUndefined();
    });

    // --- Custom video resolution via publishedVideoId ---

    it("counts custom videos (matched via publishedVideoId) in ownChannelSync", async () => {
        // YouTube channel has 2 videos: ytId1 and ytId2
        mockGetPlaylistVideos.mockResolvedValueOnce({ videoIds: ["ytId1", "ytId2"], quotaUsed: 1 });

        // Step 1: direct lookup — neither found by doc ID
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false)])  // videos/
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false)]); // cached_external_videos/

        // Step 2: reverse lookup — both found as custom videos
        mockCollectionWhereGet.mockResolvedValueOnce({
            docs: [
                {
                    id: "custom-111",
                    data: () => ({
                        title: "Custom Video 1", publishedVideoId: "ytId1",
                        channelId: "UCown", publishedAt: "2024-01-01", viewCount: 1000,
                        isCustom: true,
                    }),
                },
                {
                    id: "custom-222",
                    data: () => ({
                        title: "Custom Video 2", publishedVideoId: "ytId2",
                        channelId: "UCown", publishedAt: "2024-02-01", viewCount: 2000,
                        isCustom: true,
                    }),
                },
            ],
        });

        const result = await handleBrowseChannelVideos(
            { uploadsPlaylistId: "UUtest", channelId: "UCown" },
            CTX,
        );

        // Both custom videos should be counted as "in app"
        const sync = result.ownChannelSync as { inApp: number; onYouTube: number; notInApp: number };
        expect(sync).toBeDefined();
        expect(sync.inApp).toBe(2);
        expect(sync.onYouTube).toBe(2);
        expect(sync.notInApp).toBe(0);

        // Videos should appear in the response
        const videos = result.videos as Array<{ videoId: string; title: string }>;
        expect(videos).toHaveLength(2);
        expect(videos[0].title).toBe("Custom Video 1");
    });
});

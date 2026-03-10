import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { YouTubeService } from "../youtube.js";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("YouTubeService", () => {
    let svc: YouTubeService;

    beforeEach(() => {
        vi.clearAllMocks();
        svc = new YouTubeService("test-api-key");
    });

    // =========================================================================
    // resolveChannelId
    // =========================================================================

    describe("resolveChannelId", () => {
        it("extracts channelId from /channel/UCxxx URL (0 units)", async () => {
            const result = await svc.resolveChannelId("https://youtube.com/channel/UCxyz123456789012345");
            expect(result).toEqual({ channelId: "UCxyz123456789012345", quotaUsed: 0 });
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        it("extracts channelId from raw UC-prefixed string (0 units)", async () => {
            const result = await svc.resolveChannelId("UCxyz123456789012345");
            expect(result).toEqual({ channelId: "UCxyz123456789012345", quotaUsed: 0 });
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        it("resolves @handle via API (1 unit)", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { items: [{ id: "UCresolved123456789012" }] },
            });

            const result = await svc.resolveChannelId("@cozy_dreams");
            expect(result).toEqual({ channelId: "UCresolved123456789012", quotaUsed: 1 });
            expect(mockedAxios.get).toHaveBeenCalledWith(
                "https://www.googleapis.com/youtube/v3/channels",
                expect.objectContaining({
                    params: expect.objectContaining({ forHandle: "@cozy_dreams" }),
                }),
            );
        });

        it("resolves youtube.com/@handle URL via API", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { items: [{ id: "UCfromHandle12345678901" }] },
            });

            const result = await svc.resolveChannelId("https://www.youtube.com/@littlething/videos");
            expect(result).toEqual({ channelId: "UCfromHandle12345678901", quotaUsed: 1 });
            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({ forHandle: "@littlething" }),
                }),
            );
        });

        it("resolves youtube.com/c/Name as handle", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { items: [{ id: "UCcustom1234567890123" }] },
            });

            const result = await svc.resolveChannelId("https://youtube.com/c/MyChannel");
            expect(result.channelId).toBe("UCcustom1234567890123");
        });

        it("resolves youtube.com/user/Name as handle", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { items: [{ id: "UCuser12345678901234" }] },
            });

            const result = await svc.resolveChannelId("youtube.com/user/OldUser");
            expect(result.channelId).toBe("UCuser12345678901234");
        });

        it("treats bare string as handle", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { items: [{ id: "UCbare12345678901234" }] },
            });

            const result = await svc.resolveChannelId("littlething");
            expect(result.channelId).toBe("UCbare12345678901234");
            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    params: expect.objectContaining({ forHandle: "@littlething" }),
                }),
            );
        });

        it("throws on empty input", async () => {
            await expect(svc.resolveChannelId("")).rejects.toThrow("Empty channel input");
            await expect(svc.resolveChannelId("  ")).rejects.toThrow("Empty channel input");
        });

        it("throws when handle not found on YouTube", async () => {
            mockedAxios.get.mockResolvedValueOnce({ data: { items: [] } });
            await expect(svc.resolveChannelId("@nonexistent")).rejects.toThrow("Channel not found");
        });
    });

    // =========================================================================
    // getChannelInfo
    // =========================================================================

    describe("getChannelInfo", () => {
        it("returns structured channel info", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        id: "UCtest1234567890123456",
                        snippet: {
                            title: "Cozy Dreams",
                            customUrl: "@cozydreams",
                            thumbnails: { medium: { url: "https://yt3.com/avatar.jpg" } },
                        },
                        statistics: {
                            subscriberCount: "12500",
                            videoCount: "47",
                            viewCount: "500000",
                        },
                        contentDetails: {
                            relatedPlaylists: { uploads: "UUtest1234567890123456" },
                        },
                    }],
                },
            });

            const info = await svc.getChannelInfo("UCtest1234567890123456");
            expect(info).toEqual({
                id: "UCtest1234567890123456",
                title: "Cozy Dreams",
                handle: "@cozydreams",
                subscriberCount: 12500,
                videoCount: 47,
                uploadsPlaylistId: "UUtest1234567890123456",
                avatarUrl: "https://yt3.com/avatar.jpg",
                quotaUsed: 1,
            });
        });

        it("throws when channel not found", async () => {
            mockedAxios.get.mockResolvedValueOnce({ data: { items: [] } });
            await expect(svc.getChannelInfo("UCnotfound")).rejects.toThrow("Channel not found");
        });

        it("handles missing optional fields", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        id: "UCmin123456789012345678",
                        snippet: { title: "Minimal" },
                        statistics: {},
                        contentDetails: {
                            relatedPlaylists: { uploads: "UUmin123456789012345678" },
                        },
                    }],
                },
            });

            const info = await svc.getChannelInfo("UCmin123456789012345678");
            expect(info.subscriberCount).toBe(0);
            expect(info.videoCount).toBe(0);
            expect(info.avatarUrl).toBeUndefined();
            expect(info.handle).toBeUndefined();
        });
    });

    // =========================================================================
    // getCommentThreads
    // =========================================================================

    describe("getCommentThreads", () => {
        const COMMENT_THREAD_URL = "https://www.googleapis.com/youtube/v3/commentThreads";

        function makeThread(text: string, opts?: {
            author?: string;
            authorChannelId?: string;
            likeCount?: number;
            replyCount?: number;
            replies?: Array<{ author: string; text: string; likeCount: number; publishedAt: string }>;
        }) {
            return {
                snippet: {
                    topLevelComment: {
                        snippet: {
                            authorDisplayName: opts?.author ?? "User",
                            authorChannelId: opts?.authorChannelId ? { value: opts.authorChannelId } : undefined,
                            textDisplay: text,
                            likeCount: opts?.likeCount ?? 0,
                            publishedAt: "2024-01-15T10:00:00Z",
                        },
                    },
                    totalReplyCount: opts?.replyCount ?? 0,
                },
                replies: opts?.replies ? {
                    comments: opts.replies.map(r => ({
                        snippet: {
                            authorDisplayName: r.author,
                            textDisplay: r.text,
                            likeCount: r.likeCount,
                            publishedAt: r.publishedAt,
                        },
                    })),
                } : undefined,
            };
        }

        it("fetches comments with relevance order and textFormat=plainText", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    pageInfo: { totalResults: 150, resultsPerPage: 100 },
                    items: [makeThread("Great video!", { author: "Fan", likeCount: 5 })],
                    nextPageToken: "page2token",
                },
            });

            const result = await svc.getCommentThreads("vid123");

            expect(mockedAxios.get).toHaveBeenCalledWith(
                COMMENT_THREAD_URL,
                expect.objectContaining({
                    params: expect.objectContaining({
                        part: "snippet,replies",
                        videoId: "vid123",
                        order: "relevance",
                        maxResults: 100,
                        textFormat: "plainText",
                        key: "test-api-key",
                    }),
                }),
            );

            expect(result.comments).toHaveLength(1);
            expect(result.comments[0].text).toBe("Great video!");
            expect(result.comments[0].author).toBe("Fan");
            expect(result.comments[0].likeCount).toBe(5);
            expect(result.totalResults).toBe(150);
            expect(result.nextPageToken).toBe("page2token");
            expect(result.quotaUsed).toBe(1);
        });

        it("passes pageToken for pagination", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    pageInfo: { totalResults: 200, resultsPerPage: 100 },
                    items: [makeThread("Page 2 comment")],
                },
            });

            await svc.getCommentThreads("vid123", { pageToken: "nextToken" });

            expect(mockedAxios.get).toHaveBeenCalledWith(
                COMMENT_THREAD_URL,
                expect.objectContaining({
                    params: expect.objectContaining({ pageToken: "nextToken" }),
                }),
            );
        });

        it("throws on 403 commentsDisabled", async () => {
            const error = new Error("Comments are disabled") as Error & { response?: { status: number } };
            error.response = { status: 403 };
            mockedAxios.get.mockRejectedValueOnce(error);

            await expect(svc.getCommentThreads("vid_disabled")).rejects.toThrow();
        });

        it("returns empty array for video with 0 comments", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    pageInfo: { totalResults: 0, resultsPerPage: 100 },
                    items: [],
                },
            });

            const result = await svc.getCommentThreads("vid_empty");
            expect(result.comments).toEqual([]);
            expect(result.totalResults).toBe(0);
            expect(result.nextPageToken).toBeUndefined();
        });

        it("includes inline replies when present", async () => {
            const thread = makeThread("Top comment", {
                replyCount: 2,
                replies: [
                    { author: "Replier1", text: "Reply 1", likeCount: 1, publishedAt: "2024-01-16T10:00:00Z" },
                    { author: "Replier2", text: "Reply 2", likeCount: 0, publishedAt: "2024-01-17T10:00:00Z" },
                ],
            });

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    pageInfo: { totalResults: 1, resultsPerPage: 100 },
                    items: [thread],
                },
            });

            const result = await svc.getCommentThreads("vid_replies");
            expect(result.comments[0].topReplies).toHaveLength(2);
            expect(result.comments[0].topReplies![0].text).toBe("Reply 1");
            expect(result.comments[0].replyCount).toBe(2);
        });

        it("omits topReplies when no replies exist", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    pageInfo: { totalResults: 1, resultsPerPage: 100 },
                    items: [makeThread("No replies here")],
                },
            });

            const result = await svc.getCommentThreads("vid_noreplies");
            expect(result.comments[0].topReplies).toBeUndefined();
        });

        it("passes order=time when specified", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    pageInfo: { totalResults: 10, resultsPerPage: 100 },
                    items: [makeThread("Recent")],
                },
            });

            await svc.getCommentThreads("vid123", { order: "time" });

            expect(mockedAxios.get).toHaveBeenCalledWith(
                COMMENT_THREAD_URL,
                expect.objectContaining({
                    params: expect.objectContaining({ order: "time" }),
                }),
            );
        });

        it("does not include nextPageToken when absent in response", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    pageInfo: { totalResults: 5, resultsPerPage: 100 },
                    items: [makeThread("Last page")],
                },
            });

            const result = await svc.getCommentThreads("vid123");
            expect(result.nextPageToken).toBeUndefined();
            expect("nextPageToken" in result).toBe(false);
        });
    });

    // =========================================================================
    // getPlaylistVideos
    // =========================================================================

    describe("getPlaylistVideos", () => {
        const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";

        it("returns all videoIds from a single page (no nextPageToken)", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    items: [
                        { contentDetails: { videoId: "vid1" } },
                        { contentDetails: { videoId: "vid2" } },
                        { contentDetails: { videoId: "vid3" } },
                    ],
                },
            });

            const result = await svc.getPlaylistVideos("PLtest123");
            expect(result.videoIds).toEqual(["vid1", "vid2", "vid3"]);
            expect(result.quotaUsed).toBe(1);
            expect(mockedAxios.get).toHaveBeenCalledTimes(1);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                PLAYLIST_ITEMS_URL,
                expect.objectContaining({
                    params: expect.objectContaining({
                        part: "contentDetails",
                        playlistId: "PLtest123",
                        maxResults: 50,
                        key: "test-api-key",
                    }),
                }),
            );
        });

        it("follows nextPageToken across multiple pages", async () => {
            mockedAxios.get
                .mockResolvedValueOnce({
                    data: {
                        items: [
                            { contentDetails: { videoId: "vid1" } },
                            { contentDetails: { videoId: "vid2" } },
                        ],
                        nextPageToken: "page2token",
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        items: [
                            { contentDetails: { videoId: "vid3" } },
                        ],
                    },
                });

            const result = await svc.getPlaylistVideos("PLpaginated");
            expect(result.videoIds).toEqual(["vid1", "vid2", "vid3"]);
            expect(result.quotaUsed).toBe(2);
            expect(mockedAxios.get).toHaveBeenCalledTimes(2);
            expect(mockedAxios.get).toHaveBeenNthCalledWith(
                2,
                PLAYLIST_ITEMS_URL,
                expect.objectContaining({
                    params: expect.objectContaining({ pageToken: "page2token" }),
                }),
            );
        });

        it("returns empty array for empty playlist", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { items: [] },
            });

            const result = await svc.getPlaylistVideos("PLempty");
            expect(result.videoIds).toEqual([]);
            expect(result.quotaUsed).toBe(1);
        });

        it("throws on API error", async () => {
            mockedAxios.get.mockRejectedValueOnce(new Error("API quota exceeded"));
            await expect(svc.getPlaylistVideos("PLfail")).rejects.toThrow("API quota exceeded");
        });
    });

    // =========================================================================
    // getVideoDetails
    // =========================================================================

    describe("getVideoDetails", () => {
        const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

        it("returns immediately for empty array with 0 quota", async () => {
            const result = await svc.getVideoDetails([]);
            expect(result).toEqual({ videos: [], quotaUsed: 0 });
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        it("fetches a single batch (≤50 IDs) in 1 API call", async () => {
            const mockVideos = [
                { id: "vid1", snippet: { title: "Video 1" } },
                { id: "vid2", snippet: { title: "Video 2" } },
            ];

            mockedAxios.get.mockResolvedValueOnce({
                data: { items: mockVideos },
            });

            const result = await svc.getVideoDetails(["vid1", "vid2"]);
            expect(result.videos).toEqual(mockVideos);
            expect(result.quotaUsed).toBe(1);
            expect(mockedAxios.get).toHaveBeenCalledTimes(1);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                VIDEOS_URL,
                expect.objectContaining({
                    params: expect.objectContaining({
                        part: "snippet,statistics,contentDetails",
                        id: "vid1,vid2",
                        key: "test-api-key",
                    }),
                }),
            );
        });

        it("chunks IDs into batches of 50 for large requests", async () => {
            // Create 75 video IDs → should produce 2 batches (50 + 25)
            const ids = Array.from({ length: 75 }, (_, i) => `vid${i}`);
            const batch1Items = ids.slice(0, 50).map(id => ({ id }));
            const batch2Items = ids.slice(50).map(id => ({ id }));

            mockedAxios.get
                .mockResolvedValueOnce({ data: { items: batch1Items } })
                .mockResolvedValueOnce({ data: { items: batch2Items } });

            const result = await svc.getVideoDetails(ids);
            expect(result.videos).toHaveLength(75);
            expect(result.quotaUsed).toBe(2);
            expect(mockedAxios.get).toHaveBeenCalledTimes(2);

            // Verify first batch has 50 IDs
            const firstCallIds = mockedAxios.get.mock.calls[0][1]?.params.id as string;
            expect(firstCallIds.split(",")).toHaveLength(50);

            // Verify second batch has 25 IDs
            const secondCallIds = mockedAxios.get.mock.calls[1][1]?.params.id as string;
            expect(secondCallIds.split(",")).toHaveLength(25);
        });

        it("throws on API error", async () => {
            mockedAxios.get.mockRejectedValueOnce(new Error("Video not found"));
            await expect(svc.getVideoDetails(["vid1"])).rejects.toThrow("Video not found");
        });
    });

    // =========================================================================
    // getChannelSubscriberCounts
    // =========================================================================

    describe("getChannelSubscriberCounts", () => {
        const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

        it("returns empty Map and 0 quota for empty array", async () => {
            const result = await svc.getChannelSubscriberCounts([]);
            expect(result.counts).toEqual(new Map());
            expect(result.quotaUsed).toBe(0);
            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        it("returns correct subscriber counts from a single batch", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    items: [
                        { id: "UC_ch1", statistics: { subscriberCount: "50000" } },
                        { id: "UC_ch2", statistics: { subscriberCount: "1200" } },
                    ],
                },
            });

            const result = await svc.getChannelSubscriberCounts(["UC_ch1", "UC_ch2"]);
            expect(result.counts.get("UC_ch1")).toBe(50000);
            expect(result.counts.get("UC_ch2")).toBe(1200);
            expect(result.quotaUsed).toBe(1);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                CHANNELS_URL,
                expect.objectContaining({
                    params: expect.objectContaining({
                        part: "statistics",
                        id: "UC_ch1,UC_ch2",
                        key: "test-api-key",
                    }),
                }),
            );
        });

        it("chunks into batches of 50 for large requests", async () => {
            const channelIds = Array.from({ length: 60 }, (_, i) => `UC_ch${i}`);
            const batch1Items = channelIds.slice(0, 50).map(id => ({
                id,
                statistics: { subscriberCount: "100" },
            }));
            const batch2Items = channelIds.slice(50).map(id => ({
                id,
                statistics: { subscriberCount: "200" },
            }));

            mockedAxios.get
                .mockResolvedValueOnce({ data: { items: batch1Items } })
                .mockResolvedValueOnce({ data: { items: batch2Items } });

            const result = await svc.getChannelSubscriberCounts(channelIds);
            expect(result.counts.size).toBe(60);
            expect(result.quotaUsed).toBe(2);
            expect(mockedAxios.get).toHaveBeenCalledTimes(2);

            // First 50 channels get count 100
            expect(result.counts.get("UC_ch0")).toBe(100);
            // Last 10 channels get count 200
            expect(result.counts.get("UC_ch55")).toBe(200);
        });

        it("defaults to 0 when subscriberCount is missing", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    items: [
                        { id: "UC_hidden", statistics: {} },
                    ],
                },
            });

            const result = await svc.getChannelSubscriberCounts(["UC_hidden"]);
            expect(result.counts.get("UC_hidden")).toBe(0);
        });
    });

    // =========================================================================
    // getChannelAvatar
    // =========================================================================

    describe("getChannelAvatar", () => {
        const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

        it("returns medium thumbnail URL when available", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        snippet: {
                            thumbnails: {
                                medium: { url: "https://yt3.com/medium-avatar.jpg" },
                                default: { url: "https://yt3.com/default-avatar.jpg" },
                            },
                        },
                    }],
                },
            });

            const result = await svc.getChannelAvatar("UCtest123");
            expect(result.avatarUrl).toBe("https://yt3.com/medium-avatar.jpg");
            expect(result.quotaUsed).toBe(1);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                CHANNELS_URL,
                expect.objectContaining({
                    params: expect.objectContaining({
                        part: "snippet",
                        id: "UCtest123",
                        key: "test-api-key",
                    }),
                }),
            );
        });

        it("falls back to default thumbnail when medium is missing", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    items: [{
                        snippet: {
                            thumbnails: {
                                default: { url: "https://yt3.com/default-avatar.jpg" },
                            },
                        },
                    }],
                },
            });

            const result = await svc.getChannelAvatar("UCtest456");
            expect(result.avatarUrl).toBe("https://yt3.com/default-avatar.jpg");
            expect(result.quotaUsed).toBe(1);
        });

        it("returns undefined avatarUrl when no items in response", async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { items: [] },
            });

            const result = await svc.getChannelAvatar("UCnotfound");
            expect(result.avatarUrl).toBeUndefined();
            expect(result.quotaUsed).toBe(1);
        });

        it("swallows errors and returns quotaUsed=0", async () => {
            mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));

            const result = await svc.getChannelAvatar("UCfail");
            expect(result.avatarUrl).toBeUndefined();
            expect(result.quotaUsed).toBe(0);
        });
    });
});

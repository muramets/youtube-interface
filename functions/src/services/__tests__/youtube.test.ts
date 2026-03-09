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
});

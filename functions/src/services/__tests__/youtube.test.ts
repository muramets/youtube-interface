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
});

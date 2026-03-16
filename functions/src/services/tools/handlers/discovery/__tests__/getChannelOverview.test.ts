import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

// --- Mocks ---

const mockResolveChannelId = vi.fn();
const mockGetChannelInfo = vi.fn();

vi.mock("../../../../youtube.js", () => ({
    YouTubeService: class {
        resolveChannelId = mockResolveChannelId;
        getChannelInfo = mockGetChannelInfo;
    },
}));

import { handleGetChannelOverview } from "../getChannelOverview.js";

const CTX: ToolContext = { userId: "user1", channelId: "ch1", youtubeApiKey: "test-key" };

const CHANNEL_INFO = {
    id: "UCtest123456789012345",
    title: "Test Channel",
    handle: "@testchannel",
    subscriberCount: 1000,
    videoCount: 120,
    uploadsPlaylistId: "UUtest123456789012345",
    avatarUrl: "https://yt3.com/avatar.jpg",
    quotaUsed: 1,
};

describe("handleGetChannelOverview", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // --- Args validation ---

    it("returns error when channelId is missing", async () => {
        const result = await handleGetChannelOverview({}, CTX);
        expect(result.error).toContain("channelId");
    });

    it("returns error when channelId is empty string", async () => {
        const result = await handleGetChannelOverview({ channelId: "  " }, CTX);
        expect(result.error).toContain("channelId");
    });

    it("returns error when YouTube API key is missing", async () => {
        const ctxNoKey: ToolContext = { userId: "user1", channelId: "ch1" };
        const result = await handleGetChannelOverview({ channelId: "@test" }, ctxNoKey);
        expect(result.error).toContain("API key");
    });

    // --- Channel resolution ---

    it("returns error when channel resolution fails", async () => {
        mockResolveChannelId.mockRejectedValueOnce(new Error("Channel not found"));

        const result = await handleGetChannelOverview({ channelId: "@nonexistent" }, CTX);
        expect(result.error).toContain("Failed to resolve channel");
    });

    it("returns error when getChannelInfo fails", async () => {
        mockResolveChannelId.mockResolvedValueOnce({ channelId: "UCtest123456789012345", quotaUsed: 1 });
        mockGetChannelInfo.mockRejectedValueOnce(new Error("API quota exceeded"));

        const result = await handleGetChannelOverview({ channelId: "@test" }, CTX);
        expect(result.error).toContain("Failed to get channel info");
    });

    // --- Successful overview ---

    it("returns channel metadata with QUOTA_GATE and uploadsPlaylistId", async () => {
        mockResolveChannelId.mockResolvedValueOnce({ channelId: "UCtest123456789012345", quotaUsed: 1 });
        mockGetChannelInfo.mockResolvedValueOnce(CHANNEL_INFO);

        const result = await handleGetChannelOverview({ channelId: "@testchannel" }, CTX);

        expect(result.error).toBeUndefined();
        expect(result._systemNote).toContain("QUOTA_GATE");
        expect(result._systemNote).toContain("120 videos");
        expect(result.channelId).toBe("UCtest123456789012345");
        expect(result.channelTitle).toBe("Test Channel");
        expect(result.handle).toBe("@testchannel");
        expect(result.videoCount).toBe(120);
        expect(result.subscriberCount).toBe(1000);
        expect(result.uploadsPlaylistId).toBe("UUtest123456789012345");
    });

    it("calculates correct quota estimate", async () => {
        mockResolveChannelId.mockResolvedValueOnce({ channelId: "UCtest123456789012345", quotaUsed: 0 });
        mockGetChannelInfo.mockResolvedValueOnce({ ...CHANNEL_INFO, videoCount: 150 });

        const result = await handleGetChannelOverview({ channelId: "UCtest123456789012345" }, CTX);

        // 150 videos: ceil(150/50)=3 list pages + ceil(150/50)=3 detail batches = 6
        expect(result.quotaCost).toBe(6);
    });

    it("reports quotaUsed as sum of resolve + info", async () => {
        mockResolveChannelId.mockResolvedValueOnce({ channelId: "UCtest123456789012345", quotaUsed: 1 });
        mockGetChannelInfo.mockResolvedValueOnce(CHANNEL_INFO); // quotaUsed: 1

        const result = await handleGetChannelOverview({ channelId: "@testchannel" }, CTX);

        expect(result.quotaUsed).toBe(2); // 1 resolve + 1 info
    });

    it("reports progress at each step", async () => {
        const progress = vi.fn();
        const ctxProgress: ToolContext = { ...CTX, reportProgress: progress };

        mockResolveChannelId.mockResolvedValueOnce({ channelId: "UCtest123456789012345", quotaUsed: 0 });
        mockGetChannelInfo.mockResolvedValueOnce(CHANNEL_INFO);

        await handleGetChannelOverview({ channelId: "@test" }, ctxProgress);

        expect(progress).toHaveBeenCalledWith("Resolving channel...");
        expect(progress).toHaveBeenCalledWith("Loading channel info...");
    });

    it("works with raw channel ID (0 resolve quota)", async () => {
        mockResolveChannelId.mockResolvedValueOnce({ channelId: "UCtest123456789012345", quotaUsed: 0 });
        mockGetChannelInfo.mockResolvedValueOnce(CHANNEL_INFO);

        const result = await handleGetChannelOverview({ channelId: "UCtest123456789012345" }, CTX);

        expect(result.quotaUsed).toBe(1); // 0 resolve + 1 info
        expect(result.channelTitle).toBe("Test Channel");
    });
});

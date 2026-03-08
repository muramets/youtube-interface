import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../types.js";

// --- Mocks ---

const mockCollectionGet = vi.fn();

vi.mock("../../../../shared/db.js", () => ({
    db: {
        collection: () => ({ get: mockCollectionGet }),
    },
}));

import { handleListTrendChannels } from "../listTrendChannels.js";

const CTX: ToolContext = { userId: "user1", channelId: "ch1" };

function makeDoc(id: string, data: Record<string, unknown>) {
    return { id, data: () => data };
}

describe("handleListTrendChannels", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // --- Empty state ---

    it("returns empty result when no trend channels exist", async () => {
        mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] });

        const result = await handleListTrendChannels({}, CTX);

        expect(result.error).toBeUndefined();
        expect(result.channels).toEqual([]);
        expect(result.totalChannels).toBe(0);
        expect(result.totalVideos).toBe(0);
        expect(result.dataFreshness).toEqual([]);
    });

    // --- Full channel data ---

    it("returns channels with all expected fields", async () => {
        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC123", {
                    title: "Test Channel",
                    handle: "@testchannel",
                    avatarUrl: "https://example.com/avatar.jpg",
                    videoCount: 42,
                    subscriberCount: 100000,
                    averageViews: 5432.7,
                    lastUpdated: "2025-06-01T00:00:00.000Z",
                    performanceDistribution: { viral: 2, aboveAverage: 10, average: 20, belowAverage: 10 },
                }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);

        expect(result.error).toBeUndefined();
        expect(result.totalChannels).toBe(1);

        const channels = result.channels as Record<string, unknown>[];
        expect(channels).toHaveLength(1);

        const ch = channels[0];
        expect(ch.channelId).toBe("UC123");
        expect(ch.title).toBe("Test Channel");
        expect(ch.handle).toBe("@testchannel");
        expect(ch.avatarUrl).toBe("https://example.com/avatar.jpg");
        expect(ch.videoCount).toBe(42);
        expect(ch.subscriberCount).toBe(100000);
        expect(ch.averageViews).toBe(5433); // rounded
        expect(ch.lastUpdated).toBe("2025-06-01T00:00:00.000Z");
        expect(ch.performanceDistribution).toEqual({ viral: 2, aboveAverage: 10, average: 20, belowAverage: 10 });
    });

    // --- performanceDistribution ---

    it("handles channel without performanceDistribution (pre-existing channel)", async () => {
        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC456", {
                    title: "Old Channel",
                    avatarUrl: "https://example.com/old.jpg",
                    videoCount: 10,
                    subscriberCount: 5000,
                    averageViews: 200,
                    lastUpdated: "2025-01-01T00:00:00.000Z",
                }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);

        const channels = result.channels as Record<string, unknown>[];
        expect(channels).toHaveLength(1);
        expect(channels[0].performanceDistribution).toBeUndefined();
    });

    // --- lastUpdated formats ---

    it("handles lastUpdated as string", async () => {
        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC_str", {
                    title: "String Date",
                    avatarUrl: "a.jpg",
                    videoCount: 1,
                    lastUpdated: "2025-03-15T12:00:00.000Z",
                }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);
        const channels = result.channels as Record<string, unknown>[];
        expect(channels[0].lastUpdated).toBe("2025-03-15T12:00:00.000Z");
    });

    it("handles lastUpdated as Firestore Timestamp (has .toDate() method)", async () => {
        const fakeDate = new Date("2025-04-20T08:30:00.000Z");
        const firestoreTimestamp = { toDate: () => fakeDate };

        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC_ts", {
                    title: "Timestamp Date",
                    avatarUrl: "b.jpg",
                    videoCount: 2,
                    lastUpdated: firestoreTimestamp,
                }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);
        const channels = result.channels as Record<string, unknown>[];
        expect(channels[0].lastUpdated).toBe("2025-04-20T08:30:00.000Z");
    });

    it("handles lastUpdated as Date object", async () => {
        const dateObj = new Date("2025-05-10T16:00:00.000Z");

        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC_date", {
                    title: "Date Object",
                    avatarUrl: "c.jpg",
                    videoCount: 3,
                    lastUpdated: dateObj,
                }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);
        const channels = result.channels as Record<string, unknown>[];
        expect(channels[0].lastUpdated).toBe("2025-05-10T16:00:00.000Z");
    });

    it("handles lastUpdated as null/undefined", async () => {
        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC_null", {
                    title: "No Date",
                    avatarUrl: "d.jpg",
                    videoCount: 0,
                    lastUpdated: null,
                }),
                makeDoc("UC_undef", {
                    title: "Undef Date",
                    avatarUrl: "e.jpg",
                    videoCount: 0,
                }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);
        const channels = result.channels as Record<string, unknown>[];
        expect(channels[0].lastUpdated).toBeNull();
        expect(channels[1].lastUpdated).toBeNull();
    });

    // --- totalVideos ---

    it("correctly sums totalVideos across channels", async () => {
        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC_a", { title: "A", avatarUrl: "a.jpg", videoCount: 15, lastUpdated: null }),
                makeDoc("UC_b", { title: "B", avatarUrl: "b.jpg", videoCount: 30, lastUpdated: null }),
                makeDoc("UC_c", { title: "C", avatarUrl: "c.jpg", videoCount: 5, lastUpdated: null }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);

        expect(result.totalChannels).toBe(3);
        expect(result.totalVideos).toBe(50);
    });

    // --- dataFreshness ---

    it("builds dataFreshness array with channelId, channelTitle, lastSynced", async () => {
        mockCollectionGet.mockResolvedValueOnce({
            empty: false,
            docs: [
                makeDoc("UC_x", { title: "Channel X", avatarUrl: "x.jpg", videoCount: 10, lastUpdated: "2025-01-01T00:00:00.000Z" }),
                makeDoc("UC_y", { title: "Channel Y", avatarUrl: "y.jpg", videoCount: 20, lastUpdated: null }),
            ],
        });

        const result = await handleListTrendChannels({}, CTX);

        const freshness = result.dataFreshness as Record<string, unknown>[];
        expect(freshness).toHaveLength(2);

        expect(freshness[0]).toEqual({
            channelId: "UC_x",
            channelTitle: "Channel X",
            lastSynced: "2025-01-01T00:00:00.000Z",
        });
        expect(freshness[1]).toEqual({
            channelId: "UC_y",
            channelTitle: "Channel Y",
            lastSynced: null,
        });
    });
});

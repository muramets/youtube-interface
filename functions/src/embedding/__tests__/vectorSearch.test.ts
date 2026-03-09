// =============================================================================
// vectorSearch tests — batched vector search over globalVideoEmbeddings
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { findNearestVideos } from "../vectorSearch.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockFindNearest = vi.fn(() => ({ get: mockGet }));
const mockWhere = vi.fn(() => ({ findNearest: mockFindNearest }));
const mockCollection = vi.fn(() => ({ where: mockWhere }));

vi.mock("../../shared/db.js", () => ({
    db: {
        collection: (...args: unknown[]) => mockCollection(...args),
    },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(videoId: string, distance: number, channelId: string): {
    id: string;
    data: () => Record<string, unknown>;
} {
    return {
        id: videoId,
        data: () => ({
            __distance: distance,
            videoId,
            youtubeChannelId: channelId,
            channelTitle: `Channel ${channelId}`,
            title: `Video ${videoId}`,
            tags: [],
            viewCount: 1000,
            publishedAt: "2026-01-01",
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            failCount: 0,
            updatedAt: Date.now(),
        }),
    };
}

const dummyVector = Array(768).fill(0.1);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findNearestVideos", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns sorted results for normal search (5 channels, 20 results)", async () => {
        const docs = [
            makeDoc("v1", 0.1, "ch1"),
            makeDoc("v2", 0.3, "ch2"),
            makeDoc("v3", 0.05, "ch3"),
            makeDoc("v4", 0.5, "ch4"),
            makeDoc("v5", 0.2, "ch5"),
        ];

        mockGet.mockResolvedValueOnce({ docs });

        const results = await findNearestVideos({
            queryVector: dummyVector,
            field: "packagingEmbedding",
            youtubeChannelIds: ["ch1", "ch2", "ch3", "ch4", "ch5"],
            limit: 20,
        });

        // Should be sorted by distance ascending
        expect(results).toHaveLength(5);
        expect(results[0].videoId).toBe("v3"); // distance 0.05
        expect(results[1].videoId).toBe("v1"); // distance 0.1
        expect(results[2].videoId).toBe("v5"); // distance 0.2
        expect(results[3].videoId).toBe("v2"); // distance 0.3
        expect(results[4].videoId).toBe("v4"); // distance 0.5

        // Should call findNearest with correct params
        expect(mockFindNearest).toHaveBeenCalledWith({
            vectorField: "packagingEmbedding",
            queryVector: dummyVector,
            limit: 60, // 20 * 3
            distanceMeasure: "COSINE",
            distanceResultField: "__distance",
        });

        // __distance should be removed from data
        expect(results[0].data).not.toHaveProperty("__distance");
    });

    it("batches >30 channels into 2 queries and merges correctly", async () => {
        // 35 channels → 2 batches (30 + 5)
        const channelIds = Array.from({ length: 35 }, (_, i) => `ch${i}`);

        // Batch 1: distance 0.3, 0.5
        mockGet.mockResolvedValueOnce({
            docs: [
                makeDoc("v-batch1-a", 0.3, "ch0"),
                makeDoc("v-batch1-b", 0.5, "ch10"),
            ],
        });

        // Batch 2: distance 0.1, 0.4
        mockGet.mockResolvedValueOnce({
            docs: [
                makeDoc("v-batch2-a", 0.1, "ch30"),
                makeDoc("v-batch2-b", 0.4, "ch33"),
            ],
        });

        const results = await findNearestVideos({
            queryVector: dummyVector,
            field: "packagingEmbedding",
            youtubeChannelIds: channelIds,
            limit: 10,
        });

        // 2 batches should have been queried
        expect(mockWhere).toHaveBeenCalledTimes(2);
        expect(mockWhere).toHaveBeenCalledWith("youtubeChannelId", "in", channelIds.slice(0, 30));
        expect(mockWhere).toHaveBeenCalledWith("youtubeChannelId", "in", channelIds.slice(30));

        // Results merged and sorted by distance
        expect(results).toHaveLength(4);
        expect(results[0].videoId).toBe("v-batch2-a"); // 0.1
        expect(results[1].videoId).toBe("v-batch1-a"); // 0.3
        expect(results[2].videoId).toBe("v-batch2-b"); // 0.4
        expect(results[3].videoId).toBe("v-batch1-b"); // 0.5
    });

    it("returns empty array for empty results", async () => {
        mockGet.mockResolvedValueOnce({ docs: [] });

        const results = await findNearestVideos({
            queryVector: dummyVector,
            field: "packagingEmbedding",
            youtubeChannelIds: ["ch1"],
            limit: 20,
        });

        expect(results).toEqual([]);
    });

    it("returns empty array for empty channel list", async () => {
        const results = await findNearestVideos({
            queryVector: dummyVector,
            field: "packagingEmbedding",
            youtubeChannelIds: [],
            limit: 20,
        });

        expect(results).toEqual([]);
        expect(mockCollection).not.toHaveBeenCalled();
    });

    it("handles 1 channel (single query, no batching)", async () => {
        mockGet.mockResolvedValueOnce({
            docs: [makeDoc("v1", 0.2, "ch1")],
        });

        const results = await findNearestVideos({
            queryVector: dummyVector,
            field: "packagingEmbedding",
            youtubeChannelIds: ["ch1"],
            limit: 5,
        });

        expect(results).toHaveLength(1);
        expect(mockWhere).toHaveBeenCalledTimes(1);
        expect(mockWhere).toHaveBeenCalledWith("youtubeChannelId", "in", ["ch1"]);
    });

    it("respects limit by truncating merged results", async () => {
        const docs = Array.from({ length: 10 }, (_, i) =>
            makeDoc(`v${i}`, i * 0.1, "ch1"),
        );

        mockGet.mockResolvedValueOnce({ docs });

        const results = await findNearestVideos({
            queryVector: dummyVector,
            field: "packagingEmbedding",
            youtubeChannelIds: ["ch1"],
            limit: 3,
        });

        expect(results).toHaveLength(3);
        expect(results[0].distance).toBe(0);
        expect(results[1].distance).toBeCloseTo(0.1);
        expect(results[2].distance).toBeCloseTo(0.2);
    });
});

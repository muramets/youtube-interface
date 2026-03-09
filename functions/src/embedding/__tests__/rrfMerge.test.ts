// =============================================================================
// rrfMerge unit tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { rrfMerge } from "../rrfMerge.js";
import type { VectorSearchResult } from "../vectorSearch.js";
import type { EmbeddingDoc } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(videoId: string, distance: number): VectorSearchResult {
    return {
        videoId,
        distance,
        data: {
            videoId,
            youtubeChannelId: "ch1",
            channelTitle: "Channel 1",
            title: `Video ${videoId}`,
            tags: [],
            viewCount: 1000,
            publishedAt: "2026-01-01",
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            failCount: 0,
            updatedAt: Date.now(),
        } as EmbeddingDoc,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rrfMerge", () => {
    it("merges two lists with overlap — overlapping items get higher score", () => {
        const listA = [makeResult("v1", 0.1), makeResult("v2", 0.2), makeResult("v3", 0.3)];
        const listB = [makeResult("v2", 0.15), makeResult("v4", 0.25), makeResult("v1", 0.35)];

        const merged = rrfMerge([listA, listB], 60, 20);

        // v1 in both lists: 1/(60+1) + 1/(60+3) = 0.01639 + 0.01587 = 0.03227
        // v2 in both lists: 1/(60+2) + 1/(60+1) = 0.01613 + 0.01639 = 0.03252
        // v2 should rank higher than v1 (better rank in list B)
        expect(merged[0].videoId).toBe("v2");
        expect(merged[1].videoId).toBe("v1");

        // v3 and v4 only in one list
        expect(merged).toHaveLength(4);
        expect(merged[0].rrfScore).toBeGreaterThan(merged[1].rrfScore);
        expect(merged[2].rrfScore).toBeLessThan(merged[1].rrfScore);
    });

    it("merges two lists with no overlap — union of all items", () => {
        const listA = [makeResult("v1", 0.1), makeResult("v2", 0.2)];
        const listB = [makeResult("v3", 0.15), makeResult("v4", 0.25)];

        const merged = rrfMerge([listA, listB], 60, 20);

        expect(merged).toHaveLength(4);

        // All items have equal rank within their respective lists
        // v1 (rank 1 in A) and v3 (rank 1 in B) get same score: 1/(60+1)
        expect(merged[0].rrfScore).toBe(merged[1].rrfScore);
        expect(merged[2].rrfScore).toBe(merged[3].rrfScore);
    });

    it("returns empty result for empty lists", () => {
        expect(rrfMerge([], 60, 20)).toEqual([]);
        expect(rrfMerge([[]], 60, 20)).toEqual([]);
        expect(rrfMerge([[], []], 60, 20)).toEqual([]);
    });

    it("respects finalLimit", () => {
        const list = Array.from({ length: 50 }, (_, i) => makeResult(`v${i}`, i * 0.01));

        const merged = rrfMerge([list], 60, 5);
        expect(merged).toHaveLength(5);

        // First item should have highest score
        expect(merged[0].videoId).toBe("v0");
    });

    it("k parameter affects score magnitude", () => {
        const list = [makeResult("v1", 0.1), makeResult("v2", 0.2)];

        // With k=1: scores are larger (1/(1+1) = 0.5)
        const mergedSmallK = rrfMerge([list], 1, 20);
        // With k=1000: scores are smaller (1/(1000+1) ≈ 0.001)
        const mergedLargeK = rrfMerge([list], 1000, 20);

        expect(mergedSmallK[0].rrfScore).toBeGreaterThan(mergedLargeK[0].rrfScore);

        // Relative ranking preserved regardless of k
        expect(mergedSmallK[0].videoId).toBe(mergedLargeK[0].videoId);
        expect(mergedSmallK[1].videoId).toBe(mergedLargeK[1].videoId);
    });

    it("single list = ranking by position", () => {
        const list = [makeResult("v1", 0.1), makeResult("v2", 0.2), makeResult("v3", 0.3)];

        const merged = rrfMerge([list], 60, 20);

        expect(merged).toHaveLength(3);
        expect(merged[0].videoId).toBe("v1");
        expect(merged[1].videoId).toBe("v2");
        expect(merged[2].videoId).toBe("v3");

        // Scores should be 1/(60+1), 1/(60+2), 1/(60+3)
        const expected1 = Math.round(1 / 61 * 100000) / 100000;
        const expected2 = Math.round(1 / 62 * 100000) / 100000;
        expect(merged[0].rrfScore).toBe(expected1);
        expect(merged[1].rrfScore).toBe(expected2);
    });

    it("preserves data from first list when same video appears in multiple", () => {
        const resultA = makeResult("v1", 0.1);
        resultA.data.title = "Title from list A";

        const resultB = makeResult("v1", 0.5);
        resultB.data.title = "Title from list B";

        const merged = rrfMerge([[resultA], [resultB]], 60, 20);

        expect(merged[0].data.title).toBe("Title from list A");
    });

    it("rrfScore is score not rank — higher is better", () => {
        const listA = [makeResult("v1", 0.1)];
        const listB = [makeResult("v1", 0.1)];

        const merged = rrfMerge([listA, listB], 60, 20);

        // v1 in both lists at rank 1: 2 * 1/(60+1) ≈ 0.03279
        expect(merged[0].rrfScore).toBeGreaterThan(0);
        expect(merged[0].rrfScore).toBeCloseTo(2 / 61, 4);
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetMultipleVideoDetails } from "../getMultipleVideoDetails.js";
import type { ToolContext } from "../../types.js";

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockGetVideoDetails = vi.fn();
const mockGetViewDeltas = vi.fn();

// --- Mock Firestore ---

vi.mock("../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        batch: () => ({
            set: mockBatchSet,
            commit: mockBatchCommit,
        }),
        collection: () => ({
            where: () => ({ get: () => Promise.resolve({ docs: [] }) }),
        }),
    },
}));

// --- Mock YouTubeService ---

vi.mock("../../../youtube.js", () => ({
    YouTubeService: class {
        getVideoDetails = mockGetVideoDetails;
    },
}));

// --- Mock trendSnapshotService ---

vi.mock("../../../trendSnapshotService.js", () => ({
    getViewDeltas: (...args: unknown[]) => mockGetViewDeltas(...args),
}));

const CTX: ToolContext = { userId: "user1", channelId: "ch1" };

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// =============================================================================
// View deltas enrichment in getMultipleVideoDetails
// =============================================================================

describe("getMultipleVideoDetails — view deltas", () => {
    it("includes deltas when trend data is available", async () => {
        // Video found in own collection
        mockGetAll.mockResolvedValue([
            makeSnap(true, {
                title: "My Video",
                viewCount: 1000,
                channelId: "UCabc",
                channelTitle: "TestCh",
            }),
            makeSnap(false), // external cache miss (parallel read)
        ]);

        mockGetViewDeltas.mockResolvedValue(
            new Map([
                ["vid1", {
                    delta24h: 150,
                    delta7d: 800,
                    delta30d: 3000,
                    currentViews: 1000,
                }],
            ]),
        );

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["vid1"] },
            CTX,
        );

        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(1);
        expect(videos[0].viewDelta24h).toBe(150);
        expect(videos[0].viewDelta7d).toBe(800);
        expect(videos[0].viewDelta30d).toBe(3000);
    });

    it("returns null deltas when no trend data exists", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap(true, {
                title: "External Video",
                viewCount: 500,
                channelTitle: "OtherCh",
            }),
            makeSnap(false),
        ]);

        // No deltas found
        mockGetViewDeltas.mockResolvedValue(new Map());

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["vid2"] },
            CTX,
        );

        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(1);
        // No viewDelta fields when no data
        expect(videos[0].viewDelta24h).toBeUndefined();
        expect(videos[0].viewDelta7d).toBeUndefined();
        expect(videos[0].viewDelta30d).toBeUndefined();
    });

    it("handles delta enrichment failure gracefully", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap(true, {
                title: "Video",
                viewCount: 100,
                channelTitle: "Ch",
            }),
            makeSnap(false),
        ]);

        mockGetViewDeltas.mockRejectedValue(new Error("Service unavailable"));

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["vid3"] },
            CTX,
        );

        // Should still return video data, just without deltas
        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(1);
        expect(videos[0].title).toBe("Video");
        expect(videos[0].viewDelta24h).toBeUndefined();
    });

    it("passes channelId hints from video data", async () => {
        // getAll is called twice: once for own videos, once for external cache
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "V1", channelId: "UCabc", channelTitle: "Ch1" }),
                makeSnap(false),
            ])
            .mockResolvedValueOnce([
                makeSnap(false),
                makeSnap(true, { title: "V2", channelId: "UCdef", channelTitle: "Ch2" }),
            ]);

        mockGetViewDeltas.mockResolvedValue(new Map());

        await handleGetMultipleVideoDetails(
            { videoIds: ["v1", "v2"] },
            CTX,
        );

        // Verify channelIdHints passed to getViewDeltas
        expect(mockGetViewDeltas).toHaveBeenCalledWith(
            "user1",
            "ch1",
            ["v1", "v2"],
            new Set(["UCabc", "UCdef"]),
        );
    });

    it("enriches mix of own + external videos with deltas", async () => {
        // getAll called twice: own videos, then external cache
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, {
                    title: "Own Video",
                    viewCount: 2000,
                    channelId: "UCown",
                    channelTitle: "MyCh",
                    ownership: "own-published",
                }),
                makeSnap(false),
            ])
            .mockResolvedValueOnce([
                makeSnap(false),
                makeSnap(true, {
                    title: "Competitor",
                    viewCount: 5000,
                    channelId: "UCcomp",
                    channelTitle: "CompCh",
                }),
            ]);

        mockGetViewDeltas.mockResolvedValue(
            new Map([
                ["v1", { delta24h: 50, delta7d: 200, delta30d: 900, currentViews: 2000 }],
                ["v2", { delta24h: 1000, delta7d: 5000, delta30d: null, currentViews: 5000 }],
            ]),
        );

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["v1", "v2"] },
            CTX,
        );

        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(2);
        expect(videos[0].viewDelta24h).toBe(50);
        expect(videos[1].viewDelta24h).toBe(1000);
        expect(videos[1].viewDelta30d).toBeNull();
    });
});

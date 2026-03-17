import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetMultipleVideoDetails } from "../getMultipleVideoDetails.js";
import type { ToolContext } from "../../../types.js";

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockGetViewDeltas = vi.fn();
const mockFetchThumbnailDescriptions = vi.fn();

// --- Mock Firestore ---

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        batch: () => ({
            set: vi.fn(),
            commit: vi.fn(),
        }),
        collection: () => ({
            where: () => ({ get: () => Promise.resolve({ docs: [] }) }),
        }),
    },
}));

vi.mock("../../../../youtube.js", () => ({
    YouTubeService: class {
        getVideoDetails = vi.fn();
    },
}));

vi.mock("../../../../trendSnapshotService.js", () => ({
    getViewDeltas: (...args: unknown[]) => mockGetViewDeltas(...args),
}));

vi.mock("../../../utils/fetchThumbnailDescriptions.js", () => ({
    fetchThumbnailDescriptions: (...args: unknown[]) => mockFetchThumbnailDescriptions(...args),
}));

const CTX: ToolContext = { userId: "user1", channelId: "ch1", channelName: "MyCh" };

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetViewDeltas.mockResolvedValue(new Map());
    mockFetchThumbnailDescriptions.mockResolvedValue(new Map());
});

// =============================================================================
// Thumbnail description enrichment in getMultipleVideoDetails
// =============================================================================

describe("getMultipleVideoDetails — thumbnail descriptions", () => {
    it("includes thumbnailDescription for regular (non-custom) video", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap(true, {
                title: "Competitor Video",
                viewCount: 5000,
                channelId: "UCcomp",
                channelTitle: "CompCh",
            }),
            makeSnap(false),
        ]);

        mockFetchThumbnailDescriptions.mockResolvedValue(
            new Map([["vid1", "A serene autumn landscape with warm golden tones"]]),
        );

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["vid1"] },
            CTX,
        );

        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(1);
        expect(videos[0].thumbnailDescription).toBe(
            "A serene autumn landscape with warm golden tones",
        );
    });

    it("includes thumbnailDescription for custom published video via youtubeVideoId", async () => {
        // Custom video found in own collection
        mockGetAll.mockResolvedValue([
            makeSnap(false), // not found by direct ID
            makeSnap(false), // not in external cache
        ]);

        // Reverse lookup finds the custom video
        const mockWhere = vi.fn().mockReturnValue({
            get: () => Promise.resolve({
                docs: [{
                    id: "custom-123",
                    data: () => ({
                        title: "My Published Video",
                        viewCount: 1000,
                        channelTitle: "MyCh",
                        isCustom: true,
                        publishedVideoId: "ytId456",
                    }),
                }],
            }),
        });

        // Override collection mock for this test
        const { db } = await import("../../../../../shared/db.js");
        vi.spyOn(db, "collection").mockReturnValue({ where: mockWhere } as never);

        mockFetchThumbnailDescriptions.mockResolvedValue(
            new Map([["ytId456", "Oil painting of countryside scene"]]),
        );

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["ytId456"] },
            CTX,
        );

        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(1);
        expect(videos[0].thumbnailDescription).toBe("Oil painting of countryside scene");
    });

    it("omits thumbnailDescription when not available in embeddings", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap(true, {
                title: "Video Without Embeddings",
                viewCount: 200,
                channelTitle: "Ch",
            }),
            makeSnap(false),
        ]);

        // No descriptions available
        mockFetchThumbnailDescriptions.mockResolvedValue(new Map());

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["vid1"] },
            CTX,
        );

        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(1);
        expect(videos[0].thumbnailDescription).toBeUndefined();
    });

    it("handles thumbnail description enrichment failure gracefully", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap(true, {
                title: "Video",
                viewCount: 100,
                channelTitle: "Ch",
            }),
            makeSnap(false),
        ]);

        mockFetchThumbnailDescriptions.mockRejectedValue(
            new Error("Service unavailable"),
        );

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ["vid1"] },
            CTX,
        );

        // Should still return video data, just without description
        const videos = result.videos as Record<string, unknown>[];
        expect(videos).toHaveLength(1);
        expect(videos[0].title).toBe("Video");
        expect(videos[0].thumbnailDescription).toBeUndefined();
    });

    it("passes only YouTube IDs (not custom- IDs) to fetchThumbnailDescriptions", async () => {
        // Simulate a custom draft video (no publishedVideoId)
        mockGetAll.mockResolvedValue([
            makeSnap(true, {
                title: "Draft Video",
                viewCount: 0,
                channelTitle: "MyCh",
                isCustom: true,
                // No publishedVideoId → youtubeVideoId will be undefined
            }),
            makeSnap(false),
        ]);

        mockFetchThumbnailDescriptions.mockResolvedValue(new Map());

        await handleGetMultipleVideoDetails(
            { videoIds: ["custom-999"] },
            CTX,
        );

        // Should NOT pass custom- ID to fetchThumbnailDescriptions
        // (either called with empty array or not called)
        if (mockFetchThumbnailDescriptions.mock.calls.length > 0) {
            const passedIds = mockFetchThumbnailDescriptions.mock.calls[0][0] as string[];
            expect(passedIds.every((id: string) => !id.startsWith("custom-"))).toBe(true);
        }
    });
});

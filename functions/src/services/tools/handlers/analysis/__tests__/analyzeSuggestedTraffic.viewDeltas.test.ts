import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAnalyzeSuggestedTraffic } from "../analyzeSuggestedTraffic.js";
import type { ToolContext } from "../../../types.js";

// --- Mock fns ---

const mockDocGet = vi.fn();
const mockGetAll = vi.fn();
const mockGetViewDeltas = vi.fn();
const mockFileDownload = vi.fn();
const mockBuildVideoTimeline = vi.fn();
const mockGetTransitions = vi.fn();

// --- Mock Firestore ---

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: () => ({ get: mockDocGet, path: "mock" }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        collection: () => ({
            where: () => ({ get: () => Promise.resolve({ docs: [] }) }),
        }),
    },
    admin: {
        storage: () => ({
            bucket: () => ({
                file: () => ({ download: mockFileDownload }),
            }),
        }),
    },
}));

// --- Mock trendSnapshotService ---

vi.mock("../../../../trendSnapshotService.js", () => ({
    getViewDeltas: (...args: unknown[]) => mockGetViewDeltas(...args),
}));

// --- Mock CSV parser ---

vi.mock("../../../utils/csvParser.js", () => ({
    parseSuggestedTrafficCsv: () => ({
        rows: [
            { videoId: "extVid000001", sourceTitle: "Ext Video 1", views: 1000, impressions: 5000, ctr: 0.05, avgViewDuration: "0:03:00", watchTimeHours: 50 },
            { videoId: "extVid000002", sourceTitle: "Ext Video 2", views: 500, impressions: 2000, ctr: 0.03, avgViewDuration: "0:02:00", watchTimeHours: 20 },
        ],
    }),
}));

// --- Mock delta utils ---

vi.mock("../../../utils/delta.js", () => ({
    buildVideoTimeline: (...args: unknown[]) => mockBuildVideoTimeline(...args),
    getTransitions: (...args: unknown[]) => mockGetTransitions(...args),
}));

// --- Mock suggestedAnalysis (skip content analysis) ---

vi.mock("../../../utils/suggestedAnalysis.js", () => ({
    analyzeContent: vi.fn(),
    computeSelfChannelStats: vi.fn(),
    computeContentTrajectory: vi.fn(),
}));

// --- Helpers ---

const CTX: ToolContext = { userId: "user1", channelId: "ch1" };
const NOW = Date.now();

function setupBaseMocks() {
    // Resolver: video found by docId (getAll, 1st call)
    mockGetAll.mockResolvedValueOnce([{
        exists: true,
        data: () => ({ title: "Source Video", channelTitle: "MyCh", tags: [] }),
    }]);

    // Handler: traffic/main (single .get() call)
    mockDocGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
            snapshots: [{ id: "s1", timestamp: NOW, storagePath: "path/csv1.csv" }],
        }),
    });

    // CSV download
    mockFileDownload.mockResolvedValue([Buffer.from("fake csv")]);

    // buildVideoTimeline → 2 entries
    mockBuildVideoTimeline.mockReturnValue(
        new Map([
            ["extVid000001", {
                videoId: "extVid000001", sourceTitle: "Ext Video 1",
                views: 1000, impressions: 5000, ctr: 0.05,
                avgViewDuration: "0:03:00", watchTimeHours: 50, timeline: [],
            }],
            ["extVid000002", {
                videoId: "extVid000002", sourceTitle: "Ext Video 2",
                views: 500, impressions: 2000, ctr: 0.03,
                avgViewDuration: "0:02:00", watchTimeHours: 20, timeline: [],
            }],
        ]),
    );

    mockGetTransitions.mockReturnValue([]);
}

// =============================================================================
// Tests
// =============================================================================

describe("analyzeSuggestedTraffic — view deltas enrichment", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("populates viewDelta fields when trend data is available", async () => {
        setupBaseMocks();

        // cached_external_videos → channelId hints (2nd getAll call, after resolver)
        mockGetAll.mockResolvedValueOnce([
            { exists: true, data: () => ({ channelId: "UCext1" }) },
            { exists: true, data: () => ({ channelId: "UCext2" }) },
        ]);

        mockGetViewDeltas.mockResolvedValue(
            new Map([
                ["extVid000001", { delta24h: 500, delta7d: 3000, delta30d: 12000, currentViews: 50000 }],
                ["extVid000002", { delta24h: 100, delta7d: 800, delta30d: null, currentViews: 20000 }],
            ]),
        );

        const result = await handleAnalyzeSuggestedTraffic(
            { videoId: "myVid0000001", includeContentAnalysis: false },
            CTX,
        );

        const topSources = result.topSources as Array<Record<string, unknown>>;
        expect(topSources).toHaveLength(2);

        // First video (sorted by impressions desc → extVid000001 first)
        expect(topSources[0].viewDelta24h).toBe(500);
        expect(topSources[0].viewDelta7d).toBe(3000);
        expect(topSources[0].viewDelta30d).toBe(12000);

        // Second video
        expect(topSources[1].viewDelta24h).toBe(100);
        expect(topSources[1].viewDelta30d).toBeNull();
    });

    it("returns null viewDeltas when no trend data exists", async () => {
        setupBaseMocks();

        // cached_external_videos → no channelId (2nd getAll call)
        mockGetAll.mockResolvedValueOnce([
            { exists: false, data: () => ({}) },
            { exists: false, data: () => ({}) },
        ]);

        mockGetViewDeltas.mockResolvedValue(new Map());

        const result = await handleAnalyzeSuggestedTraffic(
            { videoId: "myVid0000001", includeContentAnalysis: false },
            CTX,
        );

        const topSources = result.topSources as Array<Record<string, unknown>>;
        expect(topSources).toHaveLength(2);
        expect(topSources[0].viewDelta24h).toBeNull();
        expect(topSources[0].viewDelta7d).toBeNull();
        expect(topSources[0].viewDelta30d).toBeNull();
    });

    it("handles view delta enrichment failure gracefully", async () => {
        setupBaseMocks();

        // cached_external_videos → channelId hints (2nd getAll call)
        mockGetAll.mockResolvedValueOnce([
            { exists: true, data: () => ({ channelId: "UCext1" }) },
        ]);

        mockGetViewDeltas.mockRejectedValue(new Error("Firestore quota exceeded"));

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const result = await handleAnalyzeSuggestedTraffic(
            { videoId: "myVid0000001", includeContentAnalysis: false },
            CTX,
        );

        // Handler still returns data — deltas default to null
        const topSources = result.topSources as Array<Record<string, unknown>>;
        expect(topSources).toHaveLength(2);
        expect(topSources[0].viewDelta24h).toBeNull();

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

// --- Mocks ---

const mockCollectionGet = vi.fn();
const mockDocGet = vi.fn();

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        collection: (path: string) => ({
            get: () => mockCollectionGet(path),
            doc: (id: string) => ({
                id,
                get: () => mockDocGet(path, id),
            }),
        }),
        getAll: (...refs: { get: () => Promise<unknown> }[]) =>
            Promise.all(refs.map(r => r.get())),
    },
}));

const mockAssignPercentileGroups = vi.fn();
vi.mock("../../../../../shared/percentiles.js", () => ({
    assignPercentileGroups: (...args: unknown[]) => mockAssignPercentileGroups(...args),
}));

const mockGetViewDeltas = vi.fn();
vi.mock("../../../../trendSnapshotService.js", () => ({
    getViewDeltas: (...args: unknown[]) => mockGetViewDeltas(...args),
}));

const mockGetHiddenVideoIds = vi.fn();
vi.mock("../../../utils/getHiddenVideoIds.js", () => ({
    getHiddenVideoIds: (...args: unknown[]) => mockGetHiddenVideoIds(...args),
}));

import { handleBrowseTrendVideos } from "../browseTrendVideos.js";

// --- Helpers ---

const CTX: ToolContext = { userId: "user1", channelId: "ch1" };

function makeVideoDoc(id: string, data?: Partial<Record<string, unknown>>) {
    return {
        id,
        data: () => ({
            title: `Video ${id}`,
            publishedAt: "2025-01-15",
            viewCount: 1000,
            tags: [],
            thumbnail: null,
            ...data,
        }),
    };
}

function makeChannelDoc(id: string, data?: Partial<Record<string, unknown>>) {
    return {
        id,
        data: () => ({
            title: `Channel ${id}`,
            lastUpdated: "2025-01-20T00:00:00Z",
            ...data,
        }),
    };
}

// --- Setup ---

function setupDefaultMocks(options?: {
    channels?: ReturnType<typeof makeChannelDoc>[];
    videos?: Map<string, ReturnType<typeof makeVideoDoc>[]>;
}) {
    const channels = options?.channels ?? [makeChannelDoc("tc1")];
    const videosMap = options?.videos ?? new Map([["tc1", [makeVideoDoc("v1"), makeVideoDoc("v2")]]]);

    // Default: trendChannels collection returns channel docs
    mockCollectionGet.mockImplementation((path: string) => {
        if (path.endsWith("/trendChannels")) {
            return Promise.resolve({ docs: channels });
        }
        // Match videos sub-collection: .../trendChannels/{id}/videos
        const videosMatch = path.match(/trendChannels\/([^/]+)\/videos$/);
        if (videosMatch) {
            const channelId = videosMatch[1];
            const docs = videosMap.get(channelId) ?? [];
            return Promise.resolve({ empty: docs.length === 0, docs });
        }
        return Promise.resolve({ docs: [] });
    });

    // assignPercentileGroups: first video gets "Top 1%", rest get "Middle 60%"
    mockAssignPercentileGroups.mockImplementation(
        (videos: { id: string; viewCount: number }[]) => {
            const map = new Map<string, string>();
            videos.forEach((v, i) => {
                map.set(v.id, i === 0 ? "Top 1%" : "Middle 60%");
            });
            return map;
        },
    );

    mockGetViewDeltas.mockResolvedValue(new Map());
    mockGetHiddenVideoIds.mockResolvedValue(new Set());
}

describe("handleBrowseTrendVideos", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // 1. Returns error when no trend channels found
    it("returns error when no trend channels found", async () => {
        setupDefaultMocks({ channels: [] });

        const result = await handleBrowseTrendVideos({}, CTX);

        expect(result).toEqual({
            error: "No trend channels found. Add channels to track in Trends first.",
        });
    });

    // 2. Returns videos sorted by date (default sort)
    it("returns videos sorted by date (default sort)", async () => {
        const videos = [
            makeVideoDoc("v1", { publishedAt: "2025-01-10", viewCount: 500 }),
            makeVideoDoc("v2", { publishedAt: "2025-01-20", viewCount: 300 }),
            makeVideoDoc("v3", { publishedAt: "2025-01-15", viewCount: 800 }),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos({}, CTX);

        expect(result.error).toBeUndefined();
        const resultVideos = result.videos as { videoId: string }[];
        expect(resultVideos.map((v) => v.videoId)).toEqual(["v2", "v3", "v1"]);
    });

    // 3. Filters by channelIds
    it("filters by channelIds", async () => {
        const ch1 = makeChannelDoc("tc1");
        const ch2 = makeChannelDoc("tc2");
        const videosMap = new Map([
            ["tc1", [makeVideoDoc("v1")]],
            ["tc2", [makeVideoDoc("v2")]],
        ]);

        setupDefaultMocks({ channels: [ch1, ch2], videos: videosMap });

        // When filtering by channelIds, handler uses doc(id).get() instead of collection.get()
        mockDocGet.mockImplementation((_path: string, id: string) => {
            if (id === "tc1") return Promise.resolve({ exists: true, id: "tc1", data: () => ch1.data() });
            return Promise.resolve({ exists: false, id, data: () => undefined });
        });

        const result = await handleBrowseTrendVideos(
            { channelIds: ["tc1"] },
            CTX,
        );

        expect(result.error).toBeUndefined();
        const resultVideos = result.videos as { videoId: string; channelId: string }[];
        expect(resultVideos).toHaveLength(1);
        expect(resultVideos[0].channelId).toBe("tc1");
    });

    // 4. Filters by dateRange (from/to)
    it("filters by dateRange", async () => {
        const videos = [
            makeVideoDoc("v1", { publishedAt: "2025-01-05" }),
            makeVideoDoc("v2", { publishedAt: "2025-01-15" }),
            makeVideoDoc("v3", { publishedAt: "2025-01-25" }),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos(
            { dateRange: { from: "2025-01-10", to: "2025-01-20" } },
            CTX,
        );

        expect(result.error).toBeUndefined();
        const resultVideos = result.videos as { videoId: string }[];
        expect(resultVideos).toHaveLength(1);
        expect(resultVideos[0].videoId).toBe("v2");
    });

    // 5. Filters by performanceTier
    it("filters by performanceTier", async () => {
        const videos = [
            makeVideoDoc("v1", { viewCount: 10000 }),
            makeVideoDoc("v2", { viewCount: 500 }),
            makeVideoDoc("v3", { viewCount: 200 }),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos(
            { performanceTier: "Top 1%" },
            CTX,
        );

        expect(result.error).toBeUndefined();
        const resultVideos = result.videos as { videoId: string; performanceTier: string }[];
        // Only the first video gets "Top 1%" from our mock
        expect(resultVideos).toHaveLength(1);
        expect(resultVideos[0].videoId).toBe("v1");
        expect(resultVideos[0].performanceTier).toBe("Top 1%");
    });

    // 6. Returns error for invalid performanceTier
    it("returns error for invalid performanceTier", async () => {
        setupDefaultMocks();

        const result = await handleBrowseTrendVideos(
            { performanceTier: "InvalidTier" },
            CTX,
        );

        expect(result.error).toContain("Invalid performanceTier");
        expect(result.error).toContain("InvalidTier");
    });

    // 7. Returns error for invalid sort field
    it("returns error for invalid sort field", async () => {
        setupDefaultMocks();

        const result = await handleBrowseTrendVideos(
            { sort: "invalidSort" },
            CTX,
        );

        expect(result.error).toContain("Invalid sort");
        expect(result.error).toContain("invalidSort");
    });

    // 8. Limits results (default 50, respects custom limit)
    it("limits results to default 50", async () => {
        const videos = Array.from({ length: 60 }, (_, i) =>
            makeVideoDoc(`v${i}`, { publishedAt: `2025-01-${String(i + 1).padStart(2, "0")}` }),
        );
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos({}, CTX);

        const resultVideos = result.videos as unknown[];
        expect(resultVideos).toHaveLength(50);
    });

    it("respects custom limit", async () => {
        const videos = Array.from({ length: 10 }, (_, i) =>
            makeVideoDoc(`v${i}`, { publishedAt: `2025-01-${String(i + 1).padStart(2, "0")}` }),
        );
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos({ limit: 3 }, CTX);

        const resultVideos = result.videos as unknown[];
        expect(resultVideos).toHaveLength(3);
    });

    // 9. Filters out hidden videos
    it("filters out hidden videos", async () => {
        const videos = [
            makeVideoDoc("v1"),
            makeVideoDoc("v2"),
            makeVideoDoc("v3"),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });
        mockGetHiddenVideoIds.mockResolvedValue(new Set(["v2"]));

        const result = await handleBrowseTrendVideos({}, CTX);

        const resultVideos = result.videos as { videoId: string }[];
        expect(resultVideos.map((v) => v.videoId)).not.toContain("v2");
        expect(resultVideos).toHaveLength(2);
    });

    // 10. Includes totalMatched count (before limit)
    it("includes totalMatched count before limit", async () => {
        const videos = Array.from({ length: 10 }, (_, i) =>
            makeVideoDoc(`v${i}`, { publishedAt: `2025-01-${String(i + 1).padStart(2, "0")}` }),
        );
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos({ limit: 3 }, CTX);

        expect(result.totalMatched).toBe(10);
        expect((result.videos as unknown[]).length).toBe(3);
    });

    // 11. Includes dataFreshness in response
    it("includes dataFreshness in response", async () => {
        const channel = makeChannelDoc("tc1", {
            title: "Test Channel",
            lastUpdated: "2025-01-20T12:00:00Z",
        });
        setupDefaultMocks({ channels: [channel] });

        const result = await handleBrowseTrendVideos({}, CTX);

        const freshness = result.dataFreshness as { channelId: string; channelTitle: string; lastSynced: string }[];
        expect(freshness).toHaveLength(1);
        expect(freshness[0]).toEqual({
            channelId: "tc1",
            channelTitle: "Test Channel",
            lastSynced: "2025-01-20T12:00:00Z",
        });
    });

    // 12. Includes channels summary in response
    it("includes channels summary in response", async () => {
        const channels = [makeChannelDoc("tc1", { title: "Channel A" }), makeChannelDoc("tc2", { title: "Channel B" })];
        const videosMap = new Map([
            ["tc1", [makeVideoDoc("v1"), makeVideoDoc("v2")]],
            ["tc2", [makeVideoDoc("v3")]],
        ]);
        setupDefaultMocks({ channels, videos: videosMap });

        const result = await handleBrowseTrendVideos({}, CTX);

        const channelsSummary = result.channels as { channelId: string; title: string; matchedCount: number }[];
        expect(channelsSummary).toHaveLength(2);

        const ch1 = channelsSummary.find((c) => c.channelId === "tc1");
        expect(ch1).toEqual({ channelId: "tc1", title: "Channel A", matchedCount: 2 });

        const ch2 = channelsSummary.find((c) => c.channelId === "tc2");
        expect(ch2).toEqual({ channelId: "tc2", title: "Channel B", matchedCount: 1 });
    });

    // 13a. Sorts by views explicitly
    it("sorts by views when sort='views'", async () => {
        const videos = [
            makeVideoDoc("v1", { publishedAt: "2025-01-20", viewCount: 100 }),
            makeVideoDoc("v2", { publishedAt: "2025-01-10", viewCount: 900 }),
            makeVideoDoc("v3", { publishedAt: "2025-01-15", viewCount: 500 }),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos({ sort: "views" }, CTX);

        expect(result.error).toBeUndefined();
        const resultVideos = result.videos as { videoId: string; viewCount: number }[];
        expect(resultVideos.map((v) => v.videoId)).toEqual(["v2", "v3", "v1"]);
    });

    // 13b. Clamps limit to MAX_LIMIT (200)
    it("clamps limit to 200 when larger value provided", async () => {
        const videos = Array.from({ length: 210 }, (_, i) =>
            makeVideoDoc(`v${i}`, { publishedAt: `2025-01-${String((i % 28) + 1).padStart(2, "0")}` }),
        );
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos({ limit: 500 }, CTX);

        const resultVideos = result.videos as unknown[];
        expect(resultVideos).toHaveLength(200);
        expect(result.totalMatched).toBe(210);
    });

    // 13c. Delta sort happy path — mixed null and non-null deltas
    it("sorts by delta24h with mixed null/non-null values (nulls to end)", async () => {
        const videos = [
            makeVideoDoc("v1", { publishedAt: "2025-01-10", viewCount: 100 }),
            makeVideoDoc("v2", { publishedAt: "2025-01-15", viewCount: 500 }),
            makeVideoDoc("v3", { publishedAt: "2025-01-20", viewCount: 300 }),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        // v1 has delta, v2 has no delta (null), v3 has higher delta
        mockGetViewDeltas.mockResolvedValue(new Map([
            ["v1", { delta24h: 50, delta7d: null, delta30d: null }],
            // v2 missing → null
            ["v3", { delta24h: 200, delta7d: null, delta30d: null }],
        ]));

        const result = await handleBrowseTrendVideos({ sort: "delta24h" }, CTX);

        expect(result.error).toBeUndefined();
        expect(result._note).toBeUndefined(); // NOT all-null fallback

        const resultVideos = result.videos as { videoId: string; viewDelta24h: number | null }[];
        // v3 (200) → v1 (50) → v2 (null, goes to end)
        expect(resultVideos.map((v) => v.videoId)).toEqual(["v3", "v1", "v2"]);
        expect(resultVideos[0].viewDelta24h).toBe(200);
        expect(resultVideos[1].viewDelta24h).toBe(50);
        expect(resultVideos[2].viewDelta24h).toBeNull();
    });

    // 13d. Returns empty videos (not error) when channels exist but no videos match filters
    it("returns empty result when filters exclude all videos", async () => {
        const videos = [
            makeVideoDoc("v1", { publishedAt: "2025-01-10", viewCount: 100 }),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        const result = await handleBrowseTrendVideos(
            { dateRange: { from: "2026-01-01", to: "2026-12-31" } },
            CTX,
        );

        expect(result.error).toBeUndefined();
        expect(result.videos).toEqual([]);
        expect(result.totalMatched).toBe(0);
    });

    // 13e. Handles delta sort with all-null deltas (fallback to views + _note)
    it("handles delta sort with all-null deltas (fallback to views + _note)", async () => {
        const videos = [
            makeVideoDoc("v1", { viewCount: 100, publishedAt: "2025-01-10" }),
            makeVideoDoc("v2", { viewCount: 500, publishedAt: "2025-01-15" }),
            makeVideoDoc("v3", { viewCount: 300, publishedAt: "2025-01-20" }),
        ];
        setupDefaultMocks({ videos: new Map([["tc1", videos]]) });

        // getViewDeltas returns empty map → all deltas will be null
        mockGetViewDeltas.mockResolvedValue(new Map());

        const result = await handleBrowseTrendVideos({ sort: "delta24h" }, CTX);

        expect(result.error).toBeUndefined();
        expect(result._note).toBe("Delta data unavailable — sorted by views instead");

        // Should be sorted by viewCount desc as fallback
        const resultVideos = result.videos as { videoId: string; viewCount: number }[];
        expect(resultVideos.map((v) => v.videoId)).toEqual(["v2", "v3", "v1"]);
    });
});

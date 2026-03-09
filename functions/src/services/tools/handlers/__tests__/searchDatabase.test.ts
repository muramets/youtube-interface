// =============================================================================
// searchDatabase handler tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDocGet = vi.fn();
const mockCollectionGet = vi.fn();

vi.mock("../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
        }),
        collection: (path: string) => ({
            get: () => mockCollectionGet(path),
        }),
    },
}));

const mockGenerateQueryEmbedding = vi.fn();
vi.mock("../../../../embedding/queryEmbedding.js", () => ({
    generateQueryEmbedding: (...args: unknown[]) => mockGenerateQueryEmbedding(...args),
}));

const mockFindNearestVideos = vi.fn();
vi.mock("../../../../embedding/vectorSearch.js", () => ({
    findNearestVideos: (...args: unknown[]) => mockFindNearestVideos(...args),
}));

const mockGetViewDeltas = vi.fn();
vi.mock("../../../trendSnapshotService.js", () => ({
    getViewDeltas: (...args: unknown[]) => mockGetViewDeltas(...args),
}));

const mockGetHiddenVideoIds = vi.fn();
vi.mock("../../utils/getHiddenVideoIds.js", () => ({
    getHiddenVideoIds: (...args: unknown[]) => mockGetHiddenVideoIds(...args),
}));

const mockAssignPercentileGroups = vi.fn();
vi.mock("../../../../shared/percentiles.js", () => ({
    assignPercentileGroups: (...args: unknown[]) => mockAssignPercentileGroups(...args),
}));

import { handleSearchDatabase } from "../searchDatabase.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX: ToolContext = {
    userId: "user1",
    channelId: "channel1",
    reportProgress: vi.fn(),
};

const dummyQueryVector = Array(768).fill(0.5);

function makeEmbeddingData(videoId: string, channelId: string, opts: {
    title?: string;
    viewCount?: number;
    publishedAt?: string;
    channelTitle?: string;
} = {}) {
    return {
        videoId,
        youtubeChannelId: channelId,
        channelTitle: opts.channelTitle ?? `Channel ${channelId}`,
        title: opts.title ?? `Video ${videoId}`,
        tags: ["tag1", "tag2"],
        viewCount: opts.viewCount ?? 10000,
        publishedAt: opts.publishedAt ?? "2026-01-15",
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        packagingEmbedding: Array(768).fill(0.1),
        failCount: 0,
        updatedAt: Date.now(),
    };
}

function makeTrendChannelDoc(id: string, title: string) {
    return {
        id,
        data: () => ({ title, lastUpdated: "2026-03-01T00:00:00Z" }),
    };
}

function makeVideoDoc(id: string, viewCount: number) {
    return {
        id,
        data: () => ({ viewCount }),
    };
}

function setupMocks(opts: {
    trendChannels?: ReturnType<typeof makeTrendChannelDoc>[];
    trendChannelVideos?: Map<string, ReturnType<typeof makeVideoDoc>[]>;
    embeddingStats?: Record<string, unknown>;
}) {
    const trendChannels = opts.trendChannels ?? [makeTrendChannelDoc("ch1", "Channel 1")];
    const trendChannelVideos = opts.trendChannelVideos ?? new Map();

    mockDocGet.mockImplementation((path: string) => {
        if (path === "system/embeddingStats") {
            if (opts.embeddingStats) {
                return Promise.resolve({
                    exists: true,
                    data: () => opts.embeddingStats,
                });
            }
            return Promise.resolve({ exists: false });
        }
        return Promise.resolve({ exists: false });
    });

    mockCollectionGet.mockImplementation((path: string) => {
        if (path.endsWith("/trendChannels")) {
            return Promise.resolve({
                empty: trendChannels.length === 0,
                docs: trendChannels,
            });
        }

        if (path.includes("/trendChannels/") && path.endsWith("/videos")) {
            const channelId = path.split("trendChannels/")[1]?.split("/")[0];
            const videos = trendChannelVideos.get(channelId ?? "") ?? [];
            return Promise.resolve({
                empty: videos.length === 0,
                docs: videos,
            });
        }

        return Promise.resolve({ empty: true, docs: [] });
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleSearchDatabase", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GEMINI_API_KEY = "test-key";
        mockGetHiddenVideoIds.mockResolvedValue(new Set());
        mockGetViewDeltas.mockResolvedValue(new Map());
        mockFindNearestVideos.mockResolvedValue([]);
        mockGenerateQueryEmbedding.mockResolvedValue(dummyQueryVector);
        mockAssignPercentileGroups.mockReturnValue(new Map());
    });

    // --- Validation ---

    it("returns error when query is too short", async () => {
        const result = await handleSearchDatabase({ query: "ab" }, CTX);
        expect(result.error).toContain("at least 3 characters");
    });

    it("returns error when query is empty string", async () => {
        const result = await handleSearchDatabase({ query: "" }, CTX);
        expect(result.error).toContain("at least 3 characters");
    });

    it("returns error when query is missing", async () => {
        const result = await handleSearchDatabase({}, CTX);
        expect(result.error).toContain("at least 3 characters");
    });

    it("returns error when query is whitespace only", async () => {
        const result = await handleSearchDatabase({ query: "  " }, CTX);
        expect(result.error).toContain("at least 3 characters");
    });

    // --- No trend channels ---

    it("returns error when no trend channels exist", async () => {
        setupMocks({ trendChannels: [] });

        const result = await handleSearchDatabase({ query: "test query" }, CTX);
        expect(result.error).toContain("No trend channels tracked");
    });

    // --- API key ---

    it("returns error when Gemini API key is missing", async () => {
        delete process.env.GEMINI_API_KEY;
        setupMocks({});

        const result = await handleSearchDatabase({ query: "test query" }, CTX);
        expect(result.error).toContain("Gemini API key not configured");
    });

    // --- Embedding generation ---

    it("returns error when embedding generation fails", async () => {
        setupMocks({});
        mockGenerateQueryEmbedding.mockResolvedValue(null);

        const result = await handleSearchDatabase({ query: "test query" }, CTX);
        expect(result.error).toContain("Failed to generate query embedding");
    });

    it("uses generateQueryEmbedding (not generatePackagingEmbedding)", async () => {
        setupMocks({});

        await handleSearchDatabase({ query: "Iceland travel" }, CTX);

        expect(mockGenerateQueryEmbedding).toHaveBeenCalledWith("Iceland travel", "test-key");
    });

    // --- Happy path ---

    it("returns search results with enrichment", async () => {
        setupMocks({
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            trendChannelVideos: new Map([
                ["ch1", [makeVideoDoc("r1", 10000), makeVideoDoc("r2", 5000)]],
            ]),
            embeddingStats: {
                byChannel: { ch1: { packaging: 50, visual: 30, total: 80 } },
                updatedAt: Date.now(),
            },
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1") },
            { videoId: "r2", distance: 0.4, data: makeEmbeddingData("r2", "ch1") },
        ]);

        mockGetViewDeltas.mockResolvedValue(
            new Map([["r1", { delta24h: 500, delta7d: 3000, delta30d: 10000 }]]),
        );

        mockAssignPercentileGroups.mockReturnValue(
            new Map([["r1", "Top 5%"], ["r2", "Middle 60%"]]),
        );

        const result = await handleSearchDatabase({ query: "travel vlog" }, CTX);

        expect(result.query).toBe("travel vlog");
        expect(result.totalFound).toBe(2);
        expect(result.coverage).toEqual({ indexed: 50, total: 80 });

        const results = result.results as Array<Record<string, unknown>>;
        expect(results).toHaveLength(2);

        // First result
        expect(results[0].videoId).toBe("r1");
        expect(results[0].relevanceScore).toBe(0.8); // 1 - 0.2
        expect(results[0].performanceTier).toBe("Top 5%");
        expect(results[0].viewDelta24h).toBe(500);
        expect(results[0].viewDelta7d).toBe(3000);
        expect(results[0].viewDelta30d).toBe(10000);

        // Second result — no deltas
        expect(results[1].videoId).toBe("r2");
        expect(results[1].relevanceScore).toBe(0.6); // 1 - 0.4
        expect(results[1].performanceTier).toBe("Middle 60%");
        expect(results[1].viewDelta24h).toBeNull();
    });

    // --- relevanceScore ---

    it("calculates relevanceScore as 1 - distance, clamped to [0,1], 3 decimals", async () => {
        setupMocks({});

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.333, data: makeEmbeddingData("r1", "ch1") },
            { videoId: "r2", distance: 1.5, data: makeEmbeddingData("r2", "ch1") },  // distance > 1
        ]);

        const result = await handleSearchDatabase({ query: "test query" }, CTX);

        const results = result.results as Array<{ relevanceScore: number }>;
        expect(results[0].relevanceScore).toBe(0.667); // 1 - 0.333, rounded to 3 decimals
        expect(results[1].relevanceScore).toBe(0);     // clamped: max(0, 1-1.5) = 0
    });

    // --- Hidden videos ---

    it("filters out hidden videos and adjusts totalFound", async () => {
        setupMocks({
            trendChannelVideos: new Map([
                ["ch1", [makeVideoDoc("v1", 5000), makeVideoDoc("hidden", 8000)]],
            ]),
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "v1", distance: 0.2, data: makeEmbeddingData("v1", "ch1") },
            { videoId: "hidden", distance: 0.3, data: makeEmbeddingData("hidden", "ch1") },
        ]);

        mockGetHiddenVideoIds.mockResolvedValue(new Set(["hidden"]));
        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleSearchDatabase({ query: "test query" }, CTX);

        const results = result.results as Array<{ videoId: string }>;
        expect(results).toHaveLength(1);
        expect(results[0].videoId).toBe("v1");
        expect(result.totalFound).toBe(1);
    });

    // --- channelIds filter ---

    it("filters search to specified channelIds", async () => {
        setupMocks({
            trendChannels: [
                makeTrendChannelDoc("ch1", "Channel 1"),
                makeTrendChannelDoc("ch2", "Channel 2"),
            ],
        });

        await handleSearchDatabase(
            { query: "test query", channelIds: ["ch1"] },
            CTX,
        );

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                youtubeChannelIds: ["ch1"],
            }),
        );
    });

    it("ignores channelIds not in user's trend channels", async () => {
        setupMocks({
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        await handleSearchDatabase(
            { query: "test query", channelIds: ["ch1", "ch-unknown"] },
            CTX,
        );

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                youtubeChannelIds: ["ch1"],
            }),
        );
    });

    it("returns empty results when no channelIds match", async () => {
        setupMocks({
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        const result = await handleSearchDatabase(
            { query: "test query", channelIds: ["ch-nonexistent"] },
            CTX,
        );

        expect(result.results).toEqual([]);
        expect(result.totalFound).toBe(0);
        expect(mockFindNearestVideos).not.toHaveBeenCalled();
    });

    // --- Limit ---

    it("caps limit to MAX_LIMIT (50)", async () => {
        setupMocks({});

        await handleSearchDatabase({ query: "test query", limit: 100 }, CTX);

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 60, // 50 + 10 over-fetch
            }),
        );
    });

    it("uses default limit of 20 when not specified", async () => {
        setupMocks({});

        await handleSearchDatabase({ query: "test query" }, CTX);

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 30, // 20 + 10 over-fetch
            }),
        );
    });

    // --- View deltas ---

    it("passes channelIdHints to getViewDeltas", async () => {
        setupMocks({
            trendChannels: [
                makeTrendChannelDoc("ch1", "Channel 1"),
                makeTrendChannelDoc("ch2", "Channel 2"),
            ],
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1") },
        ]);

        await handleSearchDatabase({ query: "test query" }, CTX);

        expect(mockGetViewDeltas).toHaveBeenCalledWith(
            "user1",
            "channel1",
            ["r1"],
            new Set(["ch1", "ch2"]),
        );
    });

    // --- Coverage ---

    it("returns packaging-only coverage from embeddingStats", async () => {
        setupMocks({
            trendChannels: [
                makeTrendChannelDoc("ch1", "Channel 1"),
                makeTrendChannelDoc("ch2", "Channel 2"),
            ],
            embeddingStats: {
                byChannel: {
                    ch1: { packaging: 100, visual: 80, total: 120 },
                    ch2: { packaging: 80, visual: 60, total: 90 },
                },
                updatedAt: Date.now(),
            },
        });

        const result = await handleSearchDatabase({ query: "test query" }, CTX);

        // Only packaging counts, not visual
        expect(result.coverage).toEqual({ indexed: 180, total: 210 });
    });

    it("returns null coverage when embeddingStats doc missing", async () => {
        setupMocks({});

        const result = await handleSearchDatabase({ query: "test query" }, CTX);

        expect(result.coverage).toBeNull();
    });

    // --- dataFreshness ---

    it("includes dataFreshness only for channels in results", async () => {
        setupMocks({
            trendChannels: [
                makeTrendChannelDoc("ch1", "Channel 1"),
                makeTrendChannelDoc("ch2", "Channel 2"),
            ],
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1") },
        ]);

        const result = await handleSearchDatabase({ query: "test query" }, CTX);

        const freshness = result.dataFreshness as Array<{ channelId: string }>;
        expect(freshness).toHaveLength(1);
        expect(freshness[0].channelId).toBe("ch1");
    });

    // --- reportProgress ---

    it("calls reportProgress at each stage", async () => {
        setupMocks({});

        await handleSearchDatabase({ query: "test query" }, CTX);

        expect(CTX.reportProgress).toHaveBeenCalledWith("Generating query embedding...");
        expect(CTX.reportProgress).toHaveBeenCalledWith("Searching database...");
        expect(CTX.reportProgress).toHaveBeenCalledWith("Computing view deltas...");
    });

    // --- Over-fetch ---

    it("over-fetches by +10 to compensate for hidden video filtering", async () => {
        setupMocks({});

        await handleSearchDatabase({ query: "test query", limit: 15 }, CTX);

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                limit: 25, // 15 + 10
            }),
        );
    });

    // --- Vector search field ---

    it("searches by packagingEmbedding field", async () => {
        setupMocks({});

        await handleSearchDatabase({ query: "test query" }, CTX);

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                field: "packagingEmbedding",
            }),
        );
    });

    // --- Error handling ---

    it("wraps unexpected errors gracefully", async () => {
        setupMocks({});
        mockGenerateQueryEmbedding.mockRejectedValue(new Error("Unexpected boom"));

        const result = await handleSearchDatabase({ query: "test query" }, CTX);

        expect(result.error).toContain("Failed to search database");
        expect(result.error).toContain("Unexpected boom");
    });
});

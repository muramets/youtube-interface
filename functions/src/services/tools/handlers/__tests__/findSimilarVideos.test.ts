// =============================================================================
// findSimilarVideos handler tests
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
        getAll: (...refs: { get: () => Promise<unknown> }[]) =>
            Promise.all(refs.map(r => r.get())),
        collection: (path: string) => ({
            get: () => mockCollectionGet(path),
        }),
    },
}));

const mockFindNearestVideos = vi.fn();
vi.mock("../../../../embedding/vectorSearch.js", () => ({
    findNearestVideos: (...args: unknown[]) => mockFindNearestVideos(...args),
}));

const mockGeneratePackagingEmbedding = vi.fn();
vi.mock("../../../../embedding/packagingEmbedding.js", () => ({
    generatePackagingEmbedding: (...args: unknown[]) => mockGeneratePackagingEmbedding(...args),
}));

const mockGenerateVisualEmbedding = vi.fn();
vi.mock("../../../../embedding/visualEmbedding.js", () => ({
    generateVisualEmbedding: (...args: unknown[]) => mockGenerateVisualEmbedding(...args),
}));

const mockDownloadThumbnail = vi.fn();
vi.mock("../../../../embedding/thumbnailDownload.js", () => ({
    downloadThumbnail: (...args: unknown[]) => mockDownloadThumbnail(...args),
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

import { handleFindSimilarVideos } from "../findSimilarVideos.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX: ToolContext = {
    userId: "user1",
    channelId: "channel1",
    reportProgress: vi.fn(),
};

const BASE_PATH = "users/user1/channels/channel1";
const dummyPackagingVector = Array(768).fill(0.1);
const dummyVisualVector = Array(1408).fill(0.2);

function makeEmbeddingData(videoId: string, channelId: string, opts: {
    title?: string;
    tags?: string[];
    viewCount?: number;
    publishedAt?: string;
    packagingEmbedding?: number[] | null;
    visualEmbedding?: number[] | null;
    thumbnailDescription?: string | null;
} = {}) {
    return {
        videoId,
        youtubeChannelId: channelId,
        channelTitle: `Channel ${channelId}`,
        title: opts.title ?? `Video ${videoId}`,
        tags: opts.tags ?? ["tag1", "tag2"],
        viewCount: opts.viewCount ?? 10000,
        publishedAt: opts.publishedAt ?? "2026-01-15",
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        // Use "in" check so explicit null is preserved (??  treats null as nullish → returns default)
        packagingEmbedding: "packagingEmbedding" in opts ? opts.packagingEmbedding : dummyPackagingVector,
        visualEmbedding: "visualEmbedding" in opts ? opts.visualEmbedding : dummyVisualVector,
        thumbnailDescription: "thumbnailDescription" in opts ? opts.thumbnailDescription : null,
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

function makeVideoDoc(id: string, viewCount: number, tags: string[] = []) {
    return {
        id,
        data: () => ({ viewCount, tags }),
    };
}

/** Standard mock setup for most tests. */
function setupMocks(opts: {
    embeddingData?: ReturnType<typeof makeEmbeddingData>;
    hasOwnVideo?: boolean;
    ownVideoData?: Record<string, unknown>;
    trendChannels?: ReturnType<typeof makeTrendChannelDoc>[];
    trendChannelVideos?: Map<string, ReturnType<typeof makeVideoDoc>[]>;
    embeddingStats?: Record<string, unknown>;
    trendVideoLookup?: Map<string, Record<string, unknown>>;
}) {
    const trendChannels = opts.trendChannels ?? [makeTrendChannelDoc("ch1", "Channel 1")];
    const trendChannelVideos = opts.trendChannelVideos ?? new Map();
    const embData = opts.embeddingData;

    mockDocGet.mockImplementation((path: string) => {
        // globalVideoEmbeddings/{videoId}
        if (path.startsWith("globalVideoEmbeddings/")) {
            if (embData) {
                return Promise.resolve({ exists: true, data: () => embData });
            }
            return Promise.resolve({ exists: false });
        }

        // system/embeddingStats
        if (path === "system/embeddingStats") {
            if (opts.embeddingStats) {
                return Promise.resolve({
                    exists: true,
                    data: () => opts.embeddingStats,
                });
            }
            return Promise.resolve({ exists: false });
        }

        // own video: users/.../videos/{videoId}
        if (path.startsWith(`${BASE_PATH}/videos/`) && !path.includes("trendChannels")) {
            if (opts.hasOwnVideo || opts.ownVideoData) {
                return Promise.resolve({
                    exists: true,
                    data: () => opts.ownVideoData ?? {
                        title: "My Video",
                        tags: ["vlog"],
                        description: "A vlog about my day",
                    },
                });
            }
            return Promise.resolve({ exists: false });
        }

        // trend channel video lookup
        if (path.includes("trendChannels/") && path.includes("/videos/")) {
            const parts = path.split("trendChannels/")[1]?.split("/videos/");
            const channelId = parts?.[0];
            const videoId = parts?.[1];
            const key = `${channelId}/${videoId}`;
            const lookup = opts.trendVideoLookup?.get(key);
            if (lookup) {
                return Promise.resolve({ exists: true, data: () => lookup });
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
// Tests — mode: packaging (existing functionality)
// ---------------------------------------------------------------------------

describe("handleFindSimilarVideos — mode: packaging", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GEMINI_API_KEY = "test-key";
        mockGetHiddenVideoIds.mockResolvedValue(new Set());
        mockGetViewDeltas.mockResolvedValue(new Map());
        mockFindNearestVideos.mockResolvedValue([]);
        mockAssignPercentileGroups.mockReturnValue(new Map());
        mockDownloadThumbnail.mockResolvedValue({ buffer: Buffer.from("fake"), mimeType: "image/jpeg" });
    });

    it("uses stored embedding for competitor video", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", { tags: ["gaming"] });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Gaming Channel")],
            embeddingStats: {
                byChannel: { ch1: { packaging: 50, visual: 0, total: 80 } },
                updatedAt: Date.now(),
            },
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1") },
        ]);

        mockAssignPercentileGroups.mockReturnValue(new Map([["r1", "Top 5%"]]));

        const result = await handleFindSimilarVideos({ videoId: "comp-v1" }, CTX);

        expect(mockGeneratePackagingEmbedding).not.toHaveBeenCalled();
        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                queryVector: dummyPackagingVector,
                field: "packagingEmbedding",
            }),
        );
        expect(result).toHaveProperty("similar");
        expect(result).toHaveProperty("referenceVideo");
        expect(result).toHaveProperty("coverage", { indexed: 50, total: 80 });
    });

    it("generates embedding on-the-fly for own video", async () => {
        setupMocks({
            hasOwnVideo: true,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        mockGeneratePackagingEmbedding.mockResolvedValue(dummyPackagingVector);

        const result = await handleFindSimilarVideos({ videoId: "my-video" }, CTX);

        expect(mockGeneratePackagingEmbedding).toHaveBeenCalledWith(
            "My Video",
            ["vlog"],
            "A vlog about my day",
            "test-key",
        );
        expect(result).toHaveProperty("referenceVideo", {
            videoId: "my-video",
            title: "My Video",
            tags: ["vlog"],
        });
    });

    it("returns error when video not found anywhere", async () => {
        setupMocks({
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        const result = await handleFindSimilarVideos({ videoId: "nonexistent" }, CTX);

        expect(result).toHaveProperty("error");
        expect(result.error).toContain("Video not found");
    });

    it("filters hidden videos from results", async () => {
        const embData = makeEmbeddingData("query-v", "ch1");

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            trendChannelVideos: new Map([
                ["ch1", [makeVideoDoc("visible", 5000), makeVideoDoc("hidden-v", 8000)]],
            ]),
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "visible", distance: 0.2, data: makeEmbeddingData("visible", "ch1") },
            { videoId: "hidden-v", distance: 0.3, data: makeEmbeddingData("hidden-v", "ch1") },
        ]);

        mockGetHiddenVideoIds.mockResolvedValue(new Set(["hidden-v"]));
        mockAssignPercentileGroups.mockReturnValue(new Map([
            ["visible", "Middle 60%"],
            ["hidden-v", "Top 5%"],
        ]));

        const result = await handleFindSimilarVideos({ videoId: "query-v" }, CTX);

        const similar = result.similar as Array<{ videoId: string }>;
        expect(similar).toHaveLength(1);
        expect(similar[0].videoId).toBe("visible");
    });

    it("filters query video from results", async () => {
        const embData = makeEmbeddingData("query-v", "ch1");

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            trendChannelVideos: new Map([
                ["ch1", [makeVideoDoc("query-v", 10000), makeVideoDoc("other-v", 5000)]],
            ]),
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "query-v", distance: 0.0, data: makeEmbeddingData("query-v", "ch1") },
            { videoId: "other-v", distance: 0.3, data: makeEmbeddingData("other-v", "ch1") },
        ]);

        mockAssignPercentileGroups.mockReturnValue(new Map([
            ["query-v", "Top 1%"],
            ["other-v", "Middle 60%"],
        ]));

        const result = await handleFindSimilarVideos({ videoId: "query-v" }, CTX);

        const similar = result.similar as Array<{ videoId: string }>;
        expect(similar).toHaveLength(1);
        expect(similar[0].videoId).toBe("other-v");
    });

    it("enriches results with view deltas", async () => {
        const embData = makeEmbeddingData("query-v", "ch1");

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            trendChannelVideos: new Map([
                ["ch1", [makeVideoDoc("r1", 5000), makeVideoDoc("r2", 3000)]],
            ]),
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1") },
            { videoId: "r2", distance: 0.4, data: makeEmbeddingData("r2", "ch1") },
        ]);

        mockGetViewDeltas.mockResolvedValue(
            new Map([["r1", { delta24h: 500, delta7d: 3000, delta30d: 10000 }]]),
        );

        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleFindSimilarVideos({ videoId: "query-v" }, CTX);

        const similar = result.similar as Array<{
            videoId: string; viewDelta24h: number | null;
            viewDelta7d: number | null; viewDelta30d: number | null;
        }>;

        expect(similar[0].viewDelta24h).toBe(500);
        expect(similar[0].viewDelta7d).toBe(3000);
        expect(similar[0].viewDelta30d).toBe(10000);
        expect(similar[1].viewDelta24h).toBeNull();
    });

    it("includes coverage metadata from embeddingStats", async () => {
        const embData = makeEmbeddingData("query-v", "ch1");

        setupMocks({
            embeddingData: embData,
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

        const result = await handleFindSimilarVideos({ videoId: "query-v" }, CTX);

        expect(result.coverage).toEqual({ indexed: 180, total: 210 });
    });

    it("converts distance to similarity score correctly", async () => {
        const embData = makeEmbeddingData("query-v", "ch1");

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            trendChannelVideos: new Map([["ch1", [makeVideoDoc("r1", 5000)]]]),
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.3, data: makeEmbeddingData("r1", "ch1") },
        ]);

        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleFindSimilarVideos({ videoId: "query-v" }, CTX);

        const similar = result.similar as Array<{ similarityScore: number }>;
        expect(similar[0].similarityScore).toBe(0.7);
    });

    it("returns error for unknown mode", async () => {
        const result = await handleFindSimilarVideos(
            { videoId: "v1", mode: "unknown" },
            CTX,
        );
        expect(result.error).toContain("Unknown mode");
    });

    it("returns error when videoId is missing", async () => {
        const result = await handleFindSimilarVideos({}, CTX);
        expect(result.error).toContain("videoId is required");
    });
});

// ---------------------------------------------------------------------------
// Tests — mode: visual
// ---------------------------------------------------------------------------

describe("handleFindSimilarVideos — mode: visual", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GEMINI_API_KEY = "test-key";
        mockGetHiddenVideoIds.mockResolvedValue(new Set());
        mockGetViewDeltas.mockResolvedValue(new Map());
        mockFindNearestVideos.mockResolvedValue([]);
        mockAssignPercentileGroups.mockReturnValue(new Map());
        mockDownloadThumbnail.mockResolvedValue({ buffer: Buffer.from("fake"), mimeType: "image/jpeg" });
    });

    it("uses stored visual embedding for competitor video", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            visualEmbedding: dummyVisualVector,
            thumbnailDescription: "Red text on dark background",
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            embeddingStats: {
                byChannel: { ch1: { packaging: 50, visual: 40, total: 80 } },
                updatedAt: Date.now(),
            },
        });

        const resultData = makeEmbeddingData("r1", "ch1", {
            thumbnailDescription: "Blue gradient with face",
        });
        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.3, data: resultData },
        ]);
        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "visual" },
            CTX,
        );

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                queryVector: dummyVisualVector,
                field: "visualEmbedding",
            }),
        );
        expect(result.mode).toBe("visual");

        // thumbnailDescription included in visual results
        const similar = result.similar as Array<{ thumbnailDescription: string | null }>;
        expect(similar[0].thumbnailDescription).toBe("Blue gradient with face");

        // Coverage uses visual count
        expect(result.coverage).toEqual({ indexed: 40, total: 80 });
    });

    it("returns error for competitor without visual embedding", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            visualEmbedding: null,
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        const result = await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "visual" },
            CTX,
        );

        expect(result.error).toContain("Visual embedding not available");
    });

    it("generates visual embedding on-the-fly for own video", async () => {
        setupMocks({
            hasOwnVideo: true,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        mockGenerateVisualEmbedding.mockResolvedValue(dummyVisualVector);

        const result = await handleFindSimilarVideos(
            { videoId: "my-video", mode: "visual" },
            CTX,
        );

        expect(mockDownloadThumbnail).toHaveBeenCalledWith("my-video");
        expect(mockGenerateVisualEmbedding).toHaveBeenCalledWith("my-video", expect.objectContaining({ buffer: expect.any(Buffer), mimeType: "image/jpeg" }));
        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({
                queryVector: dummyVisualVector,
                field: "visualEmbedding",
            }),
        );
        expect(result).not.toHaveProperty("error");
    });

    it("includes thumbnailDescription as null when not available", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            visualEmbedding: dummyVisualVector,
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            trendChannelVideos: new Map([["ch1", [makeVideoDoc("r1", 5000)]]]),
        });

        // Result without thumbnailDescription
        const resultData = makeEmbeddingData("r1", "ch1", { thumbnailDescription: null });
        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.3, data: resultData },
        ]);
        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "visual" },
            CTX,
        );

        const similar = result.similar as Array<{ thumbnailDescription: string | null }>;
        expect(similar[0]).toHaveProperty("thumbnailDescription", null);
    });
});

// ---------------------------------------------------------------------------
// Tests — mode: both (RRF merge)
// ---------------------------------------------------------------------------

describe("handleFindSimilarVideos — mode: both", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GEMINI_API_KEY = "test-key";
        mockGetHiddenVideoIds.mockResolvedValue(new Set());
        mockGetViewDeltas.mockResolvedValue(new Map());
        mockFindNearestVideos.mockResolvedValue([]);
        mockAssignPercentileGroups.mockReturnValue(new Map());
        mockDownloadThumbnail.mockResolvedValue({ buffer: Buffer.from("fake"), mimeType: "image/jpeg" });
    });

    it("merges packaging + visual results with RRF when both vectors available", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            packagingEmbedding: dummyPackagingVector,
            visualEmbedding: dummyVisualVector,
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
            trendChannelVideos: new Map([
                ["ch1", [makeVideoDoc("r1", 5000), makeVideoDoc("r2", 3000), makeVideoDoc("r3", 7000)]],
            ]),
            embeddingStats: {
                byChannel: { ch1: { packaging: 50, visual: 40, total: 80 } },
                updatedAt: Date.now(),
            },
        });

        // Two vector search calls — packaging and visual
        let searchCallCount = 0;
        mockFindNearestVideos.mockImplementation((params: { field: string }) => {
            searchCallCount++;
            if (params.field === "packagingEmbedding") {
                return Promise.resolve([
                    { videoId: "r1", distance: 0.1, data: makeEmbeddingData("r1", "ch1", { thumbnailDescription: "Bright colors" }) },
                    { videoId: "r2", distance: 0.3, data: makeEmbeddingData("r2", "ch1") },
                ]);
            }
            // visualEmbedding
            return Promise.resolve([
                { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1", { thumbnailDescription: "Bright colors" }) },
                { videoId: "r3", distance: 0.4, data: makeEmbeddingData("r3", "ch1") },
            ]);
        });

        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "both" },
            CTX,
        );

        // Two vector searches happened
        expect(searchCallCount).toBe(2);

        expect(result.mode).toBe("both");
        expect(result).not.toHaveProperty("_note");

        const similar = result.similar as Array<{
            videoId: string;
            rrfScore: number;
            thumbnailDescription: string | null;
        }>;

        // r1 appears in BOTH lists → highest RRF score
        expect(similar[0].videoId).toBe("r1");
        expect(similar[0].rrfScore).toBeDefined();
        expect(similar[0]).not.toHaveProperty("similarityScore");
        expect(similar[0].thumbnailDescription).toBe("Bright colors");

        // r2 and r3 only in one list each → lower scores
        const r2 = similar.find((s) => s.videoId === "r2");
        const r3 = similar.find((s) => s.videoId === "r3");
        expect(r2).toBeDefined();
        expect(r3).toBeDefined();
        expect(similar[0].rrfScore).toBeGreaterThan(r2!.rrfScore);

        // Coverage has both packaging and visual counts
        expect(result.coverage).toEqual({
            packaging: { indexed: 50, total: 80 },
            visual: { indexed: 40, total: 80 },
        });
    });

    it("falls back to packaging when visual vector unavailable", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            packagingEmbedding: dummyPackagingVector,
            visualEmbedding: null, // no visual embedding
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1") },
        ]);
        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "both" },
            CTX,
        );

        expect(result.mode).toBe("both");
        expect(result._note).toContain("Visual embedding unavailable");
        expect(result._note).toContain("packaging-only");

        // Uses packaging search
        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({ field: "packagingEmbedding" }),
        );

        // Results have similarityScore (not rrfScore) — single mode fallback
        const similar = result.similar as Array<{ similarityScore?: number; rrfScore?: number }>;
        expect(similar[0]).toHaveProperty("similarityScore");
        expect(similar[0]).not.toHaveProperty("rrfScore");
    });

    it("falls back to visual when packaging vector unavailable", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            packagingEmbedding: null, // no packaging embedding
            visualEmbedding: dummyVisualVector,
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        mockFindNearestVideos.mockResolvedValue([
            { videoId: "r1", distance: 0.2, data: makeEmbeddingData("r1", "ch1") },
        ]);
        mockAssignPercentileGroups.mockReturnValue(new Map());

        const result = await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "both" },
            CTX,
        );

        expect(result.mode).toBe("both");
        expect(result._note).toContain("Packaging embedding unavailable");
        expect(result._note).toContain("visual-only");

        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({ field: "visualEmbedding" }),
        );
    });

    it("returns error when both vectors unavailable", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            packagingEmbedding: null,
            visualEmbedding: null,
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        const result = await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "both" },
            CTX,
        );

        expect(result).toHaveProperty("error");
    });

    it("uses parallel vector searches with limit 100 each", async () => {
        const embData = makeEmbeddingData("comp-v1", "ch1", {
            packagingEmbedding: dummyPackagingVector,
            visualEmbedding: dummyVisualVector,
        });

        setupMocks({
            embeddingData: embData,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        mockFindNearestVideos.mockResolvedValue([]);
        mockAssignPercentileGroups.mockReturnValue(new Map());

        await handleFindSimilarVideos(
            { videoId: "comp-v1", mode: "both" },
            CTX,
        );

        // Two search calls, each with limit 100
        expect(mockFindNearestVideos).toHaveBeenCalledTimes(2);
        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({ field: "packagingEmbedding", limit: 100 }),
        );
        expect(mockFindNearestVideos).toHaveBeenCalledWith(
            expect.objectContaining({ field: "visualEmbedding", limit: 100 }),
        );
    });

    it("generates both vectors on-the-fly for own video", async () => {
        setupMocks({
            hasOwnVideo: true,
            trendChannels: [makeTrendChannelDoc("ch1", "Channel 1")],
        });

        mockGeneratePackagingEmbedding.mockResolvedValue(dummyPackagingVector);
        mockGenerateVisualEmbedding.mockResolvedValue(dummyVisualVector);
        mockFindNearestVideos.mockResolvedValue([]);
        mockAssignPercentileGroups.mockReturnValue(new Map());

        await handleFindSimilarVideos(
            { videoId: "my-video", mode: "both" },
            CTX,
        );

        expect(mockGeneratePackagingEmbedding).toHaveBeenCalled();
        expect(mockDownloadThumbnail).toHaveBeenCalledWith("my-video");
        expect(mockGenerateVisualEmbedding).toHaveBeenCalledWith("my-video", expect.objectContaining({ buffer: expect.any(Buffer), mimeType: "image/jpeg" }));
        expect(mockFindNearestVideos).toHaveBeenCalledTimes(2);
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../types.js";

// --- Mocks ---

const mockDocGet = vi.fn();
const mockCollectionGet = vi.fn();
const mockGetAll = vi.fn();

vi.mock("../../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path, get: () => mockDocGet(path) }),
        collection: (path: string) => ({ path, get: () => mockCollectionGet(path) }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
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

const mockResolveVideosByIds = vi.fn();
vi.mock("../../../utils/resolveVideos.js", () => ({
    resolveVideosByIds: (...args: unknown[]) => mockResolveVideosByIds(...args),
}));

import { handleGetNicheSnapshot } from "../getNicheSnapshot.js";

// --- Helpers ---

const CTX: ToolContext = { userId: "user1", channelId: "ch1" };
const BASE_PATH = "users/user1/channels/ch1";

function makeSnap(exists: boolean, id: string, data?: Record<string, unknown>) {
    return { exists, id, data: () => data };
}

function makeTrendChannelDoc(id: string, title: string, lastUpdated?: number | string) {
    return {
        id,
        data: () => ({ title, lastUpdated: lastUpdated ?? "" }),
    };
}

function makeVideoDoc(id: string, data: Record<string, unknown>) {
    return {
        id,
        data: () => data,
    };
}

/**
 * Sets up mockCollectionGet to return different results based on collection path.
 * pathMap: path substring → docs array
 */
function setupCollectionGet(pathMap: Record<string, { docs: Array<ReturnType<typeof makeTrendChannelDoc | typeof makeVideoDoc>>; empty?: boolean }>) {
    mockCollectionGet.mockImplementation((path: string) => {
        for (const [key, value] of Object.entries(pathMap)) {
            if (path.includes(key)) {
                return Promise.resolve({
                    docs: value.docs,
                    empty: value.empty ?? value.docs.length === 0,
                });
            }
        }
        return Promise.resolve({ docs: [], empty: true });
    });
}

describe("handleGetNicheSnapshot", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAssignPercentileGroups.mockReturnValue(new Map([["vid1", "Top 20%"]]));
        mockGetViewDeltas.mockResolvedValue(new Map());
        mockGetHiddenVideoIds.mockResolvedValue(new Set());
        mockResolveVideosByIds.mockResolvedValue({ resolved: new Map(), missingIds: [] });
    });

    // -----------------------------------------------------------------------
    // 1. Returns error when neither date nor videoId provided
    // -----------------------------------------------------------------------
    it("returns error when neither date nor videoId provided", async () => {
        const result = await handleGetNicheSnapshot({}, CTX);
        expect(result).toEqual({
            error: "At least one of 'date' (ISO string) or 'videoId' must be provided.",
        });
    });

    // -----------------------------------------------------------------------
    // 2. Returns error for invalid date
    // -----------------------------------------------------------------------
    it("returns error for invalid date", async () => {
        // When date is provided, handler skips video resolution and goes straight
        // to window computation which calls new Date(referenceDate).getTime().
        // Need trendChannels query to not be reached — invalid date check is before that.
        const result = await handleGetNicheSnapshot({ date: "not-a-date" }, CTX);
        expect(result).toEqual({ error: "Invalid date: not-a-date" });
    });

    // -----------------------------------------------------------------------
    // 3. Works with date input (primary path, zero video resolution)
    // -----------------------------------------------------------------------
    it("works with date input — zero video resolution", async () => {
        // trendChannels collection is empty → early return
        setupCollectionGet({
            trendChannels: { docs: [], empty: true },
        });
        // Ensure the collection path is for trendChannels at the base
        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({ docs: [], empty: true });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot({ date: "2025-06-15T00:00:00.000Z" }, CTX);

        expect(result).not.toHaveProperty("error");
        expect(result).toHaveProperty("referencePoint");
        expect((result as Record<string, unknown>).referencePoint).toEqual({
            date: "2025-06-15",
        });
        expect(result).toHaveProperty("competitorActivity", []);
        expect(result).toHaveProperty("dataFreshness", []);
        // No doc reads — only collection read for trendChannels
        expect(mockDocGet).not.toHaveBeenCalled();
        expect(mockResolveVideosByIds).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 4. Works with videoId + channelId (single doc read resolution)
    // -----------------------------------------------------------------------
    it("works with videoId + channelId — single doc read", async () => {
        // Step 1: resolve videoId via single doc read
        mockDocGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels/tc1/videos/vid1`) {
                return Promise.resolve(makeSnap(true, "vid1", {
                    publishedAt: "2025-06-15T12:00:00.000Z",
                    title: "Test Video",
                }));
            }
            return Promise.resolve(makeSnap(false, "unknown"));
        });

        // Step 2: trendChannels empty → early return with resolved video info
        mockCollectionGet.mockResolvedValue({ docs: [], empty: true });

        const result = await handleGetNicheSnapshot(
            { videoId: "vid1", channelId: "tc1" },
            CTX,
        );

        expect(result).not.toHaveProperty("error");
        const ref = (result as Record<string, unknown>).referencePoint as Record<string, unknown>;
        expect(ref.date).toBe("2025-06-15");
        expect(ref.videoId).toBe("vid1");
        expect(ref.videoTitle).toBe("Test Video");
        // Single doc read used
        expect(mockDocGet).toHaveBeenCalledWith(
            `${BASE_PATH}/trendChannels/tc1/videos/vid1`,
        );
    });

    // -----------------------------------------------------------------------
    // 5. Works with videoId only (scans trend channels via getAll)
    // -----------------------------------------------------------------------
    it("works with videoId only — scans trend channels", async () => {
        // No channelId hint → first doc read is skipped.
        // Step 1: list trend channels to scan
        let collectionCallCount = 0;
        mockCollectionGet.mockImplementation((path: string) => {
            collectionCallCount++;
            if (path === `${BASE_PATH}/trendChannels` && collectionCallCount <= 2) {
                // First call: listing trend channels for scan; second call: main read
                return Promise.resolve({
                    docs: [makeTrendChannelDoc("tc1", "Channel 1")],
                    empty: false,
                });
            }
            // Videos subcollections return empty
            return Promise.resolve({ docs: [], empty: true });
        });

        // Step 2: getAll finds the video in tc1
        mockGetAll.mockResolvedValue([
            makeSnap(true, "vid1", {
                publishedAt: "2025-07-01T00:00:00.000Z",
                title: "Found Video",
            }),
        ]);

        const result = await handleGetNicheSnapshot({ videoId: "vid1" }, CTX);

        expect(result).not.toHaveProperty("error");
        const ref = (result as Record<string, unknown>).referencePoint as Record<string, unknown>;
        expect(ref.date).toBe("2025-07-01");
        expect(ref.videoId).toBe("vid1");
        expect(ref.videoTitle).toBe("Found Video");
        expect(mockGetAll).toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // 6. Falls back to resolveVideosByIds when video not in trend channels
    // -----------------------------------------------------------------------
    it("falls back to resolveVideosByIds when not in trend channels", async () => {
        // No channelId hint
        let collectionCallCount = 0;
        mockCollectionGet.mockImplementation((path: string) => {
            collectionCallCount++;
            if (path === `${BASE_PATH}/trendChannels`) {
                if (collectionCallCount <= 2) {
                    return Promise.resolve({
                        docs: [makeTrendChannelDoc("tc1", "Channel 1")],
                        empty: false,
                    });
                }
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        // getAll returns no match
        mockGetAll.mockResolvedValue([makeSnap(false, "vid1")]);

        // resolveVideosByIds finds it
        mockResolveVideosByIds.mockResolvedValue({
            resolved: new Map([
                ["vid1", { data: { publishedAt: "2025-08-01T00:00:00.000Z", title: "Own Video" } }],
            ]),
            missingIds: [],
        });

        const result = await handleGetNicheSnapshot({ videoId: "vid1" }, CTX);

        expect(result).not.toHaveProperty("error");
        expect(mockResolveVideosByIds).toHaveBeenCalledWith(BASE_PATH, ["vid1"]);
        const ref = (result as Record<string, unknown>).referencePoint as Record<string, unknown>;
        expect(ref.videoTitle).toBe("Own Video");
    });

    // -----------------------------------------------------------------------
    // 7. Returns error when videoId not found anywhere
    // -----------------------------------------------------------------------
    it("returns error when videoId not found anywhere", async () => {
        let collectionCallCount = 0;
        mockCollectionGet.mockImplementation((path: string) => {
            collectionCallCount++;
            if (path === `${BASE_PATH}/trendChannels` && collectionCallCount === 1) {
                return Promise.resolve({
                    docs: [makeTrendChannelDoc("tc1", "Channel 1")],
                    empty: false,
                });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        mockGetAll.mockResolvedValue([makeSnap(false, "vid1")]);
        mockResolveVideosByIds.mockResolvedValue({ resolved: new Map(), missingIds: ["vid1"] });

        const result = await handleGetNicheSnapshot({ videoId: "vid1" }, CTX);

        expect(result).toEqual({ error: "Video not found: vid1" });
    });

    // -----------------------------------------------------------------------
    // 8. Computes correct window (±windowDays)
    // -----------------------------------------------------------------------
    it("computes correct window with custom windowDays", async () => {
        mockCollectionGet.mockResolvedValue({ docs: [], empty: true });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z", windowDays: 3 },
            CTX,
        ) as Record<string, unknown>;

        const window = result.window as { from: string; to: string };
        // 2025-06-15 ± 3 days = 2025-06-12 to 2025-06-18
        expect(window.from).toBe("2025-06-12");
        expect(window.to).toBe("2025-06-18");
    });

    // -----------------------------------------------------------------------
    // 9. Uses DEFAULT_WINDOW_DAYS (7) when windowDays not specified
    // -----------------------------------------------------------------------
    it("uses default window of 7 days when windowDays not specified", async () => {
        mockCollectionGet.mockResolvedValue({ docs: [], empty: true });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z" },
            CTX,
        ) as Record<string, unknown>;

        const window = result.window as { from: string; to: string };
        // 2025-06-15 ± 7 days = 2025-06-08 to 2025-06-22
        expect(window.from).toBe("2025-06-08");
        expect(window.to).toBe("2025-06-22");
    });

    // -----------------------------------------------------------------------
    // 10. Filters hidden videos from window results (but includes in percentile calc)
    // -----------------------------------------------------------------------
    it("filters hidden videos from window but includes in percentile calc", async () => {
        mockGetHiddenVideoIds.mockResolvedValue(new Set(["hidden-vid"]));

        // Percentile mock: track what was passed
        mockAssignPercentileGroups.mockImplementation(
            (vids: { id: string; viewCount: number }[]) => {
                const m = new Map<string, string>();
                for (const v of vids) m.set(v.id, "Top 20%");
                return m;
            },
        );

        const refDate = "2025-06-15T00:00:00.000Z";

        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({
                    docs: [makeTrendChannelDoc("tc1", "Channel 1", 12345)],
                    empty: false,
                });
            }
            if (path.includes("/videos")) {
                return Promise.resolve({
                    docs: [
                        makeVideoDoc("visible-vid", {
                            title: "Visible",
                            viewCount: 1000,
                            publishedAt: "2025-06-14T00:00:00.000Z",
                            tags: ["tag1"],
                        }),
                        makeVideoDoc("hidden-vid", {
                            title: "Hidden",
                            viewCount: 5000,
                            publishedAt: "2025-06-13T00:00:00.000Z",
                            tags: ["tag2"],
                        }),
                        makeVideoDoc("outside-vid", {
                            title: "Outside Window",
                            viewCount: 2000,
                            publishedAt: "2024-01-01T00:00:00.000Z",
                            tags: [],
                        }),
                    ],
                    empty: false,
                });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot({ date: refDate }, CTX) as Record<string, unknown>;

        // Percentile calc should include ALL videos (including hidden)
        expect(mockAssignPercentileGroups).toHaveBeenCalledWith(
            expect.arrayContaining([
                { id: "visible-vid", viewCount: 1000 },
                { id: "hidden-vid", viewCount: 5000 },
                { id: "outside-vid", viewCount: 2000 },
            ]),
        );

        // Window results should NOT include hidden video
        const activity = result.competitorActivity as Array<Record<string, unknown>>;
        expect(activity).toHaveLength(1);
        const videos = activity[0].videos as Array<Record<string, unknown>>;
        const videoIds = videos.map(v => v.videoId);
        expect(videoIds).toContain("visible-vid");
        expect(videoIds).not.toContain("hidden-vid");
    });

    // -----------------------------------------------------------------------
    // 11. Returns empty competitorActivity when no videos in window
    // -----------------------------------------------------------------------
    it("returns empty competitorActivity when no videos in window", async () => {
        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({
                    docs: [makeTrendChannelDoc("tc1", "Channel 1")],
                    empty: false,
                });
            }
            if (path.includes("/videos")) {
                // All videos outside the window
                return Promise.resolve({
                    docs: [
                        makeVideoDoc("old-vid", {
                            title: "Old",
                            viewCount: 100,
                            publishedAt: "2020-01-01T00:00:00.000Z",
                            tags: [],
                        }),
                    ],
                    empty: false,
                });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z" },
            CTX,
        ) as Record<string, unknown>;

        expect(result.competitorActivity).toEqual([]);
        const aggregates = result.aggregates as Record<string, unknown>;
        expect(aggregates.totalVideosInWindow).toBe(0);
        expect(aggregates.avgViewsInWindow).toBe(0);
        expect(aggregates.topByViews).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // 12. Computes commonTags correctly
    // -----------------------------------------------------------------------
    it("computes commonTags correctly", async () => {
        mockAssignPercentileGroups.mockReturnValue(new Map());

        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({
                    docs: [makeTrendChannelDoc("tc1", "Channel 1")],
                    empty: false,
                });
            }
            if (path.includes("/videos")) {
                return Promise.resolve({
                    docs: [
                        makeVideoDoc("v1", {
                            title: "V1",
                            viewCount: 100,
                            publishedAt: "2025-06-14T00:00:00.000Z",
                            tags: ["react", "javascript", "tutorial"],
                        }),
                        makeVideoDoc("v2", {
                            title: "V2",
                            viewCount: 200,
                            publishedAt: "2025-06-13T00:00:00.000Z",
                            tags: ["react", "typescript"],
                        }),
                        makeVideoDoc("v3", {
                            title: "V3",
                            viewCount: 300,
                            publishedAt: "2025-06-12T00:00:00.000Z",
                            tags: ["react", "javascript"],
                        }),
                    ],
                    empty: false,
                });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z" },
            CTX,
        ) as Record<string, unknown>;

        const aggregates = result.aggregates as Record<string, unknown>;
        const commonTags = aggregates.commonTags as Array<{ tag: string; weight: number }>;

        // Log-scaled: react = log1p(100)+log1p(200)+log1p(300) ≈ 15.6
        //             javascript = log1p(100)+log1p(300) ≈ 10.3
        expect(commonTags[0]).toEqual({ tag: "react", weight: 15.6 });
        expect(commonTags[1]).toEqual({ tag: "javascript", weight: 10.3 });
        expect(commonTags).toHaveLength(4);
    });

    // -----------------------------------------------------------------------
    // 12b. Truncates commonTags to top 20
    // -----------------------------------------------------------------------
    it("truncates commonTags to top 20 when more distinct tags exist", async () => {
        mockAssignPercentileGroups.mockReturnValue(new Map());

        // Generate 25 unique tags — each appears once across videos
        const allTags = Array.from({ length: 25 }, (_, i) => `tag-${String(i).padStart(2, "0")}`);

        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({
                    docs: [makeTrendChannelDoc("tc1", "Channel 1")],
                    empty: false,
                });
            }
            if (path.includes("/videos")) {
                // Create videos that collectively use all 25 tags
                // v1 has tags 0-12, v2 has tags 13-24, v3 has tag-00 (so tag-00 appears 2x)
                return Promise.resolve({
                    docs: [
                        makeVideoDoc("v1", {
                            title: "V1", viewCount: 100,
                            publishedAt: "2025-06-14T00:00:00.000Z",
                            tags: allTags.slice(0, 13),
                        }),
                        makeVideoDoc("v2", {
                            title: "V2", viewCount: 200,
                            publishedAt: "2025-06-13T00:00:00.000Z",
                            tags: allTags.slice(13),
                        }),
                        makeVideoDoc("v3", {
                            title: "V3", viewCount: 300,
                            publishedAt: "2025-06-12T00:00:00.000Z",
                            tags: ["tag-00"],
                        }),
                    ],
                    empty: false,
                });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z" },
            CTX,
        ) as Record<string, unknown>;

        const aggregates = result.aggregates as Record<string, unknown>;
        const commonTags = aggregates.commonTags as Array<{ tag: string; weight: number }>;

        // Should be truncated to 20
        expect(commonTags).toHaveLength(20);
        // tag-00 in v1(100) + v3(300) → log1p(100)+log1p(300) ≈ 10.3 → highest weight → first
        expect(commonTags[0]).toEqual({ tag: "tag-00", weight: 10.3 });
    });

    // -----------------------------------------------------------------------
    // 12c. Handles null/missing tags in video data
    // -----------------------------------------------------------------------
    it("handles null/missing tags gracefully", async () => {
        mockAssignPercentileGroups.mockReturnValue(new Map());

        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({
                    docs: [makeTrendChannelDoc("tc1", "Channel 1")],
                    empty: false,
                });
            }
            if (path.includes("/videos")) {
                return Promise.resolve({
                    docs: [
                        makeVideoDoc("v1", {
                            title: "V1", viewCount: 100,
                            publishedAt: "2025-06-14T00:00:00.000Z",
                            tags: null,
                        }),
                        makeVideoDoc("v2", {
                            title: "V2", viewCount: 200,
                            publishedAt: "2025-06-13T00:00:00.000Z",
                            // tags field completely missing
                        }),
                        makeVideoDoc("v3", {
                            title: "V3", viewCount: 300,
                            publishedAt: "2025-06-12T00:00:00.000Z",
                            tags: ["valid-tag"],
                        }),
                    ],
                    empty: false,
                });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z" },
            CTX,
        ) as Record<string, unknown>;

        // Should not throw — null/missing tags treated as empty array
        expect(result).not.toHaveProperty("error");
        const aggregates = result.aggregates as Record<string, unknown>;
        const commonTags = aggregates.commonTags as Array<{ tag: string; weight: number }>;
        expect(commonTags).toEqual([{ tag: "valid-tag", weight: 5.7 }]);
    });

    // -----------------------------------------------------------------------
    // 13. Returns dataFreshness for all channels
    // -----------------------------------------------------------------------
    it("returns dataFreshness for all channels", async () => {
        mockAssignPercentileGroups.mockReturnValue(new Map());

        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({
                    docs: [
                        makeTrendChannelDoc("tc1", "Channel 1", 1700000000000),
                        makeTrendChannelDoc("tc2", "Channel 2", "2025-06-14T00:00:00.000Z"),
                    ],
                    empty: false,
                });
            }
            if (path.includes("/videos")) {
                return Promise.resolve({ docs: [], empty: true });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z" },
            CTX,
        ) as Record<string, unknown>;

        const freshness = result.dataFreshness as Array<Record<string, unknown>>;
        expect(freshness).toHaveLength(2);
        expect(freshness[0]).toEqual({
            channelId: "tc1",
            channelTitle: "Channel 1",
            lastSynced: new Date(1700000000000).toISOString(),
        });
        expect(freshness[1]).toEqual({
            channelId: "tc2",
            channelTitle: "Channel 2",
            lastSynced: "2025-06-14T00:00:00.000Z",
        });
    });

    // -----------------------------------------------------------------------
    // 14. Computes aggregates (totalVideosInWindow, avgViewsInWindow, topByViews)
    // -----------------------------------------------------------------------
    it("computes aggregates correctly", async () => {
        mockAssignPercentileGroups.mockImplementation(
            (vids: { id: string; viewCount: number }[]) => {
                const m = new Map<string, string>();
                for (const v of vids) m.set(v.id, "Top 20%");
                return m;
            },
        );

        mockCollectionGet.mockImplementation((path: string) => {
            if (path === `${BASE_PATH}/trendChannels`) {
                return Promise.resolve({
                    docs: [
                        makeTrendChannelDoc("tc1", "Channel 1"),
                        makeTrendChannelDoc("tc2", "Channel 2"),
                    ],
                    empty: false,
                });
            }
            if (path === `${BASE_PATH}/trendChannels/tc1/videos`) {
                return Promise.resolve({
                    docs: [
                        makeVideoDoc("v1", {
                            title: "V1",
                            viewCount: 1000,
                            publishedAt: "2025-06-14T00:00:00.000Z",
                            tags: [],
                        }),
                        makeVideoDoc("v2", {
                            title: "V2",
                            viewCount: 3000,
                            publishedAt: "2025-06-13T00:00:00.000Z",
                            tags: [],
                        }),
                    ],
                    empty: false,
                });
            }
            if (path === `${BASE_PATH}/trendChannels/tc2/videos`) {
                return Promise.resolve({
                    docs: [
                        makeVideoDoc("v3", {
                            title: "V3",
                            viewCount: 5000,
                            publishedAt: "2025-06-12T00:00:00.000Z",
                            tags: [],
                        }),
                        makeVideoDoc("v4", {
                            title: "V4",
                            viewCount: 200,
                            publishedAt: "2025-06-16T00:00:00.000Z",
                            tags: [],
                        }),
                    ],
                    empty: false,
                });
            }
            return Promise.resolve({ docs: [], empty: true });
        });

        const result = await handleGetNicheSnapshot(
            { date: "2025-06-15T00:00:00.000Z" },
            CTX,
        ) as Record<string, unknown>;

        const aggregates = result.aggregates as Record<string, unknown>;

        // All 4 videos are within ±7 days of 2025-06-15
        expect(aggregates.totalVideosInWindow).toBe(4);

        // avg = (1000 + 3000 + 5000 + 200) / 4 = 2300
        expect(aggregates.avgViewsInWindow).toBe(2300);

        // topByViews: top 5 sorted desc
        const topByViews = aggregates.topByViews as Array<Record<string, unknown>>;
        expect(topByViews).toHaveLength(4);
        expect(topByViews[0].videoId).toBe("v3");
        expect(topByViews[0].viewCount).toBe(5000);
        expect(topByViews[0].channelTitle).toBe("Channel 2");
        expect(topByViews[1].videoId).toBe("v2");
        expect(topByViews[1].viewCount).toBe(3000);

        // competitorActivity should have both channels
        const activity = result.competitorActivity as Array<Record<string, unknown>>;
        expect(activity).toHaveLength(2);

        // Per-channel avgViews
        const ch1 = activity.find(a => a.channelId === "tc1")!;
        expect(ch1.avgViews).toBe(2000); // (1000+3000)/2
        expect(ch1.videosPublished).toBe(2);

        const ch2 = activity.find(a => a.channelId === "tc2")!;
        expect(ch2.avgViews).toBe(2600); // (5000+200)/2
        expect((ch2.topPerformer as Record<string, unknown>).videoId).toBe("v3");
    });
});

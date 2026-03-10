import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockWhereGet = vi.fn().mockResolvedValue({ docs: [] });
const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [] });

vi.mock("../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        collection: () => ({
            where: () => ({ get: () => mockWhereGet() }),
            get: () => mockCollectionGet(),
        }),
    },
}));

import { resolveVideosByIds } from "../resolveVideos.js";

const BASE = "users/user1/channels/ch1";

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

beforeEach(() => {
    vi.clearAllMocks();
    // Default: reverse lookup returns empty
    mockWhereGet.mockResolvedValue({ docs: [] });
    // Default: no trend channels
    mockCollectionGet.mockResolvedValue({ docs: [] });
});

// =============================================================================
// Direct document lookup (Step 1)
// =============================================================================

describe("resolveVideosByIds — direct lookup", () => {
    it("resolves video found in videos/ collection", async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: "My Video", channelId: "UCown" })])
            .mockResolvedValueOnce([makeSnap(false)]);

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["abc123"]);

        expect(resolved.size).toBe(1);
        expect(resolved.get("abc123")).toEqual({
            requestedId: "abc123",
            docId: "abc123",
            data: { title: "My Video", channelId: "UCown" },
            source: "video_grid",
        });
        expect(missingIds).toEqual([]);
    });

    it("resolves video found in cached_external_videos/", async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(true, { title: "External Video" })]);

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["ext123"]);

        expect(resolved.get("ext123")!.source).toBe("external_cache");
        expect(missingIds).toEqual([]);
    });

    it("prioritizes videos/ over cached_external_videos/", async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: "Own" })])
            .mockResolvedValueOnce([makeSnap(true, { title: "External" })]);

        const { resolved } = await resolveVideosByIds(BASE, ["v1"]);
        expect(resolved.get("v1")!.data.title).toBe("Own");
        expect(resolved.get("v1")!.source).toBe("video_grid");
    });

    it("returns missingIds for videos not found in either collection", async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["gone123"]);

        expect(resolved.size).toBe(0);
        expect(missingIds).toEqual(["gone123"]);
    });

    it("handles empty input", async () => {
        const { resolved, missingIds } = await resolveVideosByIds(BASE, []);
        expect(resolved.size).toBe(0);
        expect(missingIds).toEqual([]);
        expect(mockGetAll).not.toHaveBeenCalled();
    });

    it("handles batch of mixed results", async () => {
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "V1" }),
                makeSnap(false),
                makeSnap(true, { title: "V3" }),
            ])
            .mockResolvedValueOnce([
                makeSnap(false),
                makeSnap(true, { title: "V2 ext" }),
                makeSnap(false),
            ]);

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["v1", "v2", "v3"]);

        expect(resolved.size).toBe(3);
        expect(resolved.get("v1")!.source).toBe("video_grid");
        expect(resolved.get("v2")!.source).toBe("external_cache");
        expect(resolved.get("v3")!.source).toBe("video_grid");
        expect(missingIds).toEqual([]);
    });
});

// =============================================================================
// skipExternal option
// =============================================================================

describe("resolveVideosByIds — skipExternal", () => {
    it("only checks videos/ collection when skipExternal is true", async () => {
        mockGetAll.mockResolvedValueOnce([makeSnap(true, { title: "Own Video" })]);

        const { resolved } = await resolveVideosByIds(BASE, ["v1"], { skipExternal: true });

        expect(resolved.get("v1")!.source).toBe("video_grid");
        // getAll called only once (no ext collection)
        expect(mockGetAll).toHaveBeenCalledTimes(1);
    });

    it("returns missingIds when video not in videos/ and skipExternal is true", async () => {
        mockGetAll.mockResolvedValueOnce([makeSnap(false)]);

        const { missingIds } = await resolveVideosByIds(BASE, ["v1"], { skipExternal: true });
        expect(missingIds).toEqual(["v1"]);
    });
});

// =============================================================================
// Reverse lookup via publishedVideoId (Step 2) — custom video resolution
// =============================================================================

describe("resolveVideosByIds — publishedVideoId reverse lookup", () => {
    it("finds custom video by publishedVideoId when direct lookup fails", async () => {
        // Step 1: direct lookup — not found in either collection
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        // Step 2: reverse lookup — found custom video
        mockWhereGet.mockResolvedValueOnce({
            docs: [{
                id: "custom-1772299911717",
                data: () => ({
                    title: "My Published Custom Video",
                    publishedVideoId: "abc123",
                    channelId: "UCown",
                    isCustom: true,
                }),
            }],
        });

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["abc123"]);

        expect(resolved.size).toBe(1);
        const entry = resolved.get("abc123")!;
        expect(entry.requestedId).toBe("abc123");
        expect(entry.docId).toBe("custom-1772299911717");
        expect(entry.data.title).toBe("My Published Custom Video");
        expect(entry.source).toBe("video_grid");
        expect(missingIds).toEqual([]);
    });

    it("skips reverse lookup when all IDs are resolved by direct lookup", async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: "Found" })])
            .mockResolvedValueOnce([makeSnap(false)]);

        await resolveVideosByIds(BASE, ["v1"]);

        // collection().where() should NOT be called
        expect(mockWhereGet).not.toHaveBeenCalled();
    });

    it("handles mixed: some direct, some via publishedVideoId", async () => {
        // v1 found directly, v2 not found
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: "Direct Video" }),
                makeSnap(false),
            ])
            .mockResolvedValueOnce([
                makeSnap(false),
                makeSnap(false),
            ]);

        // v2 found via publishedVideoId
        mockWhereGet.mockResolvedValueOnce({
            docs: [{
                id: "custom-9999",
                data: () => ({ title: "Custom Video", publishedVideoId: "v2" }),
            }],
        });

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["v1", "v2"]);

        expect(resolved.size).toBe(2);
        expect(resolved.get("v1")!.docId).toBe("v1");
        expect(resolved.get("v2")!.docId).toBe("custom-9999");
        expect(missingIds).toEqual([]);
    });

    it("returns missingIds when reverse lookup also finds nothing", async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        // Reverse lookup finds nothing
        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        const { missingIds } = await resolveVideosByIds(BASE, ["unknown123"]);
        expect(missingIds).toEqual(["unknown123"]);
    });
});

// =============================================================================
// Trend channel videos lookup (Step 3)
// =============================================================================

describe("resolveVideosByIds — trendChannels lookup (Step 3)", () => {
    it("finds video in trendChannels after miss in Steps 1-2", async () => {
        // Step 1: not found in own or external
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])   // own
            .mockResolvedValueOnce([makeSnap(false)]);  // ext

        // Step 2: reverse lookup empty
        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        // Step 3: one trend channel exists
        mockCollectionGet.mockResolvedValueOnce({
            docs: [{ id: "UCcompetitor" }],
        });

        // Step 3: getAll finds the video
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: "Competitor Video", thumbnail: "thumb.jpg" }),
        ]);

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["comp123"]);

        expect(resolved.size).toBe(1);
        const entry = resolved.get("comp123")!;
        expect(entry.source).toBe("trend_channel");
        expect(entry.data.title).toBe("Competitor Video");
        expect(entry.data.channelId).toBe("UCcompetitor");
        expect(missingIds).toEqual([]);
    });

    it("returns missingIds when video not found in any layer", async () => {
        // Step 1: miss
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        // Step 2: miss
        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        // Step 3: one channel, but video not found there either
        mockCollectionGet.mockResolvedValueOnce({
            docs: [{ id: "UCcompetitor" }],
        });
        mockGetAll.mockResolvedValueOnce([makeSnap(false)]);

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["ghost123"]);

        expect(resolved.size).toBe(0);
        expect(missingIds).toEqual(["ghost123"]);
    });

    it("preserves priority: video_grid > external_cache > trend_channel", async () => {
        // v1 found in video_grid (Step 1), v2 not found
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: "Own" }), makeSnap(false)])  // own
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false)]);                   // ext

        // Step 2: v2 not found
        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        // Step 3: only v2 in missingAfterStep2 (v1 already resolved)
        mockCollectionGet.mockResolvedValueOnce({
            docs: [{ id: "UCcomp" }],
        });
        // 1 missing ID × 1 channel = 1 ref
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: "Comp V2", thumbnail: "t.jpg" }),      // v2 found
        ]);

        const { resolved } = await resolveVideosByIds(BASE, ["v1", "v2"]);

        expect(resolved.get("v1")!.source).toBe("video_grid");
        expect(resolved.get("v2")!.source).toBe("trend_channel");
    });

    it("skips Step 3 when zero trend channels exist", async () => {
        // Step 1: miss
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        // Step 2: miss
        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        // Step 3: no channels
        mockCollectionGet.mockResolvedValueOnce({ docs: [] });

        const { missingIds } = await resolveVideosByIds(BASE, ["vid1"]);

        expect(missingIds).toEqual(["vid1"]);
        // getAll called only twice (Step 1: own + ext), NOT for Step 3
        expect(mockGetAll).toHaveBeenCalledTimes(2);
    });

    it("skips Step 3 when skipExternal is true", async () => {
        // Step 1: miss (skipExternal — only own collection)
        mockGetAll.mockResolvedValueOnce([makeSnap(false)]);

        const { missingIds } = await resolveVideosByIds(BASE, ["vid1"], { skipExternal: true });

        expect(missingIds).toEqual(["vid1"]);
        // collection().get() for trendChannels should NOT be called
        expect(mockCollectionGet).not.toHaveBeenCalled();
    });

    it("adds channelId from path to data", async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);
        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        mockCollectionGet.mockResolvedValueOnce({
            docs: [{ id: "UCchannel42" }],
        });
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: "Video", viewCount: 1000 }),
        ]);

        const { resolved } = await resolveVideosByIds(BASE, ["vid1"]);
        const entry = resolved.get("vid1")!;

        expect(entry.data.channelId).toBe("UCchannel42");
        expect(entry.data.title).toBe("Video");
        expect(entry.data.viewCount).toBe(1000);
    });

    it("handles multiple missing IDs across multiple channels in one getAll", async () => {
        // 3 missing IDs
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false), makeSnap(false)])   // own
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false), makeSnap(false)]);  // ext

        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        // 2 trend channels
        mockCollectionGet.mockResolvedValueOnce({
            docs: [{ id: "UCa" }, { id: "UCb" }],
        });

        // 3 IDs × 2 channels = 6 refs in one getAll
        // vid1 found in UCa, vid2 found in UCb, vid3 not found
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: "V1" }),   // vid1 × UCa
            makeSnap(false),                    // vid1 × UCb
            makeSnap(false),                    // vid2 × UCa
            makeSnap(true, { title: "V2" }),   // vid2 × UCb
            makeSnap(false),                    // vid3 × UCa
            makeSnap(false),                    // vid3 × UCb
        ]);

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["vid1", "vid2", "vid3"]);

        expect(resolved.size).toBe(2);
        expect(resolved.get("vid1")!.data.channelId).toBe("UCa");
        expect(resolved.get("vid2")!.data.channelId).toBe("UCb");
        expect(missingIds).toEqual(["vid3"]);
    });

    it("graceful degradation: trendChannels read failure returns Steps 1-2 results", async () => {
        // Step 1: found one
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: "Own" }), makeSnap(false)])  // own
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false)]);                   // ext

        // Step 2: nothing
        mockWhereGet.mockResolvedValueOnce({ docs: [] });

        // Step 3: collection read throws
        mockCollectionGet.mockRejectedValueOnce(new Error("Firestore unavailable"));

        const { resolved, missingIds } = await resolveVideosByIds(BASE, ["v1", "v2"]);

        // v1 from Step 1 still returned, v2 still missing (no crash)
        expect(resolved.size).toBe(1);
        expect(resolved.get("v1")!.source).toBe("video_grid");
        expect(missingIds).toEqual(["v2"]);
    });
});

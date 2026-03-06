import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockWhereGet = vi.fn().mockResolvedValue({ docs: [] });

vi.mock("../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        collection: () => ({
            where: () => ({ get: () => mockWhereGet() }),
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

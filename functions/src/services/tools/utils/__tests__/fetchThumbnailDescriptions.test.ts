import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock Firestore ---

const mockGetAll = vi.fn();

vi.mock("../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => ({ path, id: path.split("/").pop() }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
    },
}));

import { fetchThumbnailDescriptions } from "../fetchThumbnailDescriptions.js";

// --- Helpers ---

function makeSnap(id: string, description?: string | null) {
    return {
        exists: description !== undefined,
        id,
        data: () => (description !== undefined ? { thumbnailDescription: description } : undefined),
    };
}

// --- Tests ---

describe("fetchThumbnailDescriptions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns empty Map for empty input", async () => {
        const result = await fetchThumbnailDescriptions([]);

        expect(result.size).toBe(0);
        expect(mockGetAll).not.toHaveBeenCalled();
    });

    it("returns descriptions for all found videos", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap("vid1", "A serene autumn landscape with warm golden tones"),
            makeSnap("vid2", "Oil painting of a cozy cottage by a river"),
        ]);

        const result = await fetchThumbnailDescriptions(["vid1", "vid2"]);

        expect(result.size).toBe(2);
        expect(result.get("vid1")).toBe("A serene autumn landscape with warm golden tones");
        expect(result.get("vid2")).toBe("Oil painting of a cozy cottage by a river");
    });

    it("returns only found entries for partial coverage", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap("vid1", "A serene autumn landscape"),
            makeSnap("vid2"), // not found in globalVideoEmbeddings
            makeSnap("vid3", "Winter scene with snow-covered trees"),
        ]);

        const result = await fetchThumbnailDescriptions(["vid1", "vid2", "vid3"]);

        expect(result.size).toBe(2);
        expect(result.has("vid1")).toBe(true);
        expect(result.has("vid2")).toBe(false);
        expect(result.has("vid3")).toBe(true);
    });

    it("returns empty Map when no videos have descriptions", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap("vid1"), // not found
            makeSnap("vid2"), // not found
        ]);

        const result = await fetchThumbnailDescriptions(["vid1", "vid2"]);

        expect(result.size).toBe(0);
    });

    it("filters out null and empty descriptions", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap("vid1", null),
            makeSnap("vid2", ""),
            makeSnap("vid3", "Valid description"),
        ]);

        // Override for null case: doc exists but description is null
        mockGetAll.mockResolvedValue([
            { exists: true, id: "vid1", data: () => ({ thumbnailDescription: null }) },
            { exists: true, id: "vid2", data: () => ({ thumbnailDescription: "" }) },
            { exists: true, id: "vid3", data: () => ({ thumbnailDescription: "Valid description" }) },
        ]);

        const result = await fetchThumbnailDescriptions(["vid1", "vid2", "vid3"]);

        expect(result.size).toBe(1);
        expect(result.get("vid3")).toBe("Valid description");
    });

    it("deduplicates input video IDs", async () => {
        mockGetAll.mockResolvedValue([
            makeSnap("vid1", "Description A"),
        ]);

        const result = await fetchThumbnailDescriptions(["vid1", "vid1", "vid1"]);

        expect(result.size).toBe(1);
        // Should only create 1 ref, not 3
        expect(mockGetAll).toHaveBeenCalledTimes(1);
        const refs = mockGetAll.mock.calls[0];
        expect(refs).toHaveLength(1);
    });
});

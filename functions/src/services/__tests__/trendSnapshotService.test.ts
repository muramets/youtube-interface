import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTrendSnapshots, getViewDeltas } from "../trendSnapshotService.js";

// --- Mock fns ---

const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockGet = vi.fn();
const mockCollectionGet = vi.fn();

// --- Mock Firestore admin SDK ---

vi.mock("../../shared/db.js", () => ({
    db: {
        collection: () => ({
            where: (...args: unknown[]) => {
                mockWhere(...args);
                return {
                    orderBy: (...oArgs: unknown[]) => {
                        mockOrderBy(...oArgs);
                        return { get: mockGet };
                    },
                };
            },
            get: mockCollectionGet,
        }),
    },
}));

// --- Mock shared algorithm ---

vi.mock("../../shared/viewDeltas.js", async () => {
    const actual = await vi.importActual<typeof import("../../shared/viewDeltas.js")>(
        "../../shared/viewDeltas.js",
    );
    return actual;
});

beforeEach(() => {
    vi.clearAllMocks();
});

// =============================================================================
// getTrendSnapshots
// =============================================================================

describe("getTrendSnapshots", () => {
    it("reads snapshots ordered by timestamp desc", async () => {
        mockGet.mockResolvedValue({
            docs: [
                { data: () => ({ timestamp: 2000, videoViews: { v1: 100 } }) },
                { data: () => ({ timestamp: 1000, videoViews: { v1: 50 } }) },
            ],
        });

        const result = await getTrendSnapshots("u1", "ch1", "tc1", 35);

        expect(mockWhere).toHaveBeenCalledWith("timestamp", ">=", expect.any(Number));
        expect(mockOrderBy).toHaveBeenCalledWith("timestamp", "desc");
        expect(result).toEqual([
            { timestamp: 2000, videoViews: { v1: 100 } },
            { timestamp: 1000, videoViews: { v1: 50 } },
        ]);
    });

    it("returns empty array when no snapshots exist", async () => {
        mockGet.mockResolvedValue({ docs: [] });

        const result = await getTrendSnapshots("u1", "ch1", "tc1");

        expect(result).toEqual([]);
    });

    it("handles missing videoViews gracefully", async () => {
        mockGet.mockResolvedValue({
            docs: [{ data: () => ({ timestamp: 1000 }) }],
        });

        const result = await getTrendSnapshots("u1", "ch1", "tc1");

        expect(result).toEqual([{ timestamp: 1000, videoViews: {} }]);
    });
});

// =============================================================================
// getViewDeltas
// =============================================================================

describe("getViewDeltas", () => {
    it("returns empty map for empty videoIds", async () => {
        const result = await getViewDeltas("u1", "ch1", []);
        expect(result.size).toBe(0);
    });

    it("returns empty map when no trendChannels exist", async () => {
        mockCollectionGet.mockResolvedValue({ empty: true, docs: [] });

        const result = await getViewDeltas("u1", "ch1", ["video1"]);
        expect(result.size).toBe(0);
    });

    it("computes deltas from snapshots", async () => {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;

        // Step 1: getViewDeltas reads trendChannels
        mockCollectionGet.mockResolvedValue({
            empty: false,
            docs: [{ id: "tc1" }],
        });

        // Step 2: getTrendSnapshots reads snapshots
        mockGet.mockResolvedValue({
            docs: [
                {
                    data: () => ({
                        timestamp: now,
                        videoViews: { v1: 1000 },
                    }),
                },
                {
                    data: () => ({
                        timestamp: now - 2 * dayMs,
                        videoViews: { v1: 800 },
                    }),
                },
            ],
        });

        const result = await getViewDeltas("u1", "ch1", ["v1"]);

        expect(result.has("v1")).toBe(true);
        const stats = result.get("v1")!;
        expect(stats.delta24h).toBe(200); // 1000 - 800
        expect(stats.currentViews).toBe(1000);
    });

    it("filters by channelIdHints", async () => {
        mockCollectionGet.mockResolvedValue({
            empty: false,
            docs: [{ id: "tc1" }, { id: "tc2" }, { id: "tc3" }],
        });

        mockGet.mockResolvedValue({ docs: [] });

        await getViewDeltas("u1", "ch1", ["v1"], new Set(["tc2"]));

        // Should only query snapshots for tc2, not tc1 or tc3
        // mockGet is called once per relevant trendChannel
        expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it("returns empty map when hints match no trendChannels", async () => {
        mockCollectionGet.mockResolvedValue({
            empty: false,
            docs: [{ id: "tc1" }],
        });

        const result = await getViewDeltas(
            "u1", "ch1", ["v1"],
            new Set(["nonexistent"]),
        );
        expect(result.size).toBe(0);
        expect(mockGet).not.toHaveBeenCalled();
    });

    it("handles Firestore error gracefully (returns empty map)", async () => {
        mockCollectionGet.mockResolvedValue({
            empty: false,
            docs: [{ id: "tc1" }],
        });

        mockGet.mockRejectedValue(new Error("Firestore error"));

        const result = await getViewDeltas("u1", "ch1", ["v1"]);
        expect(result.size).toBe(0);
    });

    it("merges results from multiple trendChannels (first wins)", async () => {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;

        mockCollectionGet.mockResolvedValue({
            empty: false,
            docs: [{ id: "tc1" }, { id: "tc2" }],
        });

        // First call (tc1): has v1
        // Second call (tc2): also has v1 with different views
        let callCount = 0;
        mockGet.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({
                    docs: [
                        { data: () => ({ timestamp: now, videoViews: { v1: 500 } }) },
                        { data: () => ({ timestamp: now - 2 * dayMs, videoViews: { v1: 400 } }) },
                    ],
                });
            }
            return Promise.resolve({
                docs: [
                    { data: () => ({ timestamp: now, videoViews: { v1: 9999 } }) },
                    { data: () => ({ timestamp: now - 2 * dayMs, videoViews: { v1: 9000 } }) },
                ],
            });
        });

        const result = await getViewDeltas("u1", "ch1", ["v1"]);
        const stats = result.get("v1")!;
        // First channel wins — 500, not 9999
        expect(stats.currentViews).toBe(500);
        expect(stats.delta24h).toBe(100);
    });
});

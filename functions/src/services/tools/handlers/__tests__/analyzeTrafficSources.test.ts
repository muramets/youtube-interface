import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../types.js";

// --- Mocks ---

const mockDoc = vi.fn();
const mockGet = vi.fn();
const mockDownload = vi.fn();
const mockFile = vi.fn(() => ({ download: mockDownload }));
const mockBucket = vi.fn(() => ({ file: mockFile }));

vi.mock("../../../../shared/db.js", () => ({
    db: {
        doc: (path: string) => {
            mockDoc(path);
            return { get: mockGet, path };
        },
    },
    admin: {
        storage: () => ({ bucket: mockBucket }),
    },
}));

import { handleAnalyzeTrafficSources } from "../analyzeTrafficSources.js";

const CTX: ToolContext = { userId: "user1", channelId: "ch1" };
const BASE = "users/user1/channels/ch1";

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

const CSV_HEADER = "Traffic source,Views,Watch time (hours),Average view duration,Impressions,Impressions click-through rate (%)";

function csvContent(rows: string[]): string {
    return [CSV_HEADER, ...rows].join("\n");
}

describe("handleAnalyzeTrafficSources", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns error when videoId is missing", async () => {
        const result = await handleAnalyzeTrafficSources({}, CTX);
        expect(result.error).toContain("videoId is required");
    });

    it("returns error when videoId format is invalid", async () => {
        const result = await handleAnalyzeTrafficSources({ videoId: "a".repeat(100) }, CTX);
        expect(result.error).toContain("Invalid videoId");
    });

    it("returns error when no traffic source data exists", async () => {
        mockGet
            .mockResolvedValueOnce(makeSnap(false)) // trafficSource/main
            .mockResolvedValueOnce(makeSnap(false)); // video doc

        const result = await handleAnalyzeTrafficSources({ videoId: "vid1" }, CTX);
        expect(result.error).toContain("No traffic source data");
    });

    it("returns error when snapshots array is empty", async () => {
        mockGet
            .mockResolvedValueOnce(makeSnap(true, { snapshots: [] }))
            .mockResolvedValueOnce(makeSnap(false));

        const result = await handleAnalyzeTrafficSources({ videoId: "vid1" }, CTX);
        expect(result.error).toContain("No CSV snapshots");
    });

    it("parses snapshots and returns structured result", async () => {
        const snap1Csv = csvContent([
            "Total,1000,50.0,0:03:00,5000,5.0",
            "Suggested videos,600,30.0,0:03:00,3000,4.5",
            "Browse features,400,20.0,0:03:00,2000,5.5",
        ]);
        const snap2Csv = csvContent([
            "Total,1200,60.0,0:03:10,5500,5.2",
            "Suggested videos,750,38.0,0:03:05,3500,4.8",
            "Browse features,450,22.0,0:03:15,2000,5.2",
        ]);

        // Firestore: trafficSource/main then video doc
        mockGet
            .mockResolvedValueOnce(makeSnap(true, {
                snapshots: [
                    { id: "s1", timestamp: 1704067200000, storagePath: "path/s1.csv", autoLabel: "Day 1" },
                    { id: "s2", timestamp: 1704672000000, storagePath: "path/s2.csv", autoLabel: "Day 7" },
                ],
            }))
            .mockResolvedValueOnce(makeSnap(true, { title: "My Video" }));

        // Storage downloads
        mockDownload
            .mockResolvedValueOnce([Buffer.from(snap1Csv)])
            .mockResolvedValueOnce([Buffer.from(snap2Csv)]);

        const result = await handleAnalyzeTrafficSources({ videoId: "vid1" }, CTX);

        // Check basic structure
        expect(result.error).toBeUndefined();
        expect(result.sourceVideo).toEqual({ videoId: "vid1", title: "My Video" });

        // Snapshot timeline
        const timeline = result.snapshotTimeline as Array<{ date: string; totalSources: number }>;
        expect(timeline).toHaveLength(2);
        expect(timeline[0].totalSources).toBe(2);

        // Sources with timelines
        const sources = result.sources as Array<{ source: string; views: number; timeline: Array<{ deltaViews: number | null }> }>;
        expect(sources).toHaveLength(2);

        // Sources sorted by views desc → Suggested first
        expect(sources[0].source).toBe("Suggested videos");
        expect(sources[0].views).toBe(750);
        expect(sources[0].timeline).toHaveLength(2);
        expect(sources[0].timeline[0].deltaViews).toBeNull(); // first snapshot
        expect(sources[0].timeline[1].deltaViews).toBe(150); // 750 - 600

        // Total timeline
        const totals = result.totalTimeline as Array<{ views: number; deltaViews: number | null }>;
        expect(totals).toHaveLength(2);
        expect(totals[1].deltaViews).toBe(200); // 1200 - 1000
    });

    it("handles broken CSV gracefully (empty metrics)", async () => {
        mockGet
            .mockResolvedValueOnce(makeSnap(true, {
                snapshots: [
                    { id: "s1", timestamp: 1704067200000, storagePath: "path/s1.csv", autoLabel: "v1" },
                ],
            }))
            .mockResolvedValueOnce(makeSnap(false));

        // Broken CSV
        mockDownload.mockResolvedValueOnce([Buffer.from("garbage,data\nfoo,bar")]);

        const result = await handleAnalyzeTrafficSources({ videoId: "vid1" }, CTX);
        expect(result.error).toBeUndefined();
        expect((result.sources as unknown[]).length).toBe(0);
    });

    it("handles CSV download failure gracefully", async () => {
        mockGet
            .mockResolvedValueOnce(makeSnap(true, {
                snapshots: [
                    { id: "s1", timestamp: 1704067200000, storagePath: "path/missing.csv", autoLabel: "v1" },
                ],
            }))
            .mockResolvedValueOnce(makeSnap(false));

        mockDownload.mockRejectedValueOnce(new Error("File not found"));

        const result = await handleAnalyzeTrafficSources({ videoId: "vid1" }, CTX);
        // Should not throw, just return empty sources
        expect(result.error).toBeUndefined();
    });

    it("uses correct Firestore path (trafficSource/main, NOT traffic/main)", async () => {
        mockGet
            .mockResolvedValueOnce(makeSnap(false))
            .mockResolvedValueOnce(makeSnap(false));

        await handleAnalyzeTrafficSources({ videoId: "vid1" }, CTX);

        // First call = trafficSource/main
        expect(mockDoc).toHaveBeenCalledWith(`${BASE}/videos/vid1/trafficSource/main`);
        // Second call = video doc
        expect(mockDoc).toHaveBeenCalledWith(`${BASE}/videos/vid1`);
    });

    it("reports progress via ctx.reportProgress", async () => {
        const progress = vi.fn();
        const ctxWithProgress: ToolContext = { ...CTX, reportProgress: progress };

        mockGet
            .mockResolvedValueOnce(makeSnap(true, {
                snapshots: [
                    { id: "s1", timestamp: 1704067200000, storagePath: "path/s1.csv", autoLabel: "v1" },
                ],
            }))
            .mockResolvedValueOnce(makeSnap(false));

        mockDownload.mockResolvedValueOnce([Buffer.from(csvContent([
            "Suggested videos,100,5.0,0:02:00,500,4.0",
        ]))]);

        await handleAnalyzeTrafficSources({ videoId: "vid1" }, ctxWithProgress);

        expect(progress).toHaveBeenCalledWith("Downloading traffic source snapshots...");
        expect(progress).toHaveBeenCalledWith("Building source timelines...");
    });
});

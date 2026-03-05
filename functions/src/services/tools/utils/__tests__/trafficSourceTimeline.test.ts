import { describe, it, expect } from "vitest";
import { buildSourceTimeline } from "../trafficSourceTimeline.js";
import type { TrafficSourceMetric } from "../trafficSourceCsvParser.js";

function metric(source: string, views: number, impressions: number, ctr = 0, watchTimeHours = 0, avgViewDuration = "0:00:00"): TrafficSourceMetric {
    return { source, views, impressions, ctr, watchTimeHours, avgViewDuration };
}

function total(views: number, impressions: number, ctr = 0, watchTimeHours = 0): TrafficSourceMetric {
    return metric("Total", views, impressions, ctr, watchTimeHours);
}

describe("buildSourceTimeline", () => {
    it("builds timelines for multiple sources across snapshots", () => {
        const snap1 = [metric("Suggested videos", 100, 500), metric("Browse features", 50, 200)];
        const snap2 = [metric("Suggested videos", 180, 700), metric("Browse features", 80, 350)];

        const result = buildSourceTimeline(
            [snap1, snap2],
            [null, null],
            ["2024-01-01", "2024-01-08"],
            ["v1", "v2"],
        );

        expect(result.sources).toHaveLength(2);

        const suggested = result.sources.find(s => s.source === "Suggested videos")!;
        expect(suggested.views).toBe(180); // latest
        expect(suggested.impressions).toBe(700);
        expect(suggested.timeline).toHaveLength(2);
        expect(suggested.timeline[0].deltaViews).toBeNull(); // first appearance
        expect(suggested.timeline[1].deltaViews).toBe(80); // 180 - 100
        expect(suggested.timeline[1].deltaImpressions).toBe(200); // 700 - 500

        const browse = result.sources.find(s => s.source === "Browse features")!;
        expect(browse.timeline[1].deltaViews).toBe(30); // 80 - 50
    });

    it("handles source appearing in later snapshot (new source)", () => {
        const snap1 = [metric("Suggested videos", 100, 500)];
        const snap2 = [metric("Suggested videos", 150, 600), metric("External", 20, 40)];

        const result = buildSourceTimeline(
            [snap1, snap2],
            [null, null],
            ["2024-01-01", "2024-01-08"],
            ["v1", "v2"],
        );

        const external = result.sources.find(s => s.source === "External")!;
        expect(external.timeline).toHaveLength(1);
        expect(external.timeline[0].deltaViews).toBeNull(); // first appearance
        expect(external.views).toBe(20);
    });

    it("handles source disappearing then reappearing (gap)", () => {
        const snap1 = [metric("Search", 100, 500)];
        const snap2: TrafficSourceMetric[] = []; // Search disappeared
        const snap3 = [metric("Search", 200, 800)];

        const result = buildSourceTimeline(
            [snap1, snap2, snap3],
            [null, null, null],
            ["2024-01-01", "2024-01-08", "2024-01-15"],
            ["v1", "v2", "v3"],
        );

        const search = result.sources.find(s => s.source === "Search")!;
        expect(search.timeline).toHaveLength(2); // present in snap1 and snap3 only
        expect(search.timeline[0].deltaViews).toBeNull(); // first
        expect(search.timeline[1].deltaViews).toBe(100); // 200 - 100 (skips gap)
        expect(search.timeline[1].date).toBe("2024-01-15");
    });

    it("single snapshot → all deltas are null", () => {
        const snap1 = [metric("Browse", 100, 500), metric("Suggested", 200, 800)];

        const result = buildSourceTimeline(
            [snap1],
            [total(300, 1300)],
            ["2024-01-01"],
            ["v1"],
        );

        expect(result.sources).toHaveLength(2);
        for (const s of result.sources) {
            expect(s.timeline).toHaveLength(1);
            expect(s.timeline[0].deltaViews).toBeNull();
            expect(s.timeline[0].deltaImpressions).toBeNull();
        }
    });

    it("builds totalTimeline with deltas", () => {
        const result = buildSourceTimeline(
            [[], []],
            [total(1000, 5000, 5.0, 50), total(1200, 5500, 4.8, 55)],
            ["2024-01-01", "2024-01-08"],
            ["v1", "v2"],
        );

        expect(result.totalTimeline).toHaveLength(2);
        expect(result.totalTimeline[0].deltaViews).toBeNull();
        expect(result.totalTimeline[1].deltaViews).toBe(200);
        expect(result.totalTimeline[1].deltaImpressions).toBe(500);
        expect(result.totalTimeline[1].views).toBe(1200);
    });

    it("skips null totals in totalTimeline", () => {
        const result = buildSourceTimeline(
            [[], [], []],
            [total(100, 500), null, total(200, 700)],
            ["2024-01-01", "2024-01-08", "2024-01-15"],
            ["v1", "v2", "v3"],
        );

        expect(result.totalTimeline).toHaveLength(2);
        expect(result.totalTimeline[0].date).toBe("2024-01-01");
        expect(result.totalTimeline[1].date).toBe("2024-01-15");
        expect(result.totalTimeline[1].deltaViews).toBe(100); // 200 - 100
    });

    it("returns empty for empty input", () => {
        const result = buildSourceTimeline([], [], [], []);
        expect(result.sources).toHaveLength(0);
        expect(result.totalTimeline).toHaveLength(0);
    });

    it("preserves avgViewDuration and ctr in timeline points", () => {
        const snap = [metric("Browse", 100, 500, 4.5, 10.2, "0:03:15")];

        const result = buildSourceTimeline([snap], [null], ["2024-01-01"], ["v1"]);

        const point = result.sources[0].timeline[0];
        expect(point.ctr).toBe(4.5);
        expect(point.watchTimeHours).toBe(10.2);
        expect(point.avgViewDuration).toBe("0:03:15");
    });
});

import { describe, it, expect } from "vitest";
import { parseTrafficSourceCsv } from "../trafficSourceCsvParser.js";

// Real YouTube Analytics "Traffic Source" CSV header
const HEADER = "Traffic source,Views,Watch time (hours),Average view duration,Impressions,Impressions click-through rate (%)";

function csv(lines: string[]): string {
    return [HEADER, ...lines].join("\n");
}

describe("parseTrafficSourceCsv", () => {
    it("parses standard CSV with Total and data rows", () => {
        const input = csv([
            "Total,1000,50.5,0:03:02,5000,5.2",
            "Suggested videos,600,30.0,0:03:00,3000,4.5",
            "Browse features,300,15.0,0:03:10,1500,6.0",
            "YouTube search,100,5.5,0:02:50,500,3.1",
        ]);

        const result = parseTrafficSourceCsv(input);

        expect(result.totalRow).toEqual({
            source: "Total",
            views: 1000,
            watchTimeHours: 50.5,
            avgViewDuration: "0:03:02",
            impressions: 5000,
            ctr: 5.2,
        });

        expect(result.metrics).toHaveLength(3);
        expect(result.metrics[0].source).toBe("Suggested videos");
        expect(result.metrics[0].views).toBe(600);
        expect(result.metrics[0].impressions).toBe(3000);
        expect(result.metrics[0].ctr).toBe(4.5);
        expect(result.metrics[1].source).toBe("Browse features");
        expect(result.metrics[2].source).toBe("YouTube search");
    });

    it("handles missing Total row", () => {
        const input = csv([
            "Suggested videos,600,30.0,0:03:00,3000,4.5",
            "Browse features,300,15.0,0:03:10,1500,6.0",
        ]);

        const result = parseTrafficSourceCsv(input);
        expect(result.totalRow).toBeNull();
        expect(result.metrics).toHaveLength(2);
    });

    it("returns empty for header-only CSV", () => {
        const result = parseTrafficSourceCsv(HEADER);
        expect(result.metrics).toHaveLength(0);
        expect(result.totalRow).toBeNull();
    });

    it("returns empty for empty string", () => {
        const result = parseTrafficSourceCsv("");
        expect(result.metrics).toHaveLength(0);
        expect(result.totalRow).toBeNull();
    });

    it("handles quoted source names with commas", () => {
        const input = csv([
            '"Suggested videos, including shorts",600,30.0,0:03:00,3000,4.5',
        ]);

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics[0].source).toBe("Suggested videos, including shorts");
    });

    it("handles \r\n line endings", () => {
        const input = `${HEADER}\r\nSuggested videos,600,30.0,0:03:00,3000,4.5\r\nBrowse features,300,15.0,0:03:10,1500,6.0`;

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics).toHaveLength(2);
    });

    it("skips empty lines", () => {
        const input = csv([
            "Suggested videos,600,30.0,0:03:00,3000,4.5",
            "",
            "",
            "Browse features,300,15.0,0:03:10,1500,6.0",
        ]);

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics).toHaveLength(2);
    });

    it("handles zero values correctly", () => {
        const input = csv([
            "External,0,0,0:00:00,0,0",
        ]);

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics[0]).toEqual({
            source: "External",
            views: 0,
            watchTimeHours: 0,
            avgViewDuration: "0:00:00",
            impressions: 0,
            ctr: 0,
        });
    });

    it("handles Russian headers", () => {
        const ruHeader = "Источник трафика,Просмотры,Время просмотра,Средняя длительность просмотра,Показы,Показатель кликабельности показов";
        const input = [ruHeader, "Suggested videos,600,30.0,0:03:00,3000,4.5"].join("\n");

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics).toHaveLength(1);
        expect(result.metrics[0].source).toBe("Suggested videos");
    });

    it("handles missing columns gracefully (returns empty)", () => {
        const badHeader = "Something,Other";
        const input = [badHeader, "Foo,Bar"].join("\n");

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics).toHaveLength(0);
    });

    it("handles escaped quotes in fields", () => {
        const input = csv([
            '"Source with ""quotes""",100,5.0,0:02:00,500,2.0',
        ]);

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics[0].source).toBe('Source with "quotes"');
    });

    it("sorts are not applied (caller responsibility)", () => {
        const input = csv([
            "YouTube search,100,5.0,0:02:00,500,2.0",
            "Suggested videos,600,30.0,0:03:00,3000,4.5",
            "Browse features,300,15.0,0:03:10,1500,6.0",
        ]);

        const result = parseTrafficSourceCsv(input);
        expect(result.metrics[0].source).toBe("YouTube search");
        expect(result.metrics[1].source).toBe("Suggested videos");
        expect(result.metrics[2].source).toBe("Browse features");
    });
});

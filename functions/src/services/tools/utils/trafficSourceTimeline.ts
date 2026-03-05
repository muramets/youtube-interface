// =============================================================================
// Traffic Source Timeline Builder
//
// Pure function: takes parsed snapshots and builds per-source trajectories
// with pre-computed deltas between consecutive snapshots.
//
// Input:  array of snapshots, each containing TrafficSourceMetric[]
// Output: per-source timelines + total timeline
// =============================================================================

import type { TrafficSourceMetric } from "./trafficSourceCsvParser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceTimelinePoint {
    date: string;
    label: string;
    views: number;
    impressions: number;
    ctr: number;
    watchTimeHours: number;
    avgViewDuration: string;
    /** Absolute delta vs previous snapshot. null = first appearance or single snapshot. */
    deltaViews: number | null;
    deltaImpressions: number | null;
}

export interface SourceTimeline {
    /** Traffic source name (e.g. "Suggested videos", "Browse features") */
    source: string;
    /** Latest snapshot values */
    views: number;
    impressions: number;
    ctr: number;
    watchTimeHours: number;
    avgViewDuration: string;
    /** Per-snapshot trajectory with deltas */
    timeline: SourceTimelinePoint[];
}

export interface TotalTimelinePoint {
    date: string;
    label: string;
    views: number;
    impressions: number;
    ctr: number;
    watchTimeHours: number;
    deltaViews: number | null;
    deltaImpressions: number | null;
}

export interface BuildSourceTimelineResult {
    sources: SourceTimeline[];
    totalTimeline: TotalTimelinePoint[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Build per-source trajectories from an array of parsed CSV snapshots.
 *
 * For each unique source name across all snapshots:
 *   - Builds a timeline with one entry per snapshot where the source exists
 *   - Pre-computes deltaViews/deltaImpressions vs the previous snapshot
 *     where that source was present (gaps are skipped)
 *   - First appearance → deltas are null
 *
 * Also builds totalTimeline from the Total rows (same delta logic).
 */
export function buildSourceTimeline(
    snapshotMetrics: TrafficSourceMetric[][],
    snapshotTotals: (TrafficSourceMetric | null)[],
    dates: string[],
    labels: string[],
): BuildSourceTimelineResult {
    // --- Per-source timelines ---

    // Accumulate timeline points per source name.
    // Key = source name, Value = array of timeline points (in snapshot order).
    const sourceMap = new Map<string, SourceTimelinePoint[]>();

    // Track previous values per source for delta computation.
    // Key = source name, Value = { views, impressions } from last seen snapshot.
    const prevValues = new Map<string, { views: number; impressions: number }>();

    for (let i = 0; i < snapshotMetrics.length; i++) {
        const metrics = snapshotMetrics[i];
        const date = dates[i];
        const label = labels[i];

        for (const m of metrics) {
            const prev = prevValues.get(m.source);

            const point: SourceTimelinePoint = {
                date,
                label,
                views: m.views,
                impressions: m.impressions,
                ctr: m.ctr,
                watchTimeHours: m.watchTimeHours,
                avgViewDuration: m.avgViewDuration,
                deltaViews: prev ? m.views - prev.views : null,
                deltaImpressions: prev ? m.impressions - prev.impressions : null,
            };

            if (!sourceMap.has(m.source)) {
                sourceMap.set(m.source, []);
            }
            sourceMap.get(m.source)!.push(point);

            // Update previous values for next delta
            prevValues.set(m.source, { views: m.views, impressions: m.impressions });
        }
    }

    // Convert map to SourceTimeline[] with latest values
    const sources: SourceTimeline[] = [];
    for (const [source, timeline] of sourceMap) {
        const latest = timeline[timeline.length - 1];
        sources.push({
            source,
            views: latest.views,
            impressions: latest.impressions,
            ctr: latest.ctr,
            watchTimeHours: latest.watchTimeHours,
            avgViewDuration: latest.avgViewDuration,
            timeline,
        });
    }

    // --- Total timeline ---

    const totalTimeline: TotalTimelinePoint[] = [];
    let prevTotal: { views: number; impressions: number } | null = null;

    for (let i = 0; i < snapshotTotals.length; i++) {
        const total = snapshotTotals[i];
        if (!total) continue;

        totalTimeline.push({
            date: dates[i],
            label: labels[i],
            views: total.views,
            impressions: total.impressions,
            ctr: total.ctr,
            watchTimeHours: total.watchTimeHours,
            deltaViews: prevTotal ? total.views - prevTotal.views : null,
            deltaImpressions: prevTotal ? total.impressions - prevTotal.impressions : null,
        });

        prevTotal = { views: total.views, impressions: total.impressions };
    }

    return { sources, totalTimeline };
}

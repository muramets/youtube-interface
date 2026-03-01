// =============================================================================
// Traffic Source Delta Calculator
//
// Pure function: computes absolute and percentage deltas between two snapshots.
// No hooks, no async, no side effects — fully unit-testable.
//
// Extracted from useTrafficSourceDataLoader for separation of concerns:
// - Loader: I/O (Cloud Storage → parse)
// - Calculator: Computation (delta, % change)
// =============================================================================

import type { TrafficSourceMetric } from '../../../../../core/types/trafficSource';

/**
 * Extended metric with delta values for UI display.
 */
export interface TrafficSourceDeltaMetric extends TrafficSourceMetric {
    /** Absolute change: current − previous */
    deltaViews?: number;
    deltaImpressions?: number;
    deltaCtr?: number;
    deltaWatchTimeHours?: number;
    /** Percentage change: ((current − previous) / previous) × 100 */
    pctViews?: number;
    pctImpressions?: number;
    pctCtr?: number;
    pctWatchTimeHours?: number;
}

/**
 * Calculate percentage change, handling division by zero.
 * Returns undefined if previous is 0 (avoiding Infinity).
 */
function pctChange(current: number, previous: number): number | undefined {
    if (previous === 0) return current > 0 ? undefined : 0; // Infinity → undefined
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10; // 1 decimal
}

/**
 * Compute deltas between current and previous snapshot metrics.
 *
 * @param current  — metrics from the selected snapshot
 * @param previous — metrics from the previous snapshot (by timestamp)
 * @returns metrics enriched with delta and percentage fields
 *
 * @example
 * ```ts
 * const result = calculateDelta(currentMetrics, prevMetrics);
 * // result[0].deltaViews = 180, result[0].pctViews = 500
 * ```
 */
export function calculateDelta(
    current: TrafficSourceMetric[],
    previous: TrafficSourceMetric[]
): TrafficSourceDeltaMetric[] {
    const prevMap = new Map(previous.map(m => [m.source, m]));

    return current.map(metric => {
        const prev = prevMap.get(metric.source);
        if (!prev) return metric; // New source — no delta possible

        return {
            ...metric,
            deltaViews: metric.views - prev.views,
            deltaImpressions: metric.impressions - prev.impressions,
            deltaCtr: Math.round((metric.ctr - prev.ctr) * 100) / 100,
            deltaWatchTimeHours: Math.round((metric.watchTimeHours - prev.watchTimeHours) * 100) / 100,
            pctViews: pctChange(metric.views, prev.views),
            pctImpressions: pctChange(metric.impressions, prev.impressions),
            pctCtr: pctChange(metric.ctr, prev.ctr),
            pctWatchTimeHours: pctChange(metric.watchTimeHours, prev.watchTimeHours),
        };
    });
}

/**
 * Compute delta for a Total Row.
 */
export function calculateTotalDelta(
    current: TrafficSourceMetric,
    previous: TrafficSourceMetric
): TrafficSourceDeltaMetric {
    return {
        ...current,
        deltaViews: current.views - previous.views,
        deltaImpressions: current.impressions - previous.impressions,
        deltaCtr: Math.round((current.ctr - previous.ctr) * 100) / 100,
        deltaWatchTimeHours: Math.round((current.watchTimeHours - previous.watchTimeHours) * 100) / 100,
        pctViews: pctChange(current.views, previous.views),
        pctImpressions: pctChange(current.impressions, previous.impressions),
        pctCtr: pctChange(current.ctr, previous.ctr),
        pctWatchTimeHours: pctChange(current.watchTimeHours, previous.watchTimeHours),
    };
}

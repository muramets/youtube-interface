// =============================================================================
// formatTrafficSources — Pure formatter for Traffic Sources context
//
// Receives all snapshot data (already loaded + parsed) and produces a
// compact text summary: baseline (first snapshot) + deltas for subsequent ones.
// Reuses calculateDelta() from core/utils/trafficSourceDelta.ts.
//
// Output example:
//   Traffic Sources (3 snapshots):
//     13h: Suggested 684i/22v/2.3% | Browse 200i/8v/4.0%
//     Δ 3d: Suggested +1.2Ki/+48v | Browse +500i/+20v
//     Δ 7d: Suggested +3.5Ki/+102v | Browse +800i/+31v
// =============================================================================

import type { TrafficSourceMetric, SnapshotWithMetrics } from '../../types/trafficSource';
import { calculateDelta } from '../../utils/trafficSource/delta';
import type { TrafficSourceDeltaMetric } from '../../utils/trafficSource/delta';

/**
 * Format all Traffic Sources snapshots into a compact text block for AI context.
 *
 * @param snapshots - Sorted oldest → newest, each with parsed metrics
 * @returns Compact multi-line string, or empty string if no data
 */
export function formatTrafficSourcesCompact(snapshots: SnapshotWithMetrics[]): string {
    if (snapshots.length === 0) return '';

    const lines: string[] = [`Traffic Sources (${snapshots.length} snapshot${snapshots.length > 1 ? 's' : ''}):`];

    // First snapshot = baseline (absolute values)
    const baseline = snapshots[0];
    const baselineLabel = baseline.snapshot.label ?? baseline.snapshot.autoLabel;
    lines.push(`  ${baselineLabel}: ${formatMetricsLine(baseline.metrics)}`);

    // Subsequent snapshots = delta from previous
    for (let i = 1; i < snapshots.length; i++) {
        const current = snapshots[i];
        const previous = snapshots[i - 1];
        const label = current.snapshot.label ?? current.snapshot.autoLabel;

        const deltas = calculateDelta(current.metrics, previous.metrics);
        lines.push(`  Δ ${label}: ${formatDeltaLine(deltas)}`);
    }

    return lines.join('\n');
}

/** Format absolute metrics for one snapshot (baseline) */
function formatMetricsLine(metrics: TrafficSourceMetric[]): string {
    // Sort by views desc to show most important sources first, take top 5
    const sorted = [...metrics].sort((a, b) => b.views - a.views).slice(0, 5);

    return sorted
        .map(m => `${shortenSource(m.source)} ${formatCompact(m.impressions)}i/${formatCompact(m.views)}v/${m.ctr.toFixed(1)}%/${m.avgViewDuration}`)
        .join(' | ');
}

/** Format delta metrics for subsequent snapshots */
function formatDeltaLine(deltas: TrafficSourceDeltaMetric[]): string {
    // Sort by absolute deltaViews desc, skip sources with no delta, take top 5
    const sorted = [...deltas]
        .filter(d => d.deltaViews !== undefined && d.deltaViews !== 0)
        .sort((a, b) => Math.abs(b.deltaViews ?? 0) - Math.abs(a.deltaViews ?? 0))
        .slice(0, 5);

    if (sorted.length === 0) return '(no changes)';

    return sorted
        .map(d => `${shortenSource(d.source)} ${formatDeltaValue(d.deltaImpressions ?? 0)}i/${formatDeltaValue(d.deltaViews ?? 0)}v/${d.ctr.toFixed(1)}%/${d.avgViewDuration}`)
        .join(' | ');
}

/** Shorten common YouTube traffic source names */
function shortenSource(source: string): string {
    const map: Record<string, string> = {
        'Suggested videos': 'Suggested',
        'Browse features': 'Browse',
        'YouTube search': 'Search',
        'Channel pages': 'Channel',
        'External': 'External',
        'Notification': 'Notif',
        'Notifications': 'Notif',
        'Direct or unknown': 'Direct',
        'End screens': 'EndScreen',
        'Playlist pages': 'Playlist',
        'YouTube Shorts feed': 'Shorts',
    };
    return map[source] ?? source;
}

/** Compact number: 1200 → "1.2K", 1500000 → "1.5M" */
function formatCompact(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

/** Delta value with sign: +1200 → "+1.2K", -300 → "-300" */
function formatDeltaValue(n: number): string {
    const sign = n >= 0 ? '+' : '';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(n / 1_000).toFixed(1)}K`;
    return `${sign}${n}`;
}

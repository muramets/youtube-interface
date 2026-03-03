// =============================================================================
// Suggested Traffic Delta Calculator
//
// Pure functions: compare two consecutive snapshot row arrays to compute
// absolute and percentage deltas, and identify new/dropped videos.
//
// No Firebase, no async, no side effects — fully unit-testable.
// =============================================================================

export interface VideoSnapshotEntry {
    videoId: string;
    sourceTitle: string;
    views: number;
    impressions: number;
    ctr: number | null;
    watchTimeHours: number;
}

export interface VideoDelta {
    videoId: string;
    sourceTitle: string;
    // Latest absolute values
    views: number;
    impressions: number;
    ctr: number | null;
    watchTimeHours: number;
    // Absolute deltas (latest − previous)
    deltaViews: number;
    deltaImpressions: number;
    deltaCtr: number | null;
    deltaWatchTimeHours: number;
    // Percentage change: null if previous value was 0 (avoids Infinity)
    pctViews: number | null;
    pctImpressions: number | null;
}

/**
 * Calculate percentage change, rounded to 1 decimal place.
 * Returns null when the base is 0 to avoid Infinity.
 */
function pctChange(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * Compare the latest snapshot against the previous one.
 *
 * Returns a Map<videoId, VideoDelta> for every video present in BOTH snapshots.
 * Videos only in `latest` are newEntries (use findNewEntries).
 * Videos only in `previous` are droppedEntries (use findDroppedEntries).
 *
 * @param latest   - rows from the most recent snapshot
 * @param previous - rows from the snapshot immediately before latest
 */
export function calculateSnapshotDeltas(
    latest: VideoSnapshotEntry[],
    previous: VideoSnapshotEntry[],
): Map<string, VideoDelta> {
    const prevMap = new Map(previous.map(e => [e.videoId, e]));
    const result = new Map<string, VideoDelta>();

    for (const entry of latest) {
        const prev = prevMap.get(entry.videoId);
        if (!prev) continue; // newEntry — not in previous, skip delta

        const deltaCtr =
            entry.ctr !== null && prev.ctr !== null
                ? Math.round((entry.ctr - prev.ctr) * 100) / 100
                : null;

        result.set(entry.videoId, {
            videoId:          entry.videoId,
            sourceTitle:      entry.sourceTitle,
            views:            entry.views,
            impressions:      entry.impressions,
            ctr:              entry.ctr,
            watchTimeHours:   entry.watchTimeHours,
            deltaViews:       entry.views - prev.views,
            deltaImpressions: entry.impressions - prev.impressions,
            deltaCtr,
            deltaWatchTimeHours: Math.round((entry.watchTimeHours - prev.watchTimeHours) * 1000) / 1000,
            pctViews:         pctChange(entry.views, prev.views),
            pctImpressions:   pctChange(entry.impressions, prev.impressions),
        });
    }

    return result;
}

/**
 * Videos present in `latest` but absent in `previous` (appeared for the first time).
 */
export function findNewEntries(
    latest: VideoSnapshotEntry[],
    previous: VideoSnapshotEntry[],
): VideoSnapshotEntry[] {
    const prevIds = new Set(previous.map(e => e.videoId));
    return latest.filter(e => !prevIds.has(e.videoId));
}

/**
 * Videos present in `previous` but absent in `latest` (no longer recommended).
 */
export function findDroppedEntries(
    latest: VideoSnapshotEntry[],
    previous: VideoSnapshotEntry[],
): VideoSnapshotEntry[] {
    const latestIds = new Set(latest.map(e => e.videoId));
    return previous.filter(e => !latestIds.has(e.videoId));
}

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
    avgViewDuration: string;
    watchTimeHours: number;
}

export interface VideoDelta {
    videoId: string;
    sourceTitle: string;
    // Latest absolute values
    views: number;
    impressions: number;
    ctr: number | null;
    avgViewDuration: string;
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
            videoId: entry.videoId,
            sourceTitle: entry.sourceTitle,
            views: entry.views,
            impressions: entry.impressions,
            ctr: entry.ctr,
            avgViewDuration: entry.avgViewDuration,
            watchTimeHours: entry.watchTimeHours,
            deltaViews: entry.views - prev.views,
            deltaImpressions: entry.impressions - prev.impressions,
            deltaCtr,
            deltaWatchTimeHours: Math.round((entry.watchTimeHours - prev.watchTimeHours) * 1000) / 1000,
            pctViews: pctChange(entry.views, prev.views),
            pctImpressions: pctChange(entry.impressions, prev.impressions),
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

// =============================================================================
// Timeline + Transitions (v2)
//
// buildVideoTimeline — per-video trajectory across ALL snapshots.
// getTransitions    — new/dropped counts + top examples per period.
// =============================================================================

export interface TimelinePoint {
    date: string;
    label: string;
    views: number;
    impressions: number;
    ctr: number | null;
    avgViewDuration: string;
    watchTimeHours: number;
    /** Delta vs previous TimelinePoint for this video. null for first appearance. */
    deltaViews: number | null;
    /** Delta vs previous TimelinePoint for this video. null for first appearance. */
    deltaImpressions: number | null;
}

export interface VideoTimeline {
    videoId: string;
    sourceTitle: string;
    /** Latest absolute values (from last snapshot where this video appears). */
    views: number;
    impressions: number;
    ctr: number | null;
    avgViewDuration: string;
    watchTimeHours: number;
    /** Trajectory across all snapshots where this video is present. */
    timeline: TimelinePoint[];
}

export interface Transition {
    periodFromDate: string;
    periodFromLabel: string;
    periodToDate: string;
    periodToLabel: string;
    newCount: number;
    droppedCount: number;
    /** How many of `newCount` were seen in ANY earlier snapshot (reappearing after absence). */
    returningCount: number;
    /** Top new sources by impressions (capped at 10). */
    topNew: VideoSnapshotEntry[];
    /** Top dropped sources by last known impressions (capped at 10). */
    topDropped: VideoSnapshotEntry[];
}

/** Max examples per transition to keep payload small. */
const TRANSITION_TOP_N = 10;

/**
 * Build per-video timeline across all snapshots.
 *
 * For each video that appears in ANY snapshot, constructs a timeline of points
 * where it was present. If a video is absent in a middle snapshot, that snapshot
 * is skipped (no null gaps). Deltas are computed against the previous PRESENT
 * point, not the previous snapshot.
 *
 * @param snapshots - Array of parsed CSV snapshots, ordered chronologically (oldest first)
 * @param dates     - Array of snapshot dates, same length and order as snapshots
 * @returns Map from videoId to VideoTimeline
 */
export function buildVideoTimeline(
    snapshots: VideoSnapshotEntry[][],
    dates: string[],
    labels?: string[],
): Map<string, VideoTimeline> {
    const result = new Map<string, VideoTimeline>();

    for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const date = dates[i];

        for (const entry of snapshot) {
            let timeline = result.get(entry.videoId);

            if (!timeline) {
                // First time we see this video — create entry
                timeline = {
                    videoId: entry.videoId,
                    sourceTitle: entry.sourceTitle,
                    views: entry.views,
                    impressions: entry.impressions,
                    ctr: entry.ctr,
                    avgViewDuration: entry.avgViewDuration,
                    watchTimeHours: entry.watchTimeHours,
                    timeline: [],
                };
                result.set(entry.videoId, timeline);
            }

            // Get previous point for delta calculation
            const prevPoint = timeline.timeline.length > 0
                ? timeline.timeline[timeline.timeline.length - 1]
                : null;

            timeline.timeline.push({
                date,
                label: labels?.[i] ?? `v${i + 1}`,
                views: entry.views,
                impressions: entry.impressions,
                ctr: entry.ctr,
                avgViewDuration: entry.avgViewDuration,
                watchTimeHours: entry.watchTimeHours,
                deltaViews: prevPoint !== null ? entry.views - prevPoint.views : null,
                deltaImpressions: prevPoint !== null ? entry.impressions - prevPoint.impressions : null,
            });

            // Update "latest" values to this snapshot's values
            timeline.views = entry.views;
            timeline.impressions = entry.impressions;
            timeline.ctr = entry.ctr;
            timeline.avgViewDuration = entry.avgViewDuration;
            timeline.watchTimeHours = entry.watchTimeHours;
        }
    }

    return result;
}

/**
 * Compute transitions (new/dropped sources) between each consecutive pair of snapshots.
 *
 * @param snapshots - Array of parsed CSV snapshots, ordered chronologically (oldest first)
 * @param dates     - Array of snapshot dates, same length and order as snapshots
 * @returns Array of Transition objects (length = snapshots.length - 1)
 */
export function getTransitions(
    snapshots: VideoSnapshotEntry[][],
    dates: string[],
    labels?: string[],
): Transition[] {
    const transitions: Transition[] = [];

    // Track all videoIds seen in snapshots 0..i-1 to detect returning videos.
    // A "returning" video is one that appears as "new" (not in snapshot[i-1])
    // but WAS present in some earlier snapshot — it dropped out and came back.
    const allPreviouslySeen = new Set<string>();
    if (snapshots.length > 0) {
        for (const entry of snapshots[0]) {
            allPreviouslySeen.add(entry.videoId);
        }
    }

    for (let i = 1; i < snapshots.length; i++) {
        const prevIds = new Set(snapshots[i - 1].map(e => e.videoId));
        const currIds = new Set(snapshots[i].map(e => e.videoId));

        const newEntries = snapshots[i].filter(e => !prevIds.has(e.videoId));
        const droppedEntries = snapshots[i - 1].filter(e => !currIds.has(e.videoId));

        // Of the "new" entries, how many were seen in any snapshot before i-1?
        const returningCount = newEntries.filter(e => allPreviouslySeen.has(e.videoId)).length;

        // Sort by impressions descending, take top N
        const topNew = [...newEntries]
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, TRANSITION_TOP_N);
        const topDropped = [...droppedEntries]
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, TRANSITION_TOP_N);

        transitions.push({
            periodFromDate: dates[i - 1],
            periodFromLabel: labels?.[i - 1] ?? `v${i}`,
            periodToDate: dates[i],
            periodToLabel: labels?.[i] ?? `v${i + 1}`,
            newCount: newEntries.length,
            droppedCount: droppedEntries.length,
            returningCount,
            topNew,
            topDropped,
        });

        // Add current snapshot's videoIds for next iterations
        for (const entry of snapshots[i]) {
            allPreviouslySeen.add(entry.videoId);
        }
    }

    return transitions;
}

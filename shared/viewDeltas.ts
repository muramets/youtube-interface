// =============================================================================
// shared/viewDeltas.ts — Pure view delta calculation algorithm
//
// Zero dependencies. Zero I/O. Zero framework imports.
// Shared between frontend (React hooks) and backend (Cloud Functions).
//
// Calculates 24h/7d/30d view growth from an array of time-series snapshots.
// =============================================================================

/** Minimal snapshot shape required by the algorithm. */
export interface ViewSnapshot {
    timestamp: number;
    videoViews: Record<string, number>;
}

/** Per-video delta stats — shared type for all consumers. */
export interface VideoDeltaStats {
    delta24h: number | null;
    delta7d: number | null;
    delta30d: number | null;
    /**
     * Latest view count from the Trend Snapshot — the same data source used for delta calculation.
     *
     * WHY THIS EXISTS (instead of using video.viewCount):
     * `video.viewCount` in Firestore is updated only on manual/auto video sync.
     * Trend snapshots are updated independently (daily cron). This creates a desync:
     * the delta shows growth from the snapshot, but the base viewCount on the card
     * is stale from the last video sync.
     *
     * By sourcing both the counter AND the delta from the same snapshot,
     * they are always mathematically consistent.
     */
    currentViews: number | null;
}

/**
 * Maximum number of snapshots to fetch for delta calculation.
 * 30 days for the longest window + 5 days buffer for sync gaps.
 * Single source of truth — all snapshot fetch calls should use this constant.
 */
export const DELTA_SNAPSHOT_DAYS = 35;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculate per-video view deltas from time-series snapshots.
 *
 * @param snapshots  Array of snapshots (any order — sorted internally)
 * @param videoIds   YouTube video IDs to compute deltas for
 * @param now        Current timestamp (defaults to Date.now(), injectable for testing)
 * @returns Map of videoId → VideoDeltaStats
 */
export function calculateViewDeltas(
    snapshots: ViewSnapshot[],
    videoIds: string[],
    now: number = Date.now(),
): Map<string, VideoDeltaStats> {
    if (snapshots.length === 0 || videoIds.length === 0) {
        return new Map();
    }

    // Sort DESC (newest first) — callers don't need to pre-sort
    const sorted = [...snapshots].sort((a, b) => b.timestamp - a.timestamp);

    const latest = sorted[0];

    // Find the first snapshot where timestamp <= targetTs (scanning newest→oldest)
    const findSnapshot = (targetTs: number): ViewSnapshot | undefined => {
        return sorted.find(s => s.timestamp <= targetTs);
    };

    const snap24h = findSnapshot(now - ONE_DAY_MS);
    const snap7d = findSnapshot(now - 7 * ONE_DAY_MS);
    const snap30d = findSnapshot(now - 30 * ONE_DAY_MS);

    const result = new Map<string, VideoDeltaStats>();

    for (const videoId of videoIds) {
        const currentViews = latest.videoViews[videoId];
        if (currentViews === undefined) continue;

        const getDelta = (snap: ViewSnapshot | undefined): number | null => {
            if (!snap) return null;
            const pastViews = snap.videoViews[videoId];
            if (pastViews === undefined) return null;
            return currentViews - pastViews;
        };

        result.set(videoId, {
            delta24h: getDelta(snap24h),
            delta7d: getDelta(snap7d),
            delta30d: getDelta(snap30d),
            currentViews,
        });
    }

    return result;
}

// =============================================================================
// shared/percentiles.ts — Pure percentile calculation algorithm
//
// Zero dependencies. Zero I/O. Zero framework imports.
// Shared between frontend (Trends UI) and backend (Cloud Functions).
//
// Assigns each video to a performance tier based on its viewCount rank
// within the channel. Groups: Top 1%, Top 5%, Top 20%, Middle 60%, Bottom 20%.
// =============================================================================

/** Available percentile groups — ordered from best to worst. */
export const PERCENTILE_GROUPS = [
    'Top 1%',
    'Top 5%',
    'Top 20%',
    'Middle 60%',
    'Bottom 20%',
] as const;

export type PercentileGroup = typeof PERCENTILE_GROUPS[number];

/** Minimal video shape required by the algorithm. */
interface VideoForPercentile {
    id: string;
    viewCount: number;
}

/**
 * Assign each video to a percentile group based on viewCount rank.
 *
 * Videos are sorted descending by viewCount, then each video's rank
 * determines its group:
 *   - index/total * 100 ≤ 1  → Top 1%
 *   - index/total * 100 ≤ 5  → Top 5%
 *   - index/total * 100 ≤ 20 → Top 20%
 *   - index/total * 100 ≤ 80 → Middle 60%
 *   - else                    → Bottom 20%
 *
 * @param videos  Array of videos with id and viewCount
 * @returns Map of videoId → PercentileGroup
 */
export function assignPercentileGroups(
    videos: VideoForPercentile[],
): Map<string, PercentileGroup> {
    const map = new Map<string, PercentileGroup>();
    if (videos.length === 0) return map;

    const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);

    sorted.forEach((v, i) => {
        const percentile = (i / videos.length) * 100;
        let group: PercentileGroup;
        if (percentile <= 1) group = 'Top 1%';
        else if (percentile <= 5) group = 'Top 5%';
        else if (percentile <= 20) group = 'Top 20%';
        else if (percentile <= 80) group = 'Middle 60%';
        else group = 'Bottom 20%';
        map.set(v.id, group);
    });

    return map;
}

/** Percentile distribution stats for a set of videos. */
export interface PercentileDistribution {
    p25: number;
    median: number;
    p75: number;
    max: number;
}

/**
 * Compute percentile distribution (p25, median, p75, max) of viewCounts.
 *
 * Uses linear interpolation for percentile values (same method as NumPy default).
 *
 * @param videos  Array of objects with viewCount
 * @returns Distribution stats, or all zeros for empty input
 */
export function getPercentileDistribution(
    videos: { viewCount: number }[],
): PercentileDistribution {
    if (videos.length === 0) {
        return { p25: 0, median: 0, p75: 0, max: 0 };
    }

    const sorted = videos.map(v => v.viewCount).sort((a, b) => a - b);
    const n = sorted.length;

    const percentileValue = (p: number): number => {
        if (n === 1) return sorted[0];
        const index = (p / 100) * (n - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return sorted[lower];
        const fraction = index - lower;
        return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
    };

    return {
        p25: percentileValue(25),
        median: percentileValue(50),
        p75: percentileValue(75),
        max: sorted[n - 1],
    };
}

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { assignPercentileGroups, getPercentileDistribution, PERCENTILE_GROUPS } from '../percentiles';
import type { PercentileGroup } from '../percentiles';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVideos(count: number): { id: string; viewCount: number }[] {
    // Creates videos with viewCount = index + 1 (1, 2, 3, ... count)
    return Array.from({ length: count }, (_, i) => ({
        id: `v${i + 1}`,
        viewCount: i + 1,
    }));
}

function countGroups(map: Map<string, PercentileGroup>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const group of map.values()) {
        counts[group] = (counts[group] || 0) + 1;
    }
    return counts;
}

// ---------------------------------------------------------------------------
// assignPercentileGroups
// ---------------------------------------------------------------------------

describe('assignPercentileGroups', () => {
    it('returns empty map for empty input', () => {
        const result = assignPercentileGroups([]);
        expect(result.size).toBe(0);
    });

    it('assigns single video to Top 1%', () => {
        // i=0, percentile = 0/1*100 = 0, ≤1 → Top 1%
        const result = assignPercentileGroups([{ id: 'only', viewCount: 42 }]);
        expect(result.get('only')).toBe('Top 1%');
    });

    it('distributes 100 videos into correct group sizes', () => {
        const videos = makeVideos(100);
        const result = assignPercentileGroups(videos);
        const counts = countGroups(result);

        // 100 videos: percentile = i/100 * 100 = i
        // i=0→0, i=1→1 (≤1) → Top 1%: 2
        // i=2,3,4,5 (≤5) → Top 5%: 4
        // i=6..20 (≤20) → Top 20%: 15
        // i=21..80 (≤80) → Middle 60%: 60
        // i=81..99 (>80) → Bottom 20%: 19
        expect(counts['Top 1%']).toBe(2);
        expect(counts['Top 5%']).toBe(4);
        expect(counts['Top 20%']).toBe(15);
        expect(counts['Middle 60%']).toBe(60);
        expect(counts['Bottom 20%']).toBe(19);
    });

    it('handles tied view counts with stable ordering', () => {
        const videos = [
            { id: 'a', viewCount: 100 },
            { id: 'b', viewCount: 100 },
            { id: 'c', viewCount: 100 },
        ];
        const result = assignPercentileGroups(videos);

        // All 3 videos have same views. After stable sort, order preserved.
        // i=0: 0/3*100=0 → Top 1%
        // i=1: 1/3*100=33.3 → Middle 60%
        // i=2: 2/3*100=66.7 → Middle 60%
        expect(result.size).toBe(3);
        // At least one should be Top 1% (the first in sorted order)
        const groups = [...result.values()];
        expect(groups.filter(g => g === 'Top 1%').length).toBe(1);
    });

    it('produces same result regardless of input order', () => {
        const sorted = [
            { id: 'a', viewCount: 300 },
            { id: 'b', viewCount: 200 },
            { id: 'c', viewCount: 100 },
        ];
        const shuffled = [
            { id: 'c', viewCount: 100 },
            { id: 'a', viewCount: 300 },
            { id: 'b', viewCount: 200 },
        ];

        const result1 = assignPercentileGroups(sorted);
        const result2 = assignPercentileGroups(shuffled);

        expect(result1.get('a')).toBe(result2.get('a'));
        expect(result1.get('b')).toBe(result2.get('b'));
        expect(result1.get('c')).toBe(result2.get('c'));
    });

    it('assigns correct groups for small set (5 videos)', () => {
        const videos = [
            { id: 'v1', viewCount: 500 },
            { id: 'v2', viewCount: 400 },
            { id: 'v3', viewCount: 300 },
            { id: 'v4', viewCount: 200 },
            { id: 'v5', viewCount: 100 },
        ];
        const result = assignPercentileGroups(videos);

        // i=0: 0/5*100=0 → Top 1%
        // i=1: 1/5*100=20 → Top 20%
        // i=2: 2/5*100=40 → Middle 60%
        // i=3: 3/5*100=60 → Middle 60%
        // i=4: 4/5*100=80 → Middle 60%
        expect(result.get('v1')).toBe('Top 1%');
        expect(result.get('v2')).toBe('Top 20%');
        expect(result.get('v3')).toBe('Middle 60%');
        expect(result.get('v4')).toBe('Middle 60%');
        expect(result.get('v5')).toBe('Middle 60%');
    });

    it('does not mutate the input array', () => {
        const videos = [
            { id: 'b', viewCount: 100 },
            { id: 'a', viewCount: 200 },
        ];
        const originalOrder = videos.map(v => v.id);
        assignPercentileGroups(videos);
        expect(videos.map(v => v.id)).toEqual(originalOrder);
    });
});

// ---------------------------------------------------------------------------
// getPercentileDistribution
// ---------------------------------------------------------------------------

describe('getPercentileDistribution', () => {
    it('returns all zeros for empty input', () => {
        const result = getPercentileDistribution([]);
        expect(result).toEqual({ p25: 0, median: 0, p75: 0, max: 0 });
    });

    it('returns same value for all fields with single video', () => {
        const result = getPercentileDistribution([{ viewCount: 42000 }]);
        expect(result).toEqual({ p25: 42000, median: 42000, p75: 42000, max: 42000 });
    });

    it('correctly interpolates for two videos', () => {
        const result = getPercentileDistribution([
            { viewCount: 100 },
            { viewCount: 200 },
        ]);
        // n=2, sorted=[100,200]
        // p25: index = 0.25*(2-1) = 0.25 → 100 + 0.25*(200-100) = 125
        // median: index = 0.5*(2-1) = 0.5 → 100 + 0.5*(200-100) = 150
        // p75: index = 0.75*(2-1) = 0.75 → 100 + 0.75*(200-100) = 175
        expect(result.p25).toBe(125);
        expect(result.median).toBe(150);
        expect(result.p75).toBe(175);
        expect(result.max).toBe(200);
    });

    it('computes correct quartiles for even distribution', () => {
        // 5 videos: sorted = [10, 20, 30, 40, 50]
        const result = getPercentileDistribution([
            { viewCount: 30 },
            { viewCount: 10 },
            { viewCount: 50 },
            { viewCount: 20 },
            { viewCount: 40 },
        ]);
        // n=5, sorted=[10,20,30,40,50]
        // p25: index = 0.25*4 = 1.0 → sorted[1] = 20
        // median: index = 0.5*4 = 2.0 → sorted[2] = 30
        // p75: index = 0.75*4 = 3.0 → sorted[3] = 40
        expect(result.p25).toBe(20);
        expect(result.median).toBe(30);
        expect(result.p75).toBe(40);
        expect(result.max).toBe(50);
    });

    it('handles large dataset correctly', () => {
        // 101 videos with viewCount 0, 1000, 2000, ..., 100000
        const videos = Array.from({ length: 101 }, (_, i) => ({
            viewCount: i * 1000,
        }));
        const result = getPercentileDistribution(videos);

        // n=101, sorted=[0, 1000, 2000, ..., 100000]
        // p25: index = 0.25*100 = 25 → sorted[25] = 25000
        // median: index = 0.5*100 = 50 → sorted[50] = 50000
        // p75: index = 0.75*100 = 75 → sorted[75] = 75000
        expect(result.p25).toBe(25000);
        expect(result.median).toBe(50000);
        expect(result.p75).toBe(75000);
        expect(result.max).toBe(100000);
    });

    it('does not mutate input array', () => {
        const videos = [{ viewCount: 300 }, { viewCount: 100 }, { viewCount: 200 }];
        const originalOrder = videos.map(v => v.viewCount);
        getPercentileDistribution(videos);
        expect(videos.map(v => v.viewCount)).toEqual(originalOrder);
    });
});

// ---------------------------------------------------------------------------
// PERCENTILE_GROUPS constant
// ---------------------------------------------------------------------------

describe('PERCENTILE_GROUPS', () => {
    it('contains exactly 5 groups', () => {
        expect(PERCENTILE_GROUPS).toHaveLength(5);
    });

    it('is ordered from best to worst', () => {
        expect(PERCENTILE_GROUPS[0]).toBe('Top 1%');
        expect(PERCENTILE_GROUPS[4]).toBe('Bottom 20%');
    });
});

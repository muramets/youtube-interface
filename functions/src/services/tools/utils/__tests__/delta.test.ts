import { describe, it, expect } from 'vitest';
import {
    calculateSnapshotDeltas,
    findNewEntries,
    findDroppedEntries,
    buildVideoTimeline,
    getTransitions,
    type VideoSnapshotEntry,
} from '../delta.js';

const makeEntry = (videoId: string, views: number, impressions: number, ctr: number | null = null): VideoSnapshotEntry => ({
    videoId,
    sourceTitle: `Video ${videoId}`,
    views,
    impressions,
    ctr,
    avgViewDuration: '0:03:00',
    watchTimeHours: views * 0.1,
});

describe('calculateSnapshotDeltas', () => {
    it('calculates positive delta correctly', () => {
        const latest = [makeEntry('abc', 8000, 5000, 2.5)];
        const previous = [makeEntry('abc', 3000, 2000, 1.5)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        const d = deltas.get('abc')!;
        expect(d.deltaViews).toBe(5000);
        expect(d.deltaImpressions).toBe(3000);
        expect(d.deltaCtr).toBeCloseTo(1.0);
    });

    it('calculates negative delta correctly', () => {
        const latest = [makeEntry('abc', 100, 200)];
        const previous = [makeEntry('abc', 500, 800)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        const d = deltas.get('abc')!;
        expect(d.deltaViews).toBe(-400);
        expect(d.deltaImpressions).toBe(-600);
    });

    it('calculates percentage change correctly (1 decimal)', () => {
        const latest = [makeEntry('abc', 8000, 5000)];
        const previous = [makeEntry('abc', 3000, 2000)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        const d = deltas.get('abc')!;
        // (8000-3000)/3000 * 100 = 166.666... → 166.7
        expect(d.pctViews).toBe(166.7);
        // (5000-2000)/2000 * 100 = 150
        expect(d.pctImpressions).toBe(150);
    });

    it('returns null pctViews when previous views = 0', () => {
        const latest = [makeEntry('abc', 5, 100)];
        const previous = [makeEntry('abc', 0, 100)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.get('abc')!.pctViews).toBeNull();
    });

    it('returns null pctImpressions when previous impressions = 0', () => {
        const latest = [makeEntry('abc', 5, 100)];
        const previous = [makeEntry('abc', 5, 0)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.get('abc')!.pctImpressions).toBeNull();
    });

    it('excludes videos only in latest (they are newEntries)', () => {
        const latest = [makeEntry('abc', 100, 200), makeEntry('new', 50, 100)];
        const previous = [makeEntry('abc', 50, 100)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.has('abc')).toBe(true);
        expect(deltas.has('new')).toBe(false);
    });

    it('excludes videos only in previous (they are droppedEntries)', () => {
        const latest = [makeEntry('abc', 100, 200)];
        const previous = [makeEntry('abc', 50, 100), makeEntry('old', 200, 500)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.has('abc')).toBe(true);
        expect(deltas.has('old')).toBe(false);
    });

    it('returns null deltaCtr when either ctr is null', () => {
        const latest = [makeEntry('abc', 100, 200, null)];
        const previous = [makeEntry('abc', 50, 100, 2.5)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.get('abc')!.deltaCtr).toBeNull();
    });

    it('returns empty map for empty inputs', () => {
        expect(calculateSnapshotDeltas([], []).size).toBe(0);
    });
});

describe('findNewEntries', () => {
    it('finds videos in latest not in previous', () => {
        const latest = [makeEntry('abc', 100, 200), makeEntry('new1', 50, 100), makeEntry('new2', 10, 20)];
        const previous = [makeEntry('abc', 50, 100)];
        const newEntries = findNewEntries(latest, previous);
        expect(newEntries).toHaveLength(2);
        expect(newEntries.map(e => e.videoId)).toContain('new1');
        expect(newEntries.map(e => e.videoId)).toContain('new2');
        expect(newEntries.map(e => e.videoId)).not.toContain('abc');
    });

    it('returns empty array when latest has no new videos', () => {
        const latest = [makeEntry('abc', 100, 200)];
        const previous = [makeEntry('abc', 50, 100), makeEntry('xyz', 10, 20)];
        expect(findNewEntries(latest, previous)).toHaveLength(0);
    });

    it('returns all latest when previous is empty', () => {
        const latest = [makeEntry('abc', 100, 200), makeEntry('def', 50, 100)];
        expect(findNewEntries(latest, [])).toHaveLength(2);
    });
});

describe('findDroppedEntries', () => {
    it('finds videos in previous not in latest', () => {
        const latest = [makeEntry('abc', 100, 200)];
        const previous = [makeEntry('abc', 50, 100), makeEntry('gone1', 200, 500), makeEntry('gone2', 10, 30)];
        const dropped = findDroppedEntries(latest, previous);
        expect(dropped).toHaveLength(2);
        expect(dropped.map(e => e.videoId)).toContain('gone1');
        expect(dropped.map(e => e.videoId)).toContain('gone2');
        expect(dropped.map(e => e.videoId)).not.toContain('abc');
    });

    it('returns empty array when all previous are still in latest', () => {
        const latest = [makeEntry('abc', 100, 200), makeEntry('xyz', 50, 100)];
        const previous = [makeEntry('abc', 50, 100)];
        expect(findDroppedEntries(latest, previous)).toHaveLength(0);
    });

    it('returns all previous when latest is empty', () => {
        const previous = [makeEntry('abc', 100, 200), makeEntry('def', 50, 100)];
        expect(findDroppedEntries([], previous)).toHaveLength(2);
    });
});

describe('buildVideoTimeline', () => {
    it('builds 3-point timeline for video present in all snapshots', () => {
        const s1 = [makeEntry('abc', 200, 3000)];
        const s2 = [makeEntry('abc', 2800, 45000)];
        const s3 = [makeEntry('abc', 5000, 80000)];
        const result = buildVideoTimeline([s1, s2, s3], ['2026-01-15', '2026-01-22', '2026-02-15']);
        const t = result.get('abc')!;

        expect(t.timeline).toHaveLength(3);
        // First point: no delta
        expect(t.timeline[0].deltaViews).toBeNull();
        expect(t.timeline[0].deltaImpressions).toBeNull();
        expect(t.timeline[0].views).toBe(200);
        // Second point: delta from first
        expect(t.timeline[1].deltaViews).toBe(2600);
        expect(t.timeline[1].deltaImpressions).toBe(42000);
        // Third point: delta from second
        expect(t.timeline[2].deltaViews).toBe(2200);
        expect(t.timeline[2].deltaImpressions).toBe(35000);
        // Latest values match last snapshot
        expect(t.views).toBe(5000);
        expect(t.impressions).toBe(80000);
    });

    it('handles gap: video in s1 and s3 but not s2 → 2 points, delta from s1', () => {
        const s1 = [makeEntry('abc', 200, 3000)];
        const s2: VideoSnapshotEntry[] = []; // abc not present
        const s3 = [makeEntry('abc', 5000, 80000)];
        const result = buildVideoTimeline([s1, s2, s3], ['2026-01-15', '2026-01-22', '2026-02-15']);
        const t = result.get('abc')!;

        expect(t.timeline).toHaveLength(2);
        expect(t.timeline[0].date).toBe('2026-01-15');
        expect(t.timeline[0].deltaViews).toBeNull(); // first appearance
        expect(t.timeline[1].date).toBe('2026-02-15');
        expect(t.timeline[1].deltaViews).toBe(4800); // delta from s1, not s2
    });

    it('single snapshot → 1 point, no delta', () => {
        const s1 = [makeEntry('abc', 500, 10000)];
        const result = buildVideoTimeline([s1], ['2026-01-15']);
        const t = result.get('abc')!;

        expect(t.timeline).toHaveLength(1);
        expect(t.timeline[0].deltaViews).toBeNull();
        expect(t.views).toBe(500);
    });
});

describe('getTransitions', () => {
    it('computes 2 transitions for 3 snapshots', () => {
        const s1 = [makeEntry('abc', 200, 3000)];
        const s2 = [makeEntry('abc', 2800, 45000), makeEntry('new1', 100, 500), makeEntry('new2', 50, 200)];
        const s3 = [makeEntry('abc', 5000, 80000), makeEntry('new1', 200, 800)]; // new2 dropped

        const transitions = getTransitions([s1, s2, s3], ['2026-01-15', '2026-01-22', '2026-02-15']);

        expect(transitions).toHaveLength(2);
        // Transition 1: s1 → s2
        expect(transitions[0].newCount).toBe(2);       // new1, new2 appeared
        expect(transitions[0].droppedCount).toBe(0);    // nothing dropped
        expect(transitions[0].periodFromDate).toBe('2026-01-15');
        expect(transitions[0].periodToDate).toBe('2026-01-22');
        // Transition 2: s2 → s3
        expect(transitions[1].newCount).toBe(0);
        expect(transitions[1].droppedCount).toBe(1);    // new2 dropped
        expect(transitions[1].topDropped[0].videoId).toBe('new2');
    });

    it('returningCount = 0 for first transition (no history to return from)', () => {
        const s1 = [makeEntry('abc', 200, 3000)];
        const s2 = [makeEntry('abc', 2800, 45000), makeEntry('new1', 100, 500)];

        const transitions = getTransitions([s1, s2], ['2026-01-15', '2026-01-22']);

        expect(transitions[0].returningCount).toBe(0); // new1 was never seen before
    });

    it('returningCount detects videos that reappear after being dropped', () => {
        const s1 = [makeEntry('abc', 200, 3000), makeEntry('flash', 50, 100)];
        const s2 = [makeEntry('abc', 2800, 45000)]; // flash dropped
        const s3 = [makeEntry('abc', 5000, 80000), makeEntry('flash', 80, 200)]; // flash returns

        const transitions = getTransitions(
            [s1, s2, s3],
            ['2026-01-15', '2026-01-22', '2026-02-15'],
        );

        // s1→s2: flash dropped, no new entries
        expect(transitions[0].newCount).toBe(0);
        expect(transitions[0].returningCount).toBe(0);
        // s2→s3: flash is "new" (not in s2) but was in s1 → returning
        expect(transitions[1].newCount).toBe(1);
        expect(transitions[1].returningCount).toBe(1);
    });

    it('returningCount distinguishes truly new from returning in a spike', () => {
        const s1 = [makeEntry('a', 10, 100), makeEntry('b', 10, 100), makeEntry('c', 10, 100)];
        const s2 = [makeEntry('a', 20, 200)]; // b, c dropped
        const s3 = [makeEntry('a', 30, 300), makeEntry('b', 15, 150), makeEntry('d', 5, 50)];
        // b returns, d is truly new

        const transitions = getTransitions(
            [s1, s2, s3],
            ['2026-01-01', '2026-01-02', '2026-01-03'],
        );

        expect(transitions[1].newCount).toBe(2);         // b + d
        expect(transitions[1].returningCount).toBe(1);    // only b (was in s1)
    });

    it('topNew is sorted by impressions and capped at 10', () => {
        const s1: VideoSnapshotEntry[] = [];
        // Create 15 new entries with varying impressions
        const s2 = Array.from({ length: 15 }, (_, i) =>
            makeEntry(`v${i}`, i * 10, (15 - i) * 100),
        );

        const transitions = getTransitions([s1, s2], ['2026-01-15', '2026-01-22']);

        expect(transitions[0].newCount).toBe(15);        // full count
        expect(transitions[0].topNew).toHaveLength(10);  // capped at 10
        // Sorted by impressions desc: v0 has 1500 (highest)
        expect(transitions[0].topNew[0].videoId).toBe('v0');
    });
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { calculateViewDeltas } from '../viewDeltas';
import type { ViewSnapshot } from '../viewDeltas';

const NOW = new Date('2026-03-06T12:00:00Z').getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;

function makeSnapshot(timestamp: number, videoViews: Record<string, number>): ViewSnapshot {
    return { timestamp, videoViews };
}

describe('calculateViewDeltas', () => {
    it('computes correct 24h/7d/30d deltas from historical snapshots', () => {
        const snapshots = [
            makeSnapshot(NOW, { v1: 1000 }),          // latest
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 900 }),   // ~2d ago → used for 24h
            makeSnapshot(NOW - 8 * ONE_DAY, { v1: 600 }),   // ~8d ago → used for 7d
            makeSnapshot(NOW - 31 * ONE_DAY, { v1: 200 }),  // ~31d ago → used for 30d
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        expect(stats.currentViews).toBe(1000);
        expect(stats.delta24h).toBe(100);   // 1000 - 900
        expect(stats.delta7d).toBe(400);    // 1000 - 600
        expect(stats.delta30d).toBe(800);   // 1000 - 200
    });

    it('respects the now parameter (does not use internal Date.now)', () => {
        const customNow = NOW - 10 * ONE_DAY;
        const snapshots = [
            makeSnapshot(customNow, { v1: 500 }),
            makeSnapshot(customNow - 2 * ONE_DAY, { v1: 400 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], customNow);
        const stats = result.get('v1')!;

        expect(stats.currentViews).toBe(500);
        expect(stats.delta24h).toBe(100); // 500 - 400
    });

    it('handles unsorted snapshots — algorithm sorts internally', () => {
        // Deliberately out of order: oldest first, newest last
        const snapshots = [
            makeSnapshot(NOW - 31 * ONE_DAY, { v1: 100 }),
            makeSnapshot(NOW, { v1: 500 }),
            makeSnapshot(NOW - 8 * ONE_DAY, { v1: 300 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 450 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        expect(stats.currentViews).toBe(500);
        expect(stats.delta24h).toBe(50);    // 500 - 450
        expect(stats.delta7d).toBe(200);    // 500 - 300
        expect(stats.delta30d).toBe(400);   // 500 - 100
    });

    it('uses newest timestamp as latest snapshot, not array position', () => {
        // The snapshot with the highest timestamp should be "latest",
        // regardless of its position in the array
        const snapshots = [
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 200 }),  // array[0] but NOT latest
            makeSnapshot(NOW, { v1: 800 }),                  // array[1] — IS latest
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        expect(stats.currentViews).toBe(800); // from newest, not array[0]
        expect(stats.delta24h).toBe(600);     // 800 - 200
    });

    it('returns empty Map for empty videoIds', () => {
        const snapshots = [makeSnapshot(NOW, { v1: 100 })];
        const result = calculateViewDeltas(snapshots, [], NOW);
        expect(result.size).toBe(0);
    });

    it('returns empty Map for empty snapshots', () => {
        const result = calculateViewDeltas([], ['v1'], NOW);
        expect(result.size).toBe(0);
    });

    it('returns null delta when video is missing from an older snapshot', () => {
        const snapshots = [
            makeSnapshot(NOW, { v1: 1000 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 900 }),
            // 7d snapshot exists but does NOT contain v1
            makeSnapshot(NOW - 8 * ONE_DAY, { v2: 500 }),
            makeSnapshot(NOW - 31 * ONE_DAY, { v1: 200 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        expect(stats.delta24h).toBe(100);   // 1000 - 900
        expect(stats.delta7d).toBe(null);   // v1 absent from the 8d-ago snapshot
        expect(stats.delta30d).toBe(800);   // 1000 - 200
    });

    it('excludes video entirely when missing from latest snapshot', () => {
        const snapshots = [
            makeSnapshot(NOW, { v1: 1000 }),              // latest has v1 but NOT v2
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 900, v2: 500 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1', 'v2'], NOW);

        expect(result.has('v1')).toBe(true);
        expect(result.has('v2')).toBe(false); // v2 not in latest → excluded
    });

    it('returns delta = 0 for zero growth, not null', () => {
        const snapshots = [
            makeSnapshot(NOW, { v1: 500 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 500 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        expect(stats.delta24h).toBe(0);
        expect(stats.delta24h).not.toBeNull();
    });

    it('returns negative delta when views decreased', () => {
        const snapshots = [
            makeSnapshot(NOW, { v1: 300 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 500 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        expect(stats.delta24h).toBe(-200); // 300 - 500
    });

    it('handles mixed null pattern: video in latest + 24h but absent from 7d/30d', () => {
        const snapshots = [
            makeSnapshot(NOW, { v1: 1000 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 900 }),
            makeSnapshot(NOW - 8 * ONE_DAY, { v2: 700 }),    // v1 absent
            makeSnapshot(NOW - 31 * ONE_DAY, { v2: 400 }),   // v1 absent
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        expect(stats.currentViews).toBe(1000);
        expect(stats.delta24h).toBe(100);   // present in 24h snap
        expect(stats.delta7d).toBeNull();   // absent from 7d snap
        expect(stats.delta30d).toBeNull();  // absent from 30d snap
    });

    it('computes each video independently when given multiple videoIds', () => {
        const snapshots = [
            makeSnapshot(NOW, { v1: 1000, v2: 2000, v3: 3000 }),
            makeSnapshot(NOW - 2 * ONE_DAY, { v1: 900, v2: 1500, v3: 3000 }),
            makeSnapshot(NOW - 8 * ONE_DAY, { v1: 600, v2: 1000 }),         // v3 absent
            makeSnapshot(NOW - 31 * ONE_DAY, { v1: 200, v2: 500, v3: 1000 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1', 'v2', 'v3'], NOW);

        // v1 — all deltas present
        const s1 = result.get('v1')!;
        expect(s1.currentViews).toBe(1000);
        expect(s1.delta24h).toBe(100);
        expect(s1.delta7d).toBe(400);
        expect(s1.delta30d).toBe(800);

        // v2 — all deltas present
        const s2 = result.get('v2')!;
        expect(s2.currentViews).toBe(2000);
        expect(s2.delta24h).toBe(500);
        expect(s2.delta7d).toBe(1000);
        expect(s2.delta30d).toBe(1500);

        // v3 — 7d is null (absent from 8d-ago snapshot)
        const s3 = result.get('v3')!;
        expect(s3.currentViews).toBe(3000);
        expect(s3.delta24h).toBe(0);
        expect(s3.delta7d).toBeNull();
        expect(s3.delta30d).toBe(2000);
    });

    it('finds snapshot at exact boundary: timestamp === now - 24h is matched by <= check', () => {
        const exactlyOneDayAgo = NOW - ONE_DAY;

        const snapshots = [
            makeSnapshot(NOW, { v1: 1000 }),
            makeSnapshot(exactlyOneDayAgo, { v1: 800 }),
        ];

        const result = calculateViewDeltas(snapshots, ['v1'], NOW);
        const stats = result.get('v1')!;

        // The snapshot at exactly now - 24h satisfies `<= targetTs`, so it should be found
        expect(stats.delta24h).toBe(200); // 1000 - 800
    });
});

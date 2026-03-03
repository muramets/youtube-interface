import { describe, it, expect } from 'vitest';
import {
    calculateSnapshotDeltas,
    findNewEntries,
    findDroppedEntries,
    type VideoSnapshotEntry,
} from '../delta.js';

const makeEntry = (videoId: string, views: number, impressions: number, ctr: number | null = null): VideoSnapshotEntry => ({
    videoId,
    sourceTitle: `Video ${videoId}`,
    views,
    impressions,
    ctr,
    watchTimeHours: views * 0.1,
});

describe('calculateSnapshotDeltas', () => {
    it('calculates positive delta correctly', () => {
        const latest   = [makeEntry('abc', 8000, 5000, 2.5)];
        const previous = [makeEntry('abc', 3000, 2000, 1.5)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        const d = deltas.get('abc')!;
        expect(d.deltaViews).toBe(5000);
        expect(d.deltaImpressions).toBe(3000);
        expect(d.deltaCtr).toBeCloseTo(1.0);
    });

    it('calculates negative delta correctly', () => {
        const latest   = [makeEntry('abc', 100, 200)];
        const previous = [makeEntry('abc', 500, 800)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        const d = deltas.get('abc')!;
        expect(d.deltaViews).toBe(-400);
        expect(d.deltaImpressions).toBe(-600);
    });

    it('calculates percentage change correctly (1 decimal)', () => {
        const latest   = [makeEntry('abc', 8000, 5000)];
        const previous = [makeEntry('abc', 3000, 2000)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        const d = deltas.get('abc')!;
        // (8000-3000)/3000 * 100 = 166.666... → 166.7
        expect(d.pctViews).toBe(166.7);
        // (5000-2000)/2000 * 100 = 150
        expect(d.pctImpressions).toBe(150);
    });

    it('returns null pctViews when previous views = 0', () => {
        const latest   = [makeEntry('abc', 5, 100)];
        const previous = [makeEntry('abc', 0, 100)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.get('abc')!.pctViews).toBeNull();
    });

    it('returns null pctImpressions when previous impressions = 0', () => {
        const latest   = [makeEntry('abc', 5, 100)];
        const previous = [makeEntry('abc', 5, 0)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.get('abc')!.pctImpressions).toBeNull();
    });

    it('excludes videos only in latest (they are newEntries)', () => {
        const latest   = [makeEntry('abc', 100, 200), makeEntry('new', 50, 100)];
        const previous = [makeEntry('abc', 50, 100)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.has('abc')).toBe(true);
        expect(deltas.has('new')).toBe(false);
    });

    it('excludes videos only in previous (they are droppedEntries)', () => {
        const latest   = [makeEntry('abc', 100, 200)];
        const previous = [makeEntry('abc', 50, 100), makeEntry('old', 200, 500)];
        const deltas = calculateSnapshotDeltas(latest, previous);
        expect(deltas.has('abc')).toBe(true);
        expect(deltas.has('old')).toBe(false);
    });

    it('returns null deltaCtr when either ctr is null', () => {
        const latest   = [makeEntry('abc', 100, 200, null)];
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
        const latest   = [makeEntry('abc', 100, 200), makeEntry('new1', 50, 100), makeEntry('new2', 10, 20)];
        const previous = [makeEntry('abc', 50, 100)];
        const newEntries = findNewEntries(latest, previous);
        expect(newEntries).toHaveLength(2);
        expect(newEntries.map(e => e.videoId)).toContain('new1');
        expect(newEntries.map(e => e.videoId)).toContain('new2');
        expect(newEntries.map(e => e.videoId)).not.toContain('abc');
    });

    it('returns empty array when latest has no new videos', () => {
        const latest   = [makeEntry('abc', 100, 200)];
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
        const latest   = [makeEntry('abc', 100, 200)];
        const previous = [makeEntry('abc', 50, 100), makeEntry('gone1', 200, 500), makeEntry('gone2', 10, 30)];
        const dropped = findDroppedEntries(latest, previous);
        expect(dropped).toHaveLength(2);
        expect(dropped.map(e => e.videoId)).toContain('gone1');
        expect(dropped.map(e => e.videoId)).toContain('gone2');
        expect(dropped.map(e => e.videoId)).not.toContain('abc');
    });

    it('returns empty array when all previous are still in latest', () => {
        const latest   = [makeEntry('abc', 100, 200), makeEntry('xyz', 50, 100)];
        const previous = [makeEntry('abc', 50, 100)];
        expect(findDroppedEntries(latest, previous)).toHaveLength(0);
    });

    it('returns all previous when latest is empty', () => {
        const previous = [makeEntry('abc', 100, 200), makeEntry('def', 50, 100)];
        expect(findDroppedEntries([], previous)).toHaveLength(2);
    });
});

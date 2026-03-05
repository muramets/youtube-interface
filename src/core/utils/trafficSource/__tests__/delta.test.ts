// @vitest-environment node
// =============================================================================
// delta.test.ts — Safety net tests for calculateDelta / calculateTotalDelta
//
// Phase 0: Lock down pure math before building new handlers that depend on it.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { calculateDelta, calculateTotalDelta } from '../delta';
import type { TrafficSourceMetric } from '../../../types/trafficSource';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMetric(
    source: string,
    overrides: Partial<Omit<TrafficSourceMetric, 'source'>> = {},
): TrafficSourceMetric {
    return {
        source,
        views: 0,
        watchTimeHours: 0,
        avgViewDuration: '0:00:00',
        impressions: 0,
        ctr: 0,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// calculateDelta
// ---------------------------------------------------------------------------

describe('calculateDelta', () => {
    it('computes correct absolute and percentage deltas for matching sources', () => {
        const current = [
            makeMetric('Suggested videos', {
                views: 220, impressions: 800, ctr: 3.5, watchTimeHours: 10,
            }),
        ];
        const previous = [
            makeMetric('Suggested videos', {
                views: 40, impressions: 200, ctr: 2.0, watchTimeHours: 3,
            }),
        ];

        const [result] = calculateDelta(current, previous);

        expect(result.deltaViews).toBe(180);
        expect(result.deltaImpressions).toBe(600);
        expect(result.deltaCtr).toBe(1.5);
        expect(result.deltaWatchTimeHours).toBe(7);
        // pct: ((220-40)/40)*1000 → round → /10 = 450
        expect(result.pctViews).toBe(450);
        // pct: ((800-200)/200)*1000 → round → /10 = 300
        expect(result.pctImpressions).toBe(300);
    });

    it('returns metric without delta fields for new sources (not in previous)', () => {
        const current = [makeMetric('New Source', { views: 100, impressions: 500 })];
        const previous: TrafficSourceMetric[] = [];

        const [result] = calculateDelta(current, previous);

        expect(result.source).toBe('New Source');
        expect(result.views).toBe(100);
        expect(result.deltaViews).toBeUndefined();
        expect(result.deltaImpressions).toBeUndefined();
        expect(result.pctViews).toBeUndefined();
    });

    it('excludes sources present in previous but missing from current', () => {
        const current = [makeMetric('Browse features', { views: 50 })];
        const previous = [
            makeMetric('Browse features', { views: 30 }),
            makeMetric('Removed Source', { views: 100 }),
        ];

        const result = calculateDelta(current, previous);

        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('Browse features');
    });

    it('returns empty array for empty inputs', () => {
        expect(calculateDelta([], [])).toEqual([]);
    });

    it('handles previous = 0 without producing Infinity', () => {
        const current = [makeMetric('A', { views: 100, impressions: 50 })];
        const previous = [makeMetric('A', { views: 0, impressions: 0 })];

        const [result] = calculateDelta(current, previous);

        expect(result.deltaViews).toBe(100);
        expect(result.pctViews).toBeUndefined(); // not Infinity
        expect(result.pctImpressions).toBeUndefined();
    });

    it('returns 0% change when both current and previous are 0', () => {
        const current = [makeMetric('A', { views: 0 })];
        const previous = [makeMetric('A', { views: 0 })];

        const [result] = calculateDelta(current, previous);

        expect(result.deltaViews).toBe(0);
        expect(result.pctViews).toBe(0);
    });

    it('handles negative deltas (views decreased)', () => {
        const current = [makeMetric('Browse', { views: 30, impressions: 100 })];
        const previous = [makeMetric('Browse', { views: 80, impressions: 400 })];

        const [result] = calculateDelta(current, previous);

        expect(result.deltaViews).toBe(-50);
        expect(result.deltaImpressions).toBe(-300);
        // pct: ((30-80)/80)*1000 → -625 → /10 = -62.5
        expect(result.pctViews).toBe(-62.5);
    });

    it('matches sources by name across multiple entries', () => {
        const current = [
            makeMetric('Search', { views: 10 }),
            makeMetric('Browse', { views: 50 }),
        ];
        const previous = [
            makeMetric('Browse', { views: 30 }),
            makeMetric('Search', { views: 5 }),
        ];

        const result = calculateDelta(current, previous);

        // Order follows current array
        expect(result[0].source).toBe('Search');
        expect(result[0].deltaViews).toBe(5);
        expect(result[1].source).toBe('Browse');
        expect(result[1].deltaViews).toBe(20);
    });

    it('rounds deltaCtr and deltaWatchTimeHours to 2 decimal places', () => {
        const current = [makeMetric('A', { ctr: 3.456, watchTimeHours: 7.891 })];
        const previous = [makeMetric('A', { ctr: 1.111, watchTimeHours: 2.222 })];

        const [result] = calculateDelta(current, previous);

        // (3.456-1.111) = 2.34499... (FP) → *100 = 234.49 → round = 234 → /100 = 2.34
        expect(result.deltaCtr).toBe(2.34);
        // (7.891-2.222)*100 = 566.9 → round → /100 = 5.67
        expect(result.deltaWatchTimeHours).toBe(5.67);
    });
});

// ---------------------------------------------------------------------------
// calculateTotalDelta
// ---------------------------------------------------------------------------

describe('calculateTotalDelta', () => {
    it('computes correct deltas for a total row', () => {
        const current = makeMetric('Total', {
            views: 500, impressions: 2000, ctr: 5.0, watchTimeHours: 20,
        });
        const previous = makeMetric('Total', {
            views: 200, impressions: 1000, ctr: 3.0, watchTimeHours: 10,
        });

        const result = calculateTotalDelta(current, previous);

        expect(result.deltaViews).toBe(300);
        expect(result.deltaImpressions).toBe(1000);
        expect(result.deltaCtr).toBe(2);
        expect(result.deltaWatchTimeHours).toBe(10);
        // pct: ((500-200)/200)*1000 → 1500 → /10 = 150
        expect(result.pctViews).toBe(150);
    });

    it('preserves original metric fields alongside deltas', () => {
        const current = makeMetric('Total', { views: 100, avgViewDuration: '2:30:00' });
        const previous = makeMetric('Total', { views: 50, avgViewDuration: '1:15:00' });

        const result = calculateTotalDelta(current, previous);

        expect(result.source).toBe('Total');
        expect(result.views).toBe(100);
        expect(result.avgViewDuration).toBe('2:30:00');
    });
});

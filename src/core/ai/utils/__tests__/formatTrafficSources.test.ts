// @vitest-environment node
// =============================================================================
// formatTrafficSources.test.ts — Safety net for formatTrafficSourcesCompact
//
// Phase 0: Lock down the formatter before the backend handler reuses its logic.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { formatTrafficSourcesCompact } from '../formatTrafficSources';
import type { TrafficSourceMetric, SnapshotWithMetrics } from '../../../types/suggestedTraffic/trafficSource';

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

function makeSnapshot(
    id: string,
    autoLabel: string,
    metrics: TrafficSourceMetric[],
    label?: string,
): SnapshotWithMetrics {
    return {
        snapshot: {
            id,
            timestamp: Date.now(),
            autoLabel,
            storagePath: `path/${id}.csv`,
            ...(label ? { label } : {}),
        },
        metrics,
    };
}

// ---------------------------------------------------------------------------
// formatTrafficSourcesCompact
// ---------------------------------------------------------------------------

describe('formatTrafficSourcesCompact', () => {
    it('returns empty string for empty input', () => {
        expect(formatTrafficSourcesCompact([])).toBe('');
    });

    it('renders single snapshot as baseline only (no Δ lines)', () => {
        const snapshots = [
            makeSnapshot('s1', '13h', [
                makeMetric('Suggested videos', {
                    views: 22, impressions: 684, ctr: 2.3, avgViewDuration: '1:30',
                }),
                makeMetric('Browse features', {
                    views: 8, impressions: 200, ctr: 4.0, avgViewDuration: '2:15',
                }),
            ]),
        ];

        const result = formatTrafficSourcesCompact(snapshots);

        expect(result).toContain('Traffic Sources (1 snapshot):');
        expect(result).toContain('13h:');
        expect(result).toContain('Suggested');
        expect(result).toContain('Browse');
        expect(result).not.toContain('Δ');
    });

    it('renders multiple snapshots with baseline + Δ lines', () => {
        const snapshots = [
            makeSnapshot('s1', '13h', [
                makeMetric('Suggested videos', {
                    views: 22, impressions: 684, ctr: 2.3, avgViewDuration: '1:30',
                }),
            ]),
            makeSnapshot('s2', '3d', [
                makeMetric('Suggested videos', {
                    views: 70, impressions: 1884, ctr: 3.5, avgViewDuration: '2:00',
                }),
            ]),
        ];

        const result = formatTrafficSourcesCompact(snapshots);

        expect(result).toContain('Traffic Sources (2 snapshots):');
        expect(result).toContain('13h:');  // baseline
        expect(result).toContain('Δ 3d:'); // delta line
        // Delta impressions: 1884-684 = +1200 → "+1.2K"
        expect(result).toContain('+1.2K');
        // Delta views: 70-22 = +48 → "+48"
        expect(result).toContain('+48');
    });

    it('sorts sources by views desc in baseline', () => {
        const snapshots = [
            makeSnapshot('s1', '1d', [
                makeMetric('Browse features', {
                    views: 5, impressions: 100, ctr: 1.0, avgViewDuration: '0:30',
                }),
                makeMetric('Suggested videos', {
                    views: 100, impressions: 500, ctr: 2.0, avgViewDuration: '1:00',
                }),
                makeMetric('YouTube search', {
                    views: 30, impressions: 200, ctr: 1.5, avgViewDuration: '0:45',
                }),
            ]),
        ];

        const result = formatTrafficSourcesCompact(snapshots);
        const baselineLine = result.split('\n')[1]; // second line = baseline

        // Suggested (100v) → Search (30v) → Browse (5v)
        const suggestedIdx = baselineLine.indexOf('Suggested');
        const searchIdx = baselineLine.indexOf('Search');
        const browseIdx = baselineLine.indexOf('Browse');

        expect(suggestedIdx).toBeLessThan(searchIdx);
        expect(searchIdx).toBeLessThan(browseIdx);
    });

    it('caps baseline at top 5 sources', () => {
        const sources = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) =>
            makeMetric(name, {
                views: (6 - i) * 10,
                impressions: 100,
                ctr: 1.0,
                avgViewDuration: '0:30',
            }),
        );

        const snapshots = [makeSnapshot('s1', '1d', sources)];
        const result = formatTrafficSourcesCompact(snapshots);
        const baselineLine = result.split('\n')[1];

        // Top 5 by views: A(60), B(50), C(40), D(30), E(20) — F(10) excluded
        expect(baselineLine).toContain('A');
        expect(baselineLine).toContain('E');
        expect(baselineLine).not.toContain(' F ');
    });

    it('shows "(no changes)" for zero-delta snapshots', () => {
        const metrics = [
            makeMetric('Suggested videos', {
                views: 22, impressions: 684, ctr: 2.3, avgViewDuration: '1:30',
            }),
        ];
        const snapshots = [
            makeSnapshot('s1', '13h', metrics),
            makeSnapshot('s2', '3d', metrics), // identical → all deltas = 0
        ];

        const result = formatTrafficSourcesCompact(snapshots);

        expect(result).toContain('(no changes)');
    });

    it('uses label over autoLabel when present', () => {
        const snapshots = [
            makeSnapshot('s1', '13h', [
                makeMetric('Browse features', {
                    views: 10, impressions: 100, ctr: 1.0, avgViewDuration: '0:30',
                }),
            ], 'Custom Label'),
        ];

        const result = formatTrafficSourcesCompact(snapshots);

        expect(result).toContain('Custom Label:');
        expect(result).not.toContain('13h:');
    });

    it('applies shortenSource for common YouTube source names', () => {
        const snapshots = [
            makeSnapshot('s1', '1d', [
                makeMetric('Suggested videos', {
                    views: 50, impressions: 300, ctr: 2.0, avgViewDuration: '1:00',
                }),
                makeMetric('Browse features', {
                    views: 30, impressions: 200, ctr: 1.5, avgViewDuration: '0:45',
                }),
                makeMetric('YouTube search', {
                    views: 10, impressions: 100, ctr: 1.0, avgViewDuration: '0:30',
                }),
            ]),
        ];

        const result = formatTrafficSourcesCompact(snapshots);

        // Shortened forms used
        expect(result).toContain('Suggested ');
        expect(result).toContain('Browse ');
        expect(result).toContain('Search ');
        // Full names NOT present
        expect(result).not.toContain('Suggested videos');
        expect(result).not.toContain('Browse features');
        expect(result).not.toContain('YouTube search');
    });

    it('formats large numbers compactly (K/M notation)', () => {
        const snapshots = [
            makeSnapshot('s1', '1d', [
                makeMetric('Browse features', {
                    views: 1500, impressions: 2_500_000, ctr: 3.0, avgViewDuration: '1:00',
                }),
            ]),
        ];

        const result = formatTrafficSourcesCompact(snapshots);

        expect(result).toContain('2.5Mi');  // 2,500,000 impressions
        expect(result).toContain('1.5Kv');  // 1,500 views
    });

    it('caps delta line at top 5 sources by absolute deltaViews', () => {
        // 6 sources in both snapshots, all with different view changes
        const prevMetrics = ['A', 'B', 'C', 'D', 'E', 'F'].map(name =>
            makeMetric(name, {
                views: 10, impressions: 100, ctr: 1.0, avgViewDuration: '0:30',
            }),
        );
        const currMetrics = ['A', 'B', 'C', 'D', 'E', 'F'].map((name, i) =>
            makeMetric(name, {
                views: 10 + (6 - i) * 10, // A=70, B=60, C=50, D=40, E=30, F=20
                impressions: 100,
                ctr: 1.0,
                avgViewDuration: '0:30',
            }),
        );

        const snapshots = [
            makeSnapshot('s1', '1d', prevMetrics),
            makeSnapshot('s2', '3d', currMetrics),
        ];
        const result = formatTrafficSourcesCompact(snapshots);
        const deltaLine = result.split('\n')[2]; // third line = delta

        // Top 5 by |deltaViews|: A(+60), B(+50), C(+40), D(+30), E(+20) — F(+10) excluded
        expect(deltaLine).toContain('A ');
        expect(deltaLine).toContain('E ');
        expect(deltaLine).not.toContain(' F ');
    });
});

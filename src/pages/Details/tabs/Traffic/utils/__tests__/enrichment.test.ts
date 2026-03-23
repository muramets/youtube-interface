import { describe, it, expect } from 'vitest';
import type { TrafficSource } from '../../../../../../core/types/suggestedTraffic/traffic';
import type { VideoDetails } from '../../../../../../core/utils/youtubeApi';
import {
    classifySources,
    computeEnrichmentStats,
    mergeSources,
    filterIdsToFetch,
} from '../enrichment';

// ── Test Helpers ─────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<TrafficSource> = {}): TrafficSource {
    return {
        sourceType: 'YT_RELATED',
        sourceTitle: 'Some Video Title',
        videoId: 'vid_001',
        impressions: 100,
        ctr: 3.5,
        views: 10,
        avgViewDuration: '0:02:30',
        watchTimeHours: 0.5,
        ...overrides,
    };
}

function makeCached(overrides: Partial<VideoDetails> = {}): VideoDetails {
    return {
        id: 'vid_001',
        title: 'Cached Title',
        thumbnail: 'https://img.youtube.com/thumb.jpg',
        channelId: 'ch_001',
        channelTitle: 'Cached Channel',
        channelAvatar: '',
        publishedAt: '2025-01-01',
        ...overrides,
    };
}

// ── classifySources ──────────────────────────────────────────────────────────

describe('classifySources', () => {
    it('classifies source with title + channelId as enriched', () => {
        const sources = [makeSource({ channelId: 'ch_001' })];
        const result = classifySources(sources, []);

        expect(result.enriched).toHaveLength(1);
        expect(result.missing).toHaveLength(0);
        expect(result.unenriched).toHaveLength(0);
        expect(result.unresolvable).toHaveLength(0);
    });

    it('classifies source with empty title as missing', () => {
        const sources = [makeSource({ sourceTitle: '' })];
        const result = classifySources(sources, []);

        expect(result.missing).toHaveLength(1);
        expect(result.enriched).toHaveLength(0);
    });

    it('classifies source with whitespace-only title as missing', () => {
        const sources = [makeSource({ sourceTitle: '   ' })];
        const result = classifySources(sources, []);

        expect(result.missing).toHaveLength(1);
    });

    it('classifies source with title but no channelId as unenriched', () => {
        const sources = [makeSource({ channelId: undefined })];
        const result = classifySources(sources, []);

        expect(result.unenriched).toHaveLength(1);
        expect(result.enriched).toHaveLength(0);
    });

    it('classifies source without videoId as unresolvable', () => {
        const sources = [makeSource({ videoId: null })];
        const result = classifySources(sources, []);

        expect(result.unresolvable).toHaveLength(1);
    });

    it('uses cache channelId to classify as enriched', () => {
        const sources = [makeSource({ channelId: undefined })];
        const cached = [makeCached({ id: 'vid_001', channelId: 'ch_from_cache' })];

        const result = classifySources(sources, cached);
        expect(result.enriched).toHaveLength(1);
        expect(result.unenriched).toHaveLength(0);
    });

    it('treats unfindable cached video as enriched (not blocking)', () => {
        const sources = [makeSource({ channelId: undefined })];
        const cached = [makeCached({ id: 'vid_001', channelId: '', notFoundInApi: true })];

        const result = classifySources(sources, cached);
        expect(result.enriched).toHaveLength(1);
        expect(result.unenriched).toHaveLength(0);
    });

    it('treats source with notFoundInApi flag as enriched (no cache needed)', () => {
        const sources = [makeSource({ channelId: undefined, notFoundInApi: true })];

        const result = classifySources(sources, []);
        expect(result.enriched).toHaveLength(1);
        expect(result.unenriched).toHaveLength(0);
    });

    it('classifies mixed sources correctly', () => {
        const sources = [
            makeSource({ videoId: 'v1', sourceTitle: '', channelId: undefined }),       // missing
            makeSource({ videoId: 'v2', sourceTitle: 'Title', channelId: 'ch_2' }),     // enriched
            makeSource({ videoId: 'v3', sourceTitle: 'Title', channelId: undefined }),   // unenriched
            makeSource({ videoId: null }),                                                // unresolvable
        ];
        const result = classifySources(sources, []);

        expect(result.missing).toHaveLength(1);
        expect(result.enriched).toHaveLength(1);
        expect(result.unenriched).toHaveLength(1);
        expect(result.unresolvable).toHaveLength(1);
    });

    it('returns all empty arrays for empty input', () => {
        const result = classifySources([], []);

        expect(result.missing).toHaveLength(0);
        expect(result.unenriched).toHaveLength(0);
        expect(result.enriched).toHaveLength(0);
        expect(result.unresolvable).toHaveLength(0);
    });
});

// ── computeEnrichmentStats ───────────────────────────────────────────────────

describe('computeEnrichmentStats', () => {
    it('returns needsEnrichment=false when all sources are enriched', () => {
        const sources = [makeSource({ channelId: 'ch_001' })];
        const stats = computeEnrichmentStats(sources, []);

        expect(stats.needsEnrichment).toBe(false);
        expect(stats.missingCount).toBe(0);
        expect(stats.unenrichedCount).toBe(0);
        expect(stats.toFetchCount).toBe(0);
        expect(stats.estimatedQuota).toBe(0);
    });

    it('returns needsEnrichment=true when sources have missing titles', () => {
        const sources = [makeSource({ sourceTitle: '' })];
        const stats = computeEnrichmentStats(sources, []);

        expect(stats.needsEnrichment).toBe(true);
        expect(stats.missingCount).toBe(1);
    });

    it('returns needsEnrichment=true when sources are unenriched', () => {
        const sources = [makeSource({ channelId: undefined })];
        const stats = computeEnrichmentStats(sources, []);

        expect(stats.needsEnrichment).toBe(true);
        expect(stats.unenrichedCount).toBe(1);
    });

    it('excludes cached videos from toFetchCount', () => {
        const sources = [
            makeSource({ videoId: 'v1', channelId: undefined }),
            makeSource({ videoId: 'v2', channelId: undefined }),
        ];
        const cached = [makeCached({ id: 'v1', channelId: 'ch_cached' })];

        const stats = computeEnrichmentStats(sources, cached);
        // v1 is in cache with channelId → skip. v2 is not in cache → fetch
        expect(stats.toFetchCount).toBe(1);
    });

    it('excludes unfindable videos from toFetchCount', () => {
        const sources = [makeSource({ videoId: 'v1', sourceTitle: '', channelId: undefined })];
        const cached = [makeCached({ id: 'v1', channelId: '', notFoundInApi: true })];

        const stats = computeEnrichmentStats(sources, cached);
        expect(stats.toFetchCount).toBe(0);
        // Still needs enrichment because title is missing — but nothing to fetch
        expect(stats.needsEnrichment).toBe(true);
    });

    it('deduplicates videoIds for toFetchCount', () => {
        const sources = [
            makeSource({ videoId: 'v1', sourceTitle: '', channelId: undefined }),
            makeSource({ videoId: 'v1', sourceTitle: '', channelId: undefined }),
        ];
        const stats = computeEnrichmentStats(sources, []);

        expect(stats.missingCount).toBe(2); // 2 source rows
        expect(stats.toFetchCount).toBe(1); // but 1 unique videoId to fetch
    });

    it('calculates quota for small batch (< 50 videos)', () => {
        const sources = Array.from({ length: 10 }, (_, i) =>
            makeSource({ videoId: `v${i}`, channelId: undefined }),
        );
        const stats = computeEnrichmentStats(sources, []);

        expect(stats.toFetchCount).toBe(10);
        expect(stats.estimatedQuota).toBe(2); // ceil(10/50) * 2 = 2
    });

    it('calculates quota for multiple batches', () => {
        const sources = Array.from({ length: 120 }, (_, i) =>
            makeSource({ videoId: `v${i}`, channelId: undefined }),
        );
        const stats = computeEnrichmentStats(sources, []);

        expect(stats.toFetchCount).toBe(120);
        expect(stats.estimatedQuota).toBe(6); // ceil(120/50) * 2 = 6
    });

    it('returns zero quota when nothing to fetch', () => {
        const sources = [makeSource({ channelId: 'ch_001' })];
        const stats = computeEnrichmentStats(sources, []);

        expect(stats.estimatedQuota).toBe(0);
    });
});

// ── mergeSources ─────────────────────────────────────────────────────────────

describe('mergeSources', () => {
    it('merges fetched data into source', () => {
        const sources = [makeSource({ videoId: 'v1', sourceTitle: '', channelId: undefined })];
        const fetched = new Map<string, VideoDetails>([
            ['v1', makeCached({ id: 'v1', title: 'Fetched Title', channelId: 'ch_fetched' })],
        ]);

        const result = mergeSources(sources, fetched, []);
        expect(result[0].sourceTitle).toBe('Fetched Title');
        expect(result[0].channelId).toBe('ch_fetched');
    });

    it('falls back to cached data when not in fetchedMap', () => {
        const sources = [makeSource({ videoId: 'v1', sourceTitle: '', channelId: undefined })];
        const cached = [makeCached({ id: 'v1', title: 'Cached Title', channelId: 'ch_cached' })];

        const result = mergeSources(sources, new Map(), cached);
        expect(result[0].sourceTitle).toBe('Cached Title');
        expect(result[0].channelId).toBe('ch_cached');
    });

    it('prefers fetched over cached', () => {
        const sources = [makeSource({ videoId: 'v1', sourceTitle: '', channelId: undefined })];
        const fetched = new Map<string, VideoDetails>([
            ['v1', makeCached({ id: 'v1', title: 'Fresh Title', channelId: 'ch_fresh' })],
        ]);
        const cached = [makeCached({ id: 'v1', title: 'Stale Title', channelId: 'ch_stale' })];

        const result = mergeSources(sources, fetched, cached);
        expect(result[0].sourceTitle).toBe('Fresh Title');
        expect(result[0].channelId).toBe('ch_fresh');
    });

    it('preserves original value when detail field is empty', () => {
        const sources = [makeSource({ videoId: 'v1', sourceTitle: 'Original Title' })];
        const fetched = new Map<string, VideoDetails>([
            ['v1', makeCached({ id: 'v1', title: '', channelId: 'ch_new' })],
        ]);

        const result = mergeSources(sources, fetched, []);
        // Empty title from fetched should NOT overwrite existing title
        expect(result[0].sourceTitle).toBe('Original Title');
        expect(result[0].channelId).toBe('ch_new');
    });

    it('returns source unchanged if no match in fetched or cached', () => {
        const sources = [makeSource({ videoId: 'v_unknown', sourceTitle: 'Original' })];
        const result = mergeSources(sources, new Map(), []);

        expect(result[0].sourceTitle).toBe('Original');
    });

    it('skips sources without videoId', () => {
        const sources = [makeSource({ videoId: null, sourceTitle: 'Total' })];
        const fetched = new Map<string, VideoDetails>();

        const result = mergeSources(sources, fetched, []);
        expect(result[0].sourceTitle).toBe('Total');
    });

    it('merges thumbnail and publishedAt fields', () => {
        const sources = [makeSource({ videoId: 'v1', thumbnail: undefined, publishedAt: undefined })];
        const fetched = new Map<string, VideoDetails>([
            ['v1', makeCached({
                id: 'v1',
                thumbnail: 'https://thumb.new.jpg',
                publishedAt: '2025-06-01',
            })],
        ]);

        const result = mergeSources(sources, fetched, []);
        expect(result[0].thumbnail).toBe('https://thumb.new.jpg');
        expect(result[0].publishedAt).toBe('2025-06-01');
    });

    it('propagates notFoundInApi from cache to source', () => {
        const sources = [makeSource({ videoId: 'v1', channelId: undefined })];
        const cached = [makeCached({ id: 'v1', channelId: '', notFoundInApi: true })];

        const result = mergeSources(sources, new Map(), cached);
        expect(result[0].notFoundInApi).toBe(true);
    });
});

// ── filterIdsToFetch ─────────────────────────────────────────────────────────

describe('filterIdsToFetch', () => {
    it('returns all IDs when cache is empty', () => {
        const result = filterIdsToFetch(['v1', 'v2', 'v3'], []);
        expect(result).toEqual(['v1', 'v2', 'v3']);
    });

    it('excludes IDs with channelId in cache', () => {
        const cached = [makeCached({ id: 'v1', channelId: 'ch_001' })];
        const result = filterIdsToFetch(['v1', 'v2'], cached);

        expect(result).toEqual(['v2']);
    });

    it('excludes unfindable IDs', () => {
        const cached = [makeCached({ id: 'v1', channelId: '', notFoundInApi: true })];
        const result = filterIdsToFetch(['v1', 'v2'], cached);

        expect(result).toEqual(['v2']);
    });

    it('includes cached IDs that are missing channelId', () => {
        const cached = [makeCached({ id: 'v1', channelId: '' })];
        const result = filterIdsToFetch(['v1'], cached);

        expect(result).toEqual(['v1']);
    });

    it('returns empty array when all IDs are cached', () => {
        const cached = [
            makeCached({ id: 'v1', channelId: 'ch_1' }),
            makeCached({ id: 'v2', channelId: 'ch_2' }),
        ];
        const result = filterIdsToFetch(['v1', 'v2'], cached);

        expect(result).toEqual([]);
    });

    it('handles empty input', () => {
        const result = filterIdsToFetch([], [makeCached()]);
        expect(result).toEqual([]);
    });
});

import { describe, it, expect } from 'vitest';
import {
    aggregateTopSources,
    findBiggestChanges,
    analyzeContent,
    tokenizeTitle,
    findSharedTags,
    type EnrichedVideoData,
    type TopSource,
} from '../suggestedAnalysis.js';
import type { SuggestedVideoRow } from '../csvParser.js';
import type { VideoDelta } from '../delta.js';

// --- Fixtures ---

const makeRow = (videoId: string, views: number, impressions: number, ctr: number | null = null): SuggestedVideoRow => ({
    videoId,
    sourceTitle: `Title for ${videoId}`,
    views,
    impressions,
    ctr,
    avgViewDuration: '0:05:00',
    watchTimeHours: views * 0.1,
});

const makeDelta = (videoId: string, deltaViews: number, deltaImpressions: number): VideoDelta => ({
    videoId,
    sourceTitle: `Title for ${videoId}`,
    views: 100,
    impressions: 200,
    ctr: null,
    avgViewDuration: '0:05:00',
    watchTimeHours: 10,
    deltaViews,
    deltaImpressions,
    deltaCtr: null,
    deltaWatchTimeHours: 0,
    pctViews: deltaViews > 0 ? 50 : -30,
    pctImpressions: null,
});

const makeTopSource = (videoId: string, sourceTitle: string): TopSource => ({
    videoId,
    sourceTitle,
    views: 100,
    impressions: 200,
    ctr: null,
    avgViewDuration: '0:05:00',
    watchTimeHours: 10,
});

// --- tokenizeTitle ---

describe('tokenizeTitle', () => {
    it('lowercases and splits on spaces', () => {
        const tokens = tokenizeTitle('Study Music Piano Lofi');
        expect(tokens).toContain('study');
        expect(tokens).toContain('music');
        expect(tokens).toContain('piano');
        expect(tokens).toContain('lofi');
    });

    it('removes emoji', () => {
        const tokens = tokenizeTitle('📖 study focus 🎹');
        expect(tokens).not.toContain('📖');
        expect(tokens).toContain('study');
        expect(tokens).toContain('focus');
        // 'time' is a stop word — intentionally filtered out
        expect(tokenizeTitle('study time')).not.toContain('time');
    });

    it('filters stop words', () => {
        const tokens = tokenizeTitle('this is a test for the algorithm');
        expect(tokens).not.toContain('this');
        expect(tokens).not.toContain('is');
        expect(tokens).not.toContain('a');
        expect(tokens).not.toContain('for');
        expect(tokens).not.toContain('the');
        expect(tokens).toContain('test');
        expect(tokens).toContain('algorithm');
    });

    it('filters words shorter than 3 characters', () => {
        const tokens = tokenizeTitle('go do be ok now');
        for (const t of tokens) {
            expect(t.length).toBeGreaterThanOrEqual(3);
        }
    });

    it('preserves Cyrillic words', () => {
        const tokens = tokenizeTitle('Музыка для релакса');
        expect(tokens).toContain('музыка');
        expect(tokens).toContain('релакса');
    });

    it('handles punctuation: pipes, dashes, commas', () => {
        const tokens = tokenizeTitle('lofi - chill | focus, study');
        expect(tokens).toContain('lofi');
        expect(tokens).toContain('chill');
        expect(tokens).toContain('focus');
        expect(tokens).toContain('study');
    });
});

// --- findSharedTags ---

describe('findSharedTags', () => {
    it('finds exact matches', () => {
        const shared = findSharedTags(['lofi', 'study', 'piano'], ['lofi', 'chill']);
        expect(shared).toContain('lofi');
        expect(shared).not.toContain('study');
    });

    it('is case-insensitive', () => {
        const shared = findSharedTags(['Lofi', 'STUDY'], ['lofi', 'study music']);
        expect(shared).toContain('lofi');
    });

    it('trims whitespace before comparing', () => {
        const shared = findSharedTags([' lofi '], ['lofi']);
        expect(shared).toContain('lofi');
    });

    it('returns empty array when no overlap', () => {
        const shared = findSharedTags(['lofi', 'piano'], ['jazz', 'metal']);
        expect(shared).toHaveLength(0);
    });

    it('handles empty arrays gracefully', () => {
        expect(findSharedTags([], ['lofi'])).toHaveLength(0);
        expect(findSharedTags(['lofi'], [])).toHaveLength(0);
        expect(findSharedTags([], [])).toHaveLength(0);
    });
});

// --- aggregateTopSources ---

describe('aggregateTopSources', () => {
    const rows = [
        makeRow('v1', 1000, 5000, 2.0),
        makeRow('v2', 500, 3000, 1.5),
        makeRow('v3', 300, 2000, 1.0),
        makeRow('v4', 100, 800, 0.5),
        makeRow('v5', 50, 200, null),
    ];
    const emptyDeltas = new Map<string, VideoDelta>();

    it('returns top N by views', () => {
        const result = aggregateTopSources(rows, emptyDeltas, { limit: 3, sortBy: 'views' });
        expect(result.topSources).toHaveLength(3);
        expect(result.topSources[0].videoId).toBe('v1');
        expect(result.topSources[1].videoId).toBe('v2');
        expect(result.topSources[2].videoId).toBe('v3');
    });

    it('tail count is rows.length - limit', () => {
        const result = aggregateTopSources(rows, emptyDeltas, { limit: 3, sortBy: 'views' });
        expect(result.tail.count).toBe(2);
    });

    it('tail totalViews sums correctly', () => {
        const result = aggregateTopSources(rows, emptyDeltas, { limit: 3, sortBy: 'views' });
        expect(result.tail.totalViews).toBe(150); // v4=100 + v5=50
    });

    it('tail avgCtr skips null CTR values', () => {
        const result = aggregateTopSources(rows, emptyDeltas, { limit: 3, sortBy: 'views' });
        // tail has v4 (ctr=0.5) and v5 (ctr=null) → avg of [0.5] = 0.5
        expect(result.tail.avgCtr).toBe('0.5%');
    });

    it('tail avgCtr is empty string when all CTRs are null', () => {
        const nullCtrRows = rows.map(r => ({ ...r, ctr: null as null }));
        const result = aggregateTopSources(nullCtrRows, emptyDeltas, { limit: 3, sortBy: 'views' });
        expect(result.tail.avgCtr).toBe('');
    });

    it('sorts by impressions', () => {
        const result = aggregateTopSources(rows, emptyDeltas, { limit: 2, sortBy: 'impressions' });
        expect(result.topSources[0].videoId).toBe('v1');
        expect(result.topSources[1].videoId).toBe('v2');
    });

    it('applies minImpressions filter', () => {
        const result = aggregateTopSources(rows, emptyDeltas, { limit: 10, sortBy: 'views', minImpressions: 1000 });
        const ids = result.topSources.map(r => r.videoId);
        expect(ids).toContain('v1');
        expect(ids).toContain('v2');
        expect(ids).not.toContain('v5'); // 200 impressions
    });

    it('applies minViews filter', () => {
        const result = aggregateTopSources(rows, emptyDeltas, { limit: 10, sortBy: 'views', minViews: 400 });
        expect(result.topSources.map(r => r.videoId)).toEqual(['v1', 'v2']);
    });

    it('attaches delta fields when deltas are present', () => {
        const deltas = new Map([['v1', makeDelta('v1', 500, 2000)]]);
        const result = aggregateTopSources(rows, deltas, { limit: 3, sortBy: 'views' });
        const v1 = result.topSources.find(r => r.videoId === 'v1')!;
        expect(v1.deltaViews).toBe(500);
        expect(v1.deltaImpressions).toBe(2000);
    });

    it('videos without delta have no delta fields', () => {
        const deltas = new Map([['v1', makeDelta('v1', 500, 2000)]]);
        const result = aggregateTopSources(rows, deltas, { limit: 3, sortBy: 'views' });
        const v2 = result.topSources.find(r => r.videoId === 'v2')!;
        expect(v2.deltaViews).toBeUndefined();
    });

    it('sorts by deltaViews, pushes no-delta videos to end', () => {
        const deltas = new Map([
            ['v2', makeDelta('v2', 900, 100)],
            ['v3', makeDelta('v3', 200, 100)],
        ]);
        const result = aggregateTopSources(rows, deltas, { limit: 5, sortBy: 'deltaViews' });
        const ids = result.topSources.map(r => r.videoId);
        // v2 (delta=900) before v3 (delta=200); v1/v4/v5 (no delta) come last
        expect(ids.indexOf('v2')).toBeLessThan(ids.indexOf('v3'));
        expect(ids.indexOf('v3')).toBeLessThan(ids.indexOf('v1'));
    });
});

// --- findBiggestChanges ---

describe('findBiggestChanges', () => {
    it('returns correct movers by absolute deltaViews', () => {
        const deltas = new Map([
            ['a', makeDelta('a', 1000, 500)],
            ['b', makeDelta('b', -800, -200)],
            ['c', makeDelta('c', 200, 5000)],
        ]);
        const changes = findBiggestChanges(deltas, 10);
        const ids = changes.map(c => c.videoId);
        expect(ids).toContain('a');
        expect(ids).toContain('b');
        expect(ids).toContain('c');
        // 'a' (|1000|) should appear before 'b' (|-800|) in sort
        expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
    });

    it('deduplicates when same video appears in both top-by-views and top-by-impressions', () => {
        const deltas = new Map([
            ['star', makeDelta('star', 2000, 3000)], // top both
            ['v2', makeDelta('v2', 100, 200)],
        ]);
        const changes = findBiggestChanges(deltas, 10);
        const starCount = changes.filter(c => c.videoId === 'star').length;
        expect(starCount).toBe(1);
    });

    it('respects limit', () => {
        const deltas = new Map(
            Array.from({ length: 20 }, (_, i) => [
                `v${i}`,
                makeDelta(`v${i}`, (20 - i) * 100, i * 50),
            ])
        );
        const changes = findBiggestChanges(deltas, 5);
        expect(changes.length).toBeLessThanOrEqual(5);
    });

    it('returns empty array for empty deltas', () => {
        expect(findBiggestChanges(new Map(), 10)).toHaveLength(0);
    });
});

// --- analyzeContent ---

describe('analyzeContent', () => {
    const topSources: TopSource[] = [
        makeTopSource('v1', 'peaceful lofi study music playlist'),
        makeTopSource('v2', 'calm piano music for reading and studying'),
        makeTopSource('v3', 'morning chill vibes lofi'),
    ];

    const enrichedData = new Map<string, EnrichedVideoData>([
        ['v1', { videoId: 'v1', tags: ['lofi', 'study', 'music', 'peaceful'], channelTitle: 'ChillBeats' }],
        ['v2', { videoId: 'v2', tags: ['piano', 'calm', 'music', 'reading'], channelTitle: 'PianoStudio' }],
        ['v3', { videoId: 'v3', tags: ['lofi', 'chill', 'morning'], channelTitle: 'ChillBeats' }],
    ]);

    const sourceVideoTags = ['lofi', 'peaceful', 'relax'];
    const sourceVideoTitle = 'peaceful morning lofi playlist';

    it('builds perVideoOverlap for all topSources', () => {
        const result = analyzeContent(sourceVideoTags, sourceVideoTitle, topSources, enrichedData);
        expect(result.perVideoOverlap).toHaveLength(3);
    });

    it('finds shared tags case-insensitively', () => {
        const result = analyzeContent(['Lofi', 'PEACEFUL'], sourceVideoTitle, topSources, enrichedData);
        const v1 = result.perVideoOverlap.find(o => o.videoId === 'v1')!;
        expect(v1.sharedTags).toContain('lofi');
        expect(v1.sharedTags).toContain('peaceful');
    });

    it('finds shared keywords from titles', () => {
        // sourceVideoTitle has tokens: 'peaceful', 'morning', 'lofi', 'playlist'
        const result = analyzeContent(sourceVideoTags, sourceVideoTitle, topSources, enrichedData);
        const v1 = result.perVideoOverlap.find(o => o.videoId === 'v1')!;
        // v1 title "peaceful lofi study music playlist" shares "peaceful", "lofi", "playlist"
        expect(v1.sharedKeywords).toContain('peaceful');
        expect(v1.sharedKeywords).toContain('lofi');
    });

    it('builds channelDistribution correctly', () => {
        const result = analyzeContent(sourceVideoTags, sourceVideoTitle, topSources, enrichedData);
        const ch = result.aggregate.channelDistribution;
        const chillBeats = ch.find(c => c.channelTitle === 'ChillBeats');
        expect(chillBeats?.count).toBe(2); // v1 and v3
        const piano = ch.find(c => c.channelTitle === 'PianoStudio');
        expect(piano?.count).toBe(1);
    });

    it('gracefully skips videos without enrichedData', () => {
        const partialEnriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: ['lofi'], channelTitle: 'ChillBeats' }],
            // v2 and v3 missing
        ]);
        const result = analyzeContent(sourceVideoTags, sourceVideoTitle, topSources, partialEnriched);
        expect(result.perVideoOverlap).toHaveLength(3); // still 3 rows
        const v2 = result.perVideoOverlap.find(o => o.videoId === 'v2')!;
        expect(v2.sharedTags).toHaveLength(0); // no enriched data → no shared tags
    });

    it('aggregates mostFrequentSharedTags sorted by count desc', () => {
        const result = analyzeContent(sourceVideoTags, sourceVideoTitle, topSources, enrichedData);
        const tags = result.aggregate.mostFrequentSharedTags;
        // 'lofi' appears in v1 and v3 (count=2), 'peaceful' only in v1 (count=1)
        const lofiEntry = tags.find(t => t.tag === 'lofi');
        const peacefulEntry = tags.find(t => t.tag === 'peaceful');
        expect(lofiEntry?.count).toBe(2);
        expect(peacefulEntry?.count).toBe(1);
        if (lofiEntry && peacefulEntry) {
            expect(tags.indexOf(lofiEntry)).toBeLessThan(tags.indexOf(peacefulEntry));
        }
    });

    it('aggregates topKeywordsInSuggestedTitles', () => {
        const result = analyzeContent(sourceVideoTags, sourceVideoTitle, topSources, enrichedData);
        const kws = result.aggregate.topKeywordsInSuggestedTitles;
        // 'lofi' appears in v1 ("peaceful lofi study...") and v3 ("morning chill vibes lofi")
        const lofiKw = kws.find(k => k.keyword === 'lofi');
        expect(lofiKw).toBeDefined();
        expect(lofiKw!.count).toBe(2);
    });
});

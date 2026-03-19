import { describe, it, expect } from 'vitest';
import {
    aggregateTopSources,
    findBiggestChanges,
    analyzeContent,
    computeSelfChannelStats,
    computeContentTrajectory,
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

// --- computeSelfChannelStats ---

describe('computeSelfChannelStats', () => {
    const makeSelfTopSource = (videoId: string, impressions: number, views: number): TopSource => ({
        videoId,
        sourceTitle: `Title for ${videoId}`,
        views,
        impressions,
        ctr: null,
        avgViewDuration: '0:05:00',
        watchTimeHours: views * 0.1,
    });

    it('detects high self-channel dominance', () => {
        const topSources = [
            makeSelfTopSource('v1', 5000, 200),
            makeSelfTopSource('v2', 3000, 150),
            makeSelfTopSource('v3', 2000, 100),
            makeSelfTopSource('v4', 1000, 50),
            makeSelfTopSource('v5', 500, 30),
        ];
        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'MyChannel' }],
            ['v2', { videoId: 'v2', tags: [], channelTitle: 'MyChannel' }],
            ['v3', { videoId: 'v3', tags: [], channelTitle: 'MyChannel' }],
            ['v4', { videoId: 'v4', tags: [], channelTitle: 'MyChannel' }],
            ['v5', { videoId: 'v5', tags: [], channelTitle: 'Competitor' }],
        ]);

        const result = computeSelfChannelStats('MyChannel', topSources, enriched);
        expect(result).not.toBeNull();
        expect(result!.selfCount).toBe(4);
        expect(result!.totalEnriched).toBe(5);
        expect(result!.selfPercentageTop).toBe(80);
        expect(result!.selfImpressions).toBe(11000);
        expect(result!.selfViews).toBe(500);
        expect(result!.timeline).toEqual([]); // no snapshot rows → empty timeline
    });

    it('returns zero self-count when no self-channel videos', () => {
        const topSources = [makeSelfTopSource('v1', 5000, 200)];
        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'CompetitorA' }],
        ]);

        const result = computeSelfChannelStats('MyChannel', topSources, enriched);
        expect(result).not.toBeNull();
        expect(result!.selfCount).toBe(0);
        expect(result!.selfPercentageTop).toBe(0);
    });

    it('is case-insensitive for channel matching', () => {
        const topSources = [makeSelfTopSource('v1', 5000, 200)];
        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'MYCHANNEL' }],
        ]);

        const result = computeSelfChannelStats('mychannel', topSources, enriched);
        expect(result).not.toBeNull();
        expect(result!.selfCount).toBe(1);
    });

    it('returns null for empty channel title', () => {
        const topSources = [makeSelfTopSource('v1', 5000, 200)];
        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'SomeChannel' }],
        ]);

        expect(computeSelfChannelStats('', topSources, enriched)).toBeNull();
        expect(computeSelfChannelStats('  ', topSources, enriched)).toBeNull();
    });

    it('selfTopVideos are sorted by impressions desc and limited to 5', () => {
        const topSources = Array.from({ length: 8 }, (_, i) =>
            makeSelfTopSource(`v${i}`, (8 - i) * 1000, (8 - i) * 100)
        );
        const enriched = new Map<string, EnrichedVideoData>(
            topSources.map(s => [s.videoId, { videoId: s.videoId, tags: [], channelTitle: 'Mine' }])
        );

        const result = computeSelfChannelStats('Mine', topSources, enriched);
        expect(result!.selfTopVideos).toHaveLength(5);
        expect(result!.selfTopVideos[0].videoId).toBe('v0'); // 8000 impressions
        expect(result!.selfTopVideos[4].videoId).toBe('v4'); // 4000 impressions
    });

    it('skips videos without enriched data in totalEnriched count', () => {
        const topSources = [
            makeSelfTopSource('v1', 5000, 200),
            makeSelfTopSource('v2', 3000, 150),
            makeSelfTopSource('v3', 2000, 100),
        ];
        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'Mine' }],
            // v2 and v3 have no enriched data
        ]);

        const result = computeSelfChannelStats('Mine', topSources, enriched);
        expect(result!.totalEnriched).toBe(1); // only v1 counted
        expect(result!.selfCount).toBe(1);
        expect(result!.selfPercentageTop).toBe(100);
    });

    it('computes per-snapshot timeline with growing self-channel dominance', () => {
        const topSources = [makeSelfTopSource('v1', 5000, 200)];
        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'Mine' }],
            ['v2', { videoId: 'v2', tags: [], channelTitle: 'Mine' }],
            ['v3', { videoId: 'v3', tags: [], channelTitle: 'CompetitorA' }],
            ['v4', { videoId: 'v4', tags: [], channelTitle: 'CompetitorB' }],
        ]);

        // Snapshot 1: 3 videos, 0 self
        // Snapshot 2: 3 videos, 1 self (v1 appears)
        // Snapshot 3: 3 videos, 2 self (v1 + v2 dominate)
        const snapshotRows: SuggestedVideoRow[][] = [
            [makeRow('v3', 100, 500), makeRow('v4', 80, 400), makeRow('unknown1', 50, 200)],
            [makeRow('v1', 500, 2000), makeRow('v3', 100, 500), makeRow('v4', 80, 400)],
            [makeRow('v1', 2000, 8000), makeRow('v2', 1500, 6000), makeRow('v3', 100, 500)],
        ];
        const dates = ['2025-01-15', '2025-01-22', '2025-02-01'];

        const result = computeSelfChannelStats('Mine', topSources, enriched, snapshotRows, dates);
        expect(result!.timeline).toHaveLength(3);

        // Snapshot 1: v3=CompetitorA, v4=CompetitorB, unknown1=not enriched → 0/2 = 0%
        expect(result!.timeline[0].selfPercentageAll).toBe(0);
        expect(result!.timeline[0].selfCount).toBe(0);

        // Snapshot 2: v1=Mine, v3=CompetitorA, v4=CompetitorB → 1/3 = 33%
        expect(result!.timeline[1].selfPercentageAll).toBe(33);
        expect(result!.timeline[1].selfCount).toBe(1);
        expect(result!.timeline[1].selfImpressions).toBe(2000);

        // Snapshot 3: v1=Mine, v2=Mine, v3=CompetitorA → 2/3 = 67%
        expect(result!.timeline[2].selfPercentageAll).toBe(67);
        expect(result!.timeline[2].selfCount).toBe(2);
        expect(result!.timeline[2].selfImpressions).toBe(14000); // 8000+6000
    });

    it('returns empty timeline when snapshotRows not provided', () => {
        const topSources = [makeSelfTopSource('v1', 5000, 200)];
        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'Mine' }],
        ]);

        const result = computeSelfChannelStats('Mine', topSources, enriched);
        expect(result!.timeline).toEqual([]);
    });
});

// --- computeContentTrajectory ---

describe('computeContentTrajectory', () => {
    const makeRowWithTitle = (videoId: string, title: string, views: number, impressions: number): SuggestedVideoRow => ({
        videoId,
        sourceTitle: title,
        views,
        impressions,
        ctr: null,
        avgViewDuration: '0:05:00',
        watchTimeHours: views * 0.1,
    });

    it('tracks keyword evolution across snapshots', () => {
        const snapshotRows: SuggestedVideoRow[][] = [
            [
                makeRowWithTitle('v1', 'Deep Meditation Music Calm', 100, 500),
                makeRowWithTitle('v2', 'Meditation Ambient Sounds', 80, 400),
            ],
            [
                makeRowWithTitle('v1', 'Deep Meditation Music Calm', 100, 500),
                makeRowWithTitle('v3', 'Lofi Study Beats Mix', 200, 1000),
                makeRowWithTitle('v4', 'Lofi Chill Piano Study', 150, 800),
            ],
        ];
        const dates = ['2025-01-15', '2025-01-22'];
        const enriched = new Map<string, EnrichedVideoData>();

        const result = computeContentTrajectory([], snapshotRows, dates, enriched);
        expect(result).toHaveLength(2);

        // Snapshot 1: "meditation" dominant
        const kw1 = result[0].topKeywords.map(k => k.keyword);
        expect(kw1).toContain('meditation');

        // Snapshot 2: "lofi" + "study" appear
        const kw2 = result[1].topKeywords.map(k => k.keyword);
        expect(kw2).toContain('lofi');
        expect(kw2).toContain('study');

        // totalImpressions grow
        expect(result[0].totalImpressions).toBe(900);
        expect(result[1].totalImpressions).toBe(2300);
    });

    it('computes per-snapshot shared tags from enrichedData', () => {
        const snapshotRows: SuggestedVideoRow[][] = [
            [makeRowWithTitle('v1', 'Some Video', 100, 500)],
            [makeRowWithTitle('v1', 'Some Video', 200, 1000), makeRowWithTitle('v2', 'Another', 150, 800)],
        ];
        const dates = ['2025-01-15', '2025-01-22'];

        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: ['lofi', 'chill', 'study'], channelTitle: 'ChA' }],
            ['v2', { videoId: 'v2', tags: ['lofi', 'piano', 'jazz'], channelTitle: 'ChB' }],
        ]);

        // Source video has tags: ['lofi', 'relax']
        const result = computeContentTrajectory(['lofi', 'relax'], snapshotRows, dates, enriched);

        // Snapshot 1: v1 has 'lofi' shared → 1 shared tag
        expect(result[0].topSharedTags).toEqual([{ tag: 'lofi', count: 1 }]);

        // Snapshot 2: v1 + v2 both share 'lofi' → count=2
        expect(result[1].topSharedTags[0]).toEqual({ tag: 'lofi', count: 2 });
    });

    it('tracks channel distribution shift across snapshots', () => {
        const snapshotRows: SuggestedVideoRow[][] = [
            [makeRowWithTitle('v1', 'A', 100, 500), makeRowWithTitle('v2', 'B', 80, 400)],
            [makeRowWithTitle('v1', 'A', 100, 500), makeRowWithTitle('v3', 'C', 200, 1000), makeRowWithTitle('v4', 'D', 150, 800)],
        ];
        const dates = ['2025-01-15', '2025-01-22'];

        const enriched = new Map<string, EnrichedVideoData>([
            ['v1', { videoId: 'v1', tags: [], channelTitle: 'CompetitorA' }],
            ['v2', { videoId: 'v2', tags: [], channelTitle: 'CompetitorB' }],
            ['v3', { videoId: 'v3', tags: [], channelTitle: 'MyChannel' }],
            ['v4', { videoId: 'v4', tags: [], channelTitle: 'MyChannel' }],
        ]);

        const result = computeContentTrajectory([], snapshotRows, dates, enriched);

        // Snapshot 1: CompetitorA + CompetitorB
        expect(result[0].channelDistribution).toEqual([
            { channelTitle: 'CompetitorA', count: 1 },
            { channelTitle: 'CompetitorB', count: 1 },
        ]);

        // Snapshot 2: MyChannel ×2, CompetitorA ×1
        expect(result[1].channelDistribution[0]).toEqual({ channelTitle: 'MyChannel', count: 2 });
    });

    it('includes topVideos for non-latest snapshots, skips for latest', () => {
        // 12 videos in snapshot 1, 5 in snapshot 2 (latest)
        const rows1: SuggestedVideoRow[] = Array.from({ length: 12 }, (_, i) =>
            makeRowWithTitle(`v${i}`, `Video ${i}`, (12 - i) * 10, (12 - i) * 100),
        );
        const rows2 = [makeRowWithTitle('v0', 'Video 0', 500, 5000)];
        const snapshotRows = [rows1, rows2];
        const dates = ['2025-01-15', '2025-01-22'];
        const enriched = new Map<string, EnrichedVideoData>();

        const result = computeContentTrajectory([], snapshotRows, dates, enriched);

        // Snapshot 1 (non-latest): has topVideos
        expect(result[0].topVideos).toHaveLength(10);
        expect(result[0].topVideos[0].videoId).toBe('v0');
        expect(result[0].topVideos[0].impressions).toBe(1200);
        expect(result[0].tailImpressions).toBe(300); // v10(200) + v11(100)
        expect(result[0].isLatest).toBe(false);

        // Snapshot 2 (latest): empty topVideos — use topSources instead
        expect(result[1].topVideos).toHaveLength(0);
        expect(result[1].tailImpressions).toBe(0);
        expect(result[1].isLatest).toBe(true);
        // But aggregate data is still present
        expect(result[1].totalImpressions).toBe(5000);
    });

    it('computes deltaImpressions vs previous snapshot', () => {
        const snapshotRows: SuggestedVideoRow[][] = [
            [
                makeRowWithTitle('v1', 'Alpha', 100, 800),
                makeRowWithTitle('v2', 'Beta', 80, 600),
            ],
            [
                makeRowWithTitle('v1', 'Alpha', 300, 2000),  // was 800 → delta +1200
                makeRowWithTitle('v3', 'Gamma', 200, 1500),  // new → delta null
            ],
            // Latest — no topVideos
            [makeRowWithTitle('v1', 'Alpha', 500, 5000)],
        ];
        const dates = ['2025-01-15', '2025-01-22', '2025-01-29'];
        const enriched = new Map<string, EnrichedVideoData>();

        const result = computeContentTrajectory([], snapshotRows, dates, enriched);

        // Snapshot 1 (first): all deltas null (no previous)
        expect(result[0].topVideos[0].deltaImpressions).toBeNull();
        expect(result[0].topVideos[1].deltaImpressions).toBeNull();

        // Snapshot 2: v1 grew from 800 to 2000, v3 is new
        const snap2v1 = result[1].topVideos.find(v => v.videoId === 'v1')!;
        expect(snap2v1.deltaImpressions).toBe(1200); // 2000 - 800

        const snap2v3 = result[1].topVideos.find(v => v.videoId === 'v3')!;
        expect(snap2v3.deltaImpressions).toBeNull(); // new video

        // Snapshot 3 (latest): no topVideos
        expect(result[2].topVideos).toHaveLength(0);
        expect(result[2].isLatest).toBe(true);
    });
});

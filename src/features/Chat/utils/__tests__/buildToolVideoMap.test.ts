import { describe, it, expect } from 'vitest';
import { buildToolVideoMap } from '../buildToolVideoMap';
import type { ChatMessage } from '../../../../core/types/chat/chat';

function msg(toolCalls: ChatMessage['toolCalls']): ChatMessage {
    return {
        id: '1',
        role: 'model',
        text: '',
        createdAt: { toDate: () => new Date() } as never,
        toolCalls,
    };
}

describe('buildToolVideoMap', () => {
    it('extracts video from mentionVideo result', () => {
        const messages = [msg([{
            name: 'mentionVideo',
            args: { videoId: 'abc' },
            result: { found: true, videoId: 'abc', title: 'Test', thumbnailUrl: 'http://img.jpg', ownership: 'own-published', channelTitle: 'My Channel' },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(1);
        const v = map.get('abc')!;
        expect(v.title).toBe('Test');
        expect(v.thumbnailUrl).toBe('http://img.jpg');
        expect(v.ownership).toBe('own-published');
        expect(v.channelTitle).toBe('My Channel');
    });

    it('extracts videos from browseChannelVideos result', () => {
        const messages = [msg([{
            name: 'browseChannelVideos',
            args: {},
            result: {
                videos: [
                    { videoId: 'v1', title: 'Video 1', thumbnailUrl: 'http://t1.jpg', viewCount: 1000, publishedAt: '2024-01-01' },
                    { videoId: 'v2', title: 'Video 2', thumbnailUrl: 'http://t2.jpg', viewCount: 2000, publishedAt: '2024-02-01' },
                ],
            },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(2);
        expect(map.get('v1')!.viewCount).toBe(1000);
        expect(map.get('v2')!.publishedAt).toBe('2024-02-01');
    });

    it('extracts videos from getMultipleVideoDetails result', () => {
        const messages = [msg([{
            name: 'getMultipleVideoDetails',
            args: { videoIds: ['v1'] },
            result: {
                videos: [{
                    videoId: 'v1',
                    title: 'Detailed',
                    thumbnailUrl: 'http://t1.jpg',
                    viewCount: 5000,
                    publishedAt: '2024-03-01',
                    duration: 'PT10M',
                    description: 'A description',
                    tags: ['tag1', 'tag2'],
                    ownership: 'own-published',
                    channelTitle: 'Ch',
                }],
            },
        }])];

        const map = buildToolVideoMap(messages);
        const v = map.get('v1')!;

        expect(v.duration).toBe('PT10M');
        expect(v.description).toBe('A description');
        expect(v.tags).toEqual(['tag1', 'tag2']);
        expect(v.viewCount).toBe(5000);
    });

    it('merges data from multiple tools — fills gaps without overwriting', () => {
        const messages = [msg([
            {
                name: 'browseChannelVideos',
                args: {},
                result: {
                    videos: [{ videoId: 'v1', title: 'Browse Title', thumbnailUrl: 'http://browse.jpg', viewCount: 999, publishedAt: '2024-01-01' }],
                },
            },
            {
                name: 'mentionVideo',
                args: { videoId: 'v1' },
                result: { found: true, videoId: 'v1', title: 'Mention Title', thumbnailUrl: 'http://mention.jpg', ownership: 'own-published', channelTitle: 'My Ch' },
            },
        ])];

        const map = buildToolVideoMap(messages);
        const v = map.get('v1')!;

        // browse set first: title and thumbnailUrl kept from browse
        expect(v.title).toBe('Browse Title');
        expect(v.thumbnailUrl).toBe('http://browse.jpg');
        // mention fills gaps: ownership and channelTitle
        expect(v.ownership).toBe('own-published');
        expect(v.channelTitle).toBe('My Ch');
        // browse data preserved
        expect(v.viewCount).toBe(999);
        expect(v.publishedAt).toBe('2024-01-01');
    });

    it('skips mentionVideo with found=false', () => {
        const messages = [msg([{
            name: 'mentionVideo',
            args: { videoId: 'missing' },
            result: { found: false, videoId: 'missing', error: 'Not found' },
        }])];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('skips tool calls without result', () => {
        const messages = [msg([{
            name: 'mentionVideo',
            args: { videoId: 'abc' },
            result: undefined,
        }])];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('handles messages without toolCalls', () => {
        const messages: ChatMessage[] = [{
            id: '1',
            role: 'user',
            text: 'hello',
            createdAt: { toDate: () => new Date() } as never,
        }];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('preserves numeric viewCount', () => {
        const messages = [msg([{
            name: 'browseChannelVideos',
            args: {},
            result: { videos: [{ videoId: 'v1', title: 'T', viewCount: 120776 }] },
        }])];

        expect(buildToolVideoMap(messages).get('v1')!.viewCount).toBe(120776);
    });

    // -----------------------------------------------------------------------
    // findSimilarVideos
    // -----------------------------------------------------------------------

    it('extracts videos from findSimilarVideos with channelName via dataFreshness', () => {
        const messages = [msg([{
            name: 'findSimilarVideos',
            args: { videoId: 'ref1' },
            result: {
                similar: [
                    { videoId: 'sim1', title: 'Similar 1', thumbnailUrl: 'https://i.ytimg.com/vi/sim1/mqdefault.jpg', channelId: 'UCabc', viewCount: 50000, publishedAt: '2024-06-01' },
                    { videoId: 'sim2', title: 'Similar 2', thumbnailUrl: 'https://i.ytimg.com/vi/sim2/mqdefault.jpg', channelId: 'UCxyz', viewCount: 30000, publishedAt: '2024-07-01' },
                ],
                dataFreshness: [
                    { channelId: 'UCabc', channelTitle: 'Alpha Channel', lastSynced: '2024-08-01' },
                    { channelId: 'UCxyz', channelTitle: 'Beta Channel', lastSynced: '2024-08-01' },
                ],
            },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(2);
        const s1 = map.get('sim1')!;
        expect(s1.channelTitle).toBe('Alpha Channel');
        expect(s1.ownership).toBe('competitor');
        expect(s1.viewCount).toBe(50000);
        expect(s1.thumbnailUrl).toBe('https://i.ytimg.com/vi/sim1/mqdefault.jpg');

        const s2 = map.get('sim2')!;
        expect(s2.channelTitle).toBe('Beta Channel');
    });

    it('extracts deltas from findSimilarVideos', () => {
        const messages = [msg([{
            name: 'findSimilarVideos',
            args: { videoId: 'ref1' },
            result: {
                similar: [
                    {
                        videoId: 'sim1', title: 'Similar',
                        viewDelta24h: 1200, viewDelta7d: 8500, viewDelta30d: 45000,
                        channelId: 'UCabc', viewCount: 100000,
                    },
                ],
                dataFreshness: [{ channelId: 'UCabc', channelTitle: 'Ch' }],
            },
        }])];

        const map = buildToolVideoMap(messages);
        const v = map.get('sim1')!;

        expect(v.delta24h).toBe(1200);
        expect(v.delta7d).toBe(8500);
        expect(v.delta30d).toBe(45000);
    });

    it('findSimilarVideos uses channelTitle from result when available', () => {
        const messages = [msg([{
            name: 'findSimilarVideos',
            args: { videoId: 'ref1' },
            result: {
                similar: [
                    { videoId: 'sim1', title: 'Similar', channelId: 'UCabc', channelTitle: 'Direct Title', viewCount: 100 },
                ],
                dataFreshness: [{ channelId: 'UCabc', channelTitle: 'Freshness Title' }],
            },
        }])];

        const map = buildToolVideoMap(messages);
        // channelTitle from the similar item takes precedence
        expect(map.get('sim1')!.channelTitle).toBe('Direct Title');
    });

    // -----------------------------------------------------------------------
    // browseTrendVideos
    // -----------------------------------------------------------------------

    it('extracts videos from browseTrendVideos with deltas', () => {
        const messages = [msg([{
            name: 'browseTrendVideos',
            args: {},
            result: {
                videos: [
                    {
                        videoId: 'tv1', title: 'Trend Video 1', channelTitle: 'Competitor A',
                        thumbnailUrl: 'http://thumb.jpg', viewCount: 250000,
                        publishedAt: '2024-05-15',
                        viewDelta24h: 5000, viewDelta7d: 30000, viewDelta30d: null,
                    },
                    {
                        videoId: 'tv2', title: 'Trend Video 2', channelTitle: 'Competitor B',
                        thumbnailUrl: 'https://i.ytimg.com/vi/tv2/mqdefault.jpg',
                        viewCount: 80000, publishedAt: '2024-06-01',
                        viewDelta24h: null, viewDelta7d: null, viewDelta30d: null,
                    },
                ],
                totalMatched: 50,
            },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(2);

        const tv1 = map.get('tv1')!;
        expect(tv1.title).toBe('Trend Video 1');
        expect(tv1.channelTitle).toBe('Competitor A');
        expect(tv1.ownership).toBe('competitor');
        expect(tv1.viewCount).toBe(250000);
        expect(tv1.thumbnailUrl).toBe('http://thumb.jpg');
        expect(tv1.delta24h).toBe(5000);
        expect(tv1.delta7d).toBe(30000);
        expect(tv1.delta30d).toBeNull();

        const tv2 = map.get('tv2')!;
        expect(tv2.thumbnailUrl).toBe('https://i.ytimg.com/vi/tv2/mqdefault.jpg');
        expect(tv2.delta24h).toBeNull();
    });

    // -----------------------------------------------------------------------
    // getNicheSnapshot
    // -----------------------------------------------------------------------

    it('extracts videos from getNicheSnapshot with channelTitle inheritance', () => {
        const messages = [msg([{
            name: 'getNicheSnapshot',
            args: { date: '2024-07-01' },
            result: {
                competitorActivity: [
                    {
                        channelTitle: 'Channel Alpha',
                        videosPublished: 2,
                        videos: [
                            { videoId: 'ns1', title: 'Niche Video 1', thumbnailUrl: 'https://i.ytimg.com/vi/ns1/mqdefault.jpg', viewCount: 15000, publishedAt: '2024-07-01', viewDelta24h: 800, viewDelta7d: null, viewDelta30d: null },
                            { videoId: 'ns2', title: 'Niche Video 2', thumbnailUrl: 'https://i.ytimg.com/vi/ns2/mqdefault.jpg', viewCount: 22000, publishedAt: '2024-07-02', viewDelta24h: null, viewDelta7d: 5000, viewDelta30d: null },
                        ],
                    },
                    {
                        channelTitle: 'Channel Beta',
                        videosPublished: 1,
                        videos: [
                            { videoId: 'ns3', title: 'Niche Video 3', thumbnailUrl: 'https://i.ytimg.com/vi/ns3/mqdefault.jpg', viewCount: 90000, publishedAt: '2024-06-30', viewDelta24h: 3000, viewDelta7d: 20000, viewDelta30d: 60000 },
                        ],
                    },
                ],
            },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(3);

        const ns1 = map.get('ns1')!;
        expect(ns1.channelTitle).toBe('Channel Alpha');
        expect(ns1.ownership).toBe('competitor');
        expect(ns1.viewCount).toBe(15000);
        expect(ns1.thumbnailUrl).toBe('https://i.ytimg.com/vi/ns1/mqdefault.jpg');
        expect(ns1.delta24h).toBe(800);

        const ns3 = map.get('ns3')!;
        expect(ns3.channelTitle).toBe('Channel Beta');
        expect(ns3.delta30d).toBe(60000);
    });

    // -----------------------------------------------------------------------
    // searchDatabase
    // -----------------------------------------------------------------------

    it('extracts videos from searchDatabase results', () => {
        const messages = [msg([{
            name: 'searchDatabase',
            args: { query: 'cooking tutorial' },
            result: {
                query: 'cooking tutorial',
                results: [
                    { videoId: 'sd1', title: 'Search Result 1', channelTitle: 'Cooking Channel', viewCount: 500000, publishedAt: '2024-04-10' },
                    { videoId: 'sd2', title: 'Search Result 2', channelTitle: 'Food Network', viewCount: 120000, publishedAt: '2024-05-20' },
                ],
                totalFound: 15,
            },
        }])];

        const map = buildToolVideoMap(messages);

        expect(map.size).toBe(2);
        const sd1 = map.get('sd1')!;
        expect(sd1.title).toBe('Search Result 1');
        expect(sd1.channelTitle).toBe('Cooking Channel');
        expect(sd1.ownership).toBe('competitor');
        expect(sd1.viewCount).toBe(500000);
        expect(sd1.publishedAt).toBe('2024-04-10');
    });

    it('extracts deltas from searchDatabase results', () => {
        const messages = [msg([{
            name: 'searchDatabase',
            args: { query: 'test' },
            result: {
                query: 'test',
                results: [
                    {
                        videoId: 'sd1', title: 'Result',
                        viewDelta24h: 300, viewDelta7d: 2100, viewDelta30d: 9000,
                        viewCount: 50000,
                    },
                ],
            },
        }])];

        const map = buildToolVideoMap(messages);
        const v = map.get('sd1')!;

        expect(v.delta24h).toBe(300);
        expect(v.delta7d).toBe(2100);
        expect(v.delta30d).toBe(9000);
    });

    // -----------------------------------------------------------------------
    // Delta merge: first-write-wins
    // -----------------------------------------------------------------------

    it('delta merge: first tool sets deltas, second tool does not overwrite', () => {
        const messages = [msg([
            {
                name: 'browseTrendVideos',
                args: {},
                result: {
                    videos: [
                        { videoId: 'v1', title: 'Trend', viewCount: 100000, viewDelta24h: 5000, viewDelta7d: 30000, viewDelta30d: 90000 },
                    ],
                },
            },
            {
                name: 'findSimilarVideos',
                args: { videoId: 'ref' },
                result: {
                    similar: [
                        { videoId: 'v1', title: 'Similar', viewCount: 100000, viewDelta24h: 9999, viewDelta7d: 9999, viewDelta30d: 9999, channelId: 'UC1' },
                    ],
                    dataFreshness: [{ channelId: 'UC1', channelTitle: 'Ch' }],
                },
            },
        ])];

        const map = buildToolVideoMap(messages);
        const v = map.get('v1')!;

        // First-write-wins: browseTrendVideos deltas preserved
        expect(v.delta24h).toBe(5000);
        expect(v.delta7d).toBe(30000);
        expect(v.delta30d).toBe(90000);
    });

    it('delta merge: null deltas from first tool can be filled by second tool', () => {
        const messages = [msg([
            {
                name: 'browseTrendVideos',
                args: {},
                result: {
                    videos: [
                        { videoId: 'v1', title: 'Trend', viewCount: 100000, viewDelta24h: null, viewDelta7d: null, viewDelta30d: null },
                    ],
                },
            },
            {
                name: 'searchDatabase',
                args: { query: 'test' },
                result: {
                    results: [
                        { videoId: 'v1', title: 'Search', viewCount: 100000, viewDelta24h: 500, viewDelta7d: 3000, viewDelta30d: 10000 },
                    ],
                },
            },
        ])];

        const map = buildToolVideoMap(messages);
        const v = map.get('v1')!;

        // null from first tool → filled by second tool
        expect(v.delta24h).toBe(500);
        expect(v.delta7d).toBe(3000);
        expect(v.delta30d).toBe(10000);
    });

    // -----------------------------------------------------------------------
    // Edge cases
    // -----------------------------------------------------------------------

    it('ignores unknown tool names', () => {
        const messages = [msg([{
            name: 'someUnknownTool',
            args: {},
            result: { videos: [{ videoId: 'v1', title: 'Should not appear' }] },
        }])];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('handles empty results arrays gracefully', () => {
        const messages = [msg([
            { name: 'findSimilarVideos', args: {}, result: { similar: [] } },
            { name: 'browseTrendVideos', args: {}, result: { videos: [] } },
            { name: 'getNicheSnapshot', args: {}, result: { competitorActivity: [] } },
            { name: 'searchDatabase', args: {}, result: { results: [] } },
        ])];

        expect(buildToolVideoMap(messages).size).toBe(0);
    });

    it('passes through undefined thumbnailUrl for custom-* IDs (backend resolves to undefined)', () => {
        const messages = [msg([{
            name: 'findSimilarVideos',
            args: { videoId: 'ref' },
            result: {
                similar: [
                    { videoId: 'custom-abc123', title: 'Custom Video', channelId: 'UC1', viewCount: 1000 },
                ],
                dataFreshness: [{ channelId: 'UC1', channelTitle: 'Ch' }],
            },
        }])];

        const map = buildToolVideoMap(messages);
        // Backend returns undefined thumbnailUrl for custom-* via resolveThumbnailUrl
        expect(map.get('custom-abc123')!.thumbnailUrl).toBeUndefined();
    });

    it('getNicheSnapshot handles channel with empty videos array', () => {
        const messages = [msg([{
            name: 'getNicheSnapshot',
            args: { date: '2024-01-01' },
            result: {
                competitorActivity: [
                    { channelTitle: 'Empty Channel', videosPublished: 0, videos: [] },
                    { channelTitle: 'Active Channel', videosPublished: 1, videos: [{ videoId: 'ns1', title: 'Video', viewCount: 5000 }] },
                ],
            },
        }])];

        const map = buildToolVideoMap(messages);
        expect(map.size).toBe(1);
        expect(map.get('ns1')!.channelTitle).toBe('Active Channel');
    });
});

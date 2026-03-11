import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetMultipleVideoDetails } from '../getMultipleVideoDetails.js';
import type { ToolContext } from '../../types.js';

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockGetVideoDetails = vi.fn();

// --- Mock Firestore ---

const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [] });

vi.mock('../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (..._refs: unknown[]) => mockGetAll(..._refs),
        batch: () => ({
            set: mockBatchSet,
            commit: mockBatchCommit,
        }),
        collection: () => ({
            where: () => ({ get: () => Promise.resolve({ docs: [] }) }),
            get: () => mockCollectionGet(),
        }),
    },
}));

// --- Mock YouTubeService (class syntax — matches browseChannelVideos tests) ---

vi.mock('../../../youtube.js', () => ({
    YouTubeService: class {
        getVideoDetails = mockGetVideoDetails;
    },
}));

const CTX: ToolContext = { userId: 'user1', channelId: 'ch1', channelName: 'My Channel' };
const CTX_WITH_YT: ToolContext = { userId: 'user1', channelId: 'ch1', channelName: 'My Channel', youtubeApiKey: 'yt-key' };

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

const MISS = makeSnap(false);

beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
    mockCollectionGet.mockResolvedValue({ docs: [] });
});

// ─────────────────────────────────────────────────────────────────
// Original bugfix tests (thumbnail field)
// ─────────────────────────────────────────────────────────────────

describe('getMultipleVideoDetails — thumbnail field bugfix', () => {
    it('reads thumbnail field (not thumbnailUrl) from Firestore', async () => {
        const snap = makeSnap(true, {
            title: 'Test Video',
            thumbnail: 'https://cdn/real-thumbnail.jpg',
        });

        mockGetAll
            .mockResolvedValueOnce([snap])   // videos/
            .mockResolvedValueOnce([MISS]);  // cached_external/

        const result = await handleGetMultipleVideoDetails({ videoIds: ['vid1'] }, CTX) as {
            videos: Array<{ thumbnailUrl: string }>;
        };

        expect(result.videos[0].thumbnailUrl).toBe('https://cdn/real-thumbnail.jpg');
    });

    it('returns undefined thumbnailUrl when thumbnail field is absent', async () => {
        const snap = makeSnap(true, { title: 'No Thumb' });

        mockGetAll
            .mockResolvedValueOnce([snap])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['vid1'] }, CTX) as {
            videos: Array<{ thumbnailUrl: unknown }>;
        };

        expect(result.videos[0].thumbnailUrl).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────
// Two-collection cascade
// ─────────────────────────────────────────────────────────────────

describe('getMultipleVideoDetails — cascade search', () => {
    it('finds video in cached_external_videos when not in own collection', async () => {
        const extSnap = makeSnap(true, {
            title: 'External Video',
            description: 'Found in external cache',
            tags: ['cached'],
            thumbnail: 'https://ext/thumb.jpg',
        });

        mockGetAll
            .mockResolvedValueOnce([MISS])       // videos/
            .mockResolvedValueOnce([extSnap]);   // cached_external/

        const result = await handleGetMultipleVideoDetails({ videoIds: ['ext1'] }, CTX) as {
            videos: Array<{ videoId: string; title: string }>;
            notFound: string[];
        };

        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].videoId).toBe('ext1');
        expect(result.videos[0].title).toBe('External Video');
        expect(result.notFound).toHaveLength(0);
    });

    it('prefers videos/ over external/', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Own Video' })])           // videos/
            .mockResolvedValueOnce([makeSnap(true, { title: 'External Cache' })]);     // cached_external/

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX) as {
            videos: Array<{ title: string }>;
        };

        expect(result.videos[0].title).toBe('Own Video');
    });

    it('falls back to external/ when videos/ misses', async () => {
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([makeSnap(true, { title: 'External Hit' })]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX) as {
            videos: Array<{ title: string }>;
        };

        expect(result.videos[0].title).toBe('External Hit');
    });
});

// ─────────────────────────────────────────────────────────────────
// YouTube API fallback
// ─────────────────────────────────────────────────────────────────

describe('getMultipleVideoDetails — YouTube API fallback', () => {
    it('fetches from YouTube when all caches miss and API key is present', async () => {
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([MISS]);

        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{
                id: 'yt1',
                snippet: {
                    title: 'YouTube Fetched',
                    description: 'From API',
                    tags: ['yt'],
                    channelTitle: 'Some Channel',
                    publishedAt: '2024-01-15',
                    thumbnails: { medium: { url: 'https://yt/thumb.jpg' } },
                },
                statistics: { viewCount: '1000', likeCount: '50' },
            }],
            quotaUsed: 1,
        });

        const result = await handleGetMultipleVideoDetails({ videoIds: ['yt1'] }, CTX_WITH_YT) as {
            videos: Array<{ videoId: string; title: string }>;
            notFound: string[];
            quotaUsed: number;
        };

        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].videoId).toBe('yt1');
        expect(result.videos[0].title).toBe('YouTube Fetched');
        expect(result.notFound).toHaveLength(0);
        expect(result.quotaUsed).toBe(1);
    });

    it('caches YouTube results in cached_external_videos/', async () => {
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([MISS]);

        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{
                id: 'yt2',
                snippet: {
                    title: 'Cached After Fetch',
                    description: '',
                    tags: [],
                    channelTitle: 'Ch',
                    publishedAt: '2024-02-01',
                    thumbnails: { default: { url: 'https://yt/default.jpg' } },
                },
                statistics: { viewCount: '500', likeCount: '10' },
            }],
            quotaUsed: 1,
        });

        await handleGetMultipleVideoDetails({ videoIds: ['yt2'] }, CTX_WITH_YT);

        expect(mockBatchSet).toHaveBeenCalledTimes(1);
        const [docRef, cacheData] = mockBatchSet.mock.calls[0];
        expect(docRef.path).toContain('cached_external_videos/yt2');
        expect(cacheData.source).toBe('api_fallback');
        expect(cacheData.title).toBe('Cached After Fetch');
        expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });

    it('does not call YouTube when API key is missing', async () => {
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX) as {
            notFound: string[];
            quotaUsed?: number;
        };

        expect(result.notFound).toContain('v1');
        expect(result.quotaUsed).toBeUndefined();
        expect(mockGetVideoDetails).not.toHaveBeenCalled();
    });

    it('does not include quotaUsed when YouTube was not needed', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Cached' })])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX_WITH_YT) as {
            quotaUsed?: number;
        };

        expect(result.quotaUsed).toBeUndefined();
        expect(mockGetVideoDetails).not.toHaveBeenCalled();
    });

    it('handles YouTube API failure gracefully', async () => {
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([MISS]);

        mockGetVideoDetails.mockRejectedValueOnce(new Error('API quota exceeded'));

        const result = await handleGetMultipleVideoDetails({ videoIds: ['fail1'] }, CTX_WITH_YT) as {
            videos: unknown[];
            notFound: string[];
        };

        // Should not crash — returns notFound
        expect(result.notFound).toContain('fail1');
        expect(result.videos).toHaveLength(0);
    });

    it('partially resolves: some from cache, some from YouTube', async () => {
        const cachedSnap = makeSnap(true, { title: 'From Cache' });

        mockGetAll
            .mockResolvedValueOnce([cachedSnap, MISS])  // videos/
            .mockResolvedValueOnce([MISS, MISS]);        // cached_external/

        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{
                id: 'api1',
                snippet: {
                    title: 'From YouTube',
                    description: '',
                    tags: [],
                    channelTitle: 'Ch',
                    publishedAt: '2024-03-01',
                    thumbnails: {},
                },
                statistics: { viewCount: '100', likeCount: '5' },
            }],
            quotaUsed: 1,
        });

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ['cached1', 'api1'] },
            CTX_WITH_YT,
        ) as {
            videos: Array<{ videoId: string; title: string }>;
            notFound: string[];
            quotaUsed: number;
        };

        expect(result.videos).toHaveLength(2);
        expect(result.videos.find(v => v.videoId === 'cached1')?.title).toBe('From Cache');
        expect(result.videos.find(v => v.videoId === 'api1')?.title).toBe('From YouTube');
        expect(result.notFound).toHaveLength(0);
        expect(result.quotaUsed).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────
// Competitor video via trendChannels (Step 3 resolver)
// ─────────────────────────────────────────────────────────────────

describe('getMultipleVideoDetails — competitor video from trendChannels', () => {
    it('resolves competitor video with external ownership, skips YouTube API', async () => {
        // Step 1: not found in own or external
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([MISS]);

        // Step 3: one trend channel
        mockCollectionGet.mockResolvedValueOnce({
            docs: [{ id: 'UCcompetitor' }],
        });

        // Step 3: getAll finds the video
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, {
                title: 'Competitor Hit',
                thumbnail: 'https://comp/thumb.jpg',
                channelId: 'UCcompetitor',
                viewCount: 50000,
                tags: ['trending'],
            }),
        ]);

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ['comp1'] },
            CTX_WITH_YT,
        ) as {
            videos: Array<{ videoId: string; title: string; ownership: string; channelId: string }>;
            notFound: string[];
            quotaUsed?: number;
        };

        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].videoId).toBe('comp1');
        expect(result.videos[0].title).toBe('Competitor Hit');
        expect(result.videos[0].ownership).toBe('external');
        expect(result.videos[0].channelId).toBe('UCcompetitor');
        expect(result.notFound).toHaveLength(0);
        // YouTube API should NOT be called — video was resolved from trendChannels
        expect(mockGetVideoDetails).not.toHaveBeenCalled();
        expect(result.quotaUsed).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────
// Ownership detection (isCustom + channelName match)
// ─────────────────────────────────────────────────────────────────

describe('getMultipleVideoDetails — ownership detection', () => {
    it('returns own-published for custom video with publishedVideoId', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'My Custom', isCustom: true, publishedVideoId: 'yt1' })])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX) as {
            videos: Array<{ ownership: string }>;
        };

        expect(result.videos[0].ownership).toBe('own-published');
    });

    it('returns own-draft for custom video without publishedVideoId', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Draft', isCustom: true })])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX) as {
            videos: Array<{ ownership: string }>;
        };

        expect(result.videos[0].ownership).toBe('own-draft');
    });

    it('returns own-published for non-custom video matching channel name', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'My YT Video', channelTitle: 'My Channel' })])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX) as {
            videos: Array<{ ownership: string }>;
        };

        expect(result.videos[0].ownership).toBe('own-published');
    });

    it('returns external for non-custom video in videos/ not matching channel name', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Competitor', channelTitle: 'Other Channel' })])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, CTX) as {
            videos: Array<{ ownership: string }>;
        };

        expect(result.videos[0].ownership).toBe('external');
    });

    it('returns external when channelName is not set in context', async () => {
        const ctxNoName: ToolContext = { userId: 'user1', channelId: 'ch1' };
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Video', channelTitle: 'Some Channel' })])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['v1'] }, ctxNoName) as {
            videos: Array<{ ownership: string }>;
        };

        expect(result.videos[0].ownership).toBe('external');
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetMultipleVideoDetails } from '../getMultipleVideoDetails.js';
import type { ToolContext } from '../../../types.js';

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockGetVideoDetails = vi.fn();

// --- Mock Firestore ---

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (..._refs: unknown[]) => mockGetAll(..._refs),
        batch: () => ({
            set: mockBatchSet,
            commit: mockBatchCommit,
        }),
        collection: () => ({
            where: () => ({ get: () => Promise.resolve({ docs: [] }) }),
        }),
    },
}));

vi.mock('../../../../youtube.js', () => ({
    YouTubeService: class {
        getVideoDetails = mockGetVideoDetails;
    },
}));

vi.mock('../../../utils/fetchThumbnailDescriptions.js', () => ({
    fetchThumbnailDescriptions: vi.fn().mockResolvedValue(new Map()),
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
});

// ─────────────────────────────────────────────────────────────────
// commentCount in formatVideoData
// ─────────────────────────────────────────────────────────────────

describe('getMultipleVideoDetails — commentCount', () => {
    it('returns commentCount from Firestore own video', async () => {
        const snap = makeSnap(true, {
            title: 'Own Video',
            commentCount: 42,
        });

        mockGetAll
            .mockResolvedValueOnce([snap])   // videos/
            .mockResolvedValueOnce([MISS]);  // cached_external/

        const result = await handleGetMultipleVideoDetails({ videoIds: ['vid1'] }, CTX) as {
            videos: Array<{ commentCount: number }>;
        };

        expect(result.videos[0].commentCount).toBe(42);
    });

    it('returns commentCount from YouTube API fallback', async () => {
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([MISS]);

        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{
                id: 'yt1',
                snippet: {
                    title: 'YT Video',
                    description: '',
                    tags: [],
                    channelTitle: 'Ch',
                    publishedAt: '2024-01-15',
                    thumbnails: {},
                },
                statistics: { viewCount: '1000', likeCount: '50', commentCount: '123' },
            }],
            quotaUsed: 1,
        });

        const result = await handleGetMultipleVideoDetails({ videoIds: ['yt1'] }, CTX_WITH_YT) as {
            videos: Array<{ commentCount: number }>;
        };

        expect(result.videos[0].commentCount).toBe(123);
    });

    it('caches commentCount in cached_external_videos', async () => {
        mockGetAll
            .mockResolvedValueOnce([MISS])
            .mockResolvedValueOnce([MISS]);

        mockGetVideoDetails.mockResolvedValueOnce({
            videos: [{
                id: 'yt2',
                snippet: {
                    title: 'Cached',
                    description: '',
                    tags: [],
                    channelTitle: 'Ch',
                    publishedAt: '2024-01-15',
                    thumbnails: {},
                },
                statistics: { viewCount: '100', likeCount: '5', commentCount: '77' },
            }],
            quotaUsed: 1,
        });

        await handleGetMultipleVideoDetails({ videoIds: ['yt2'] }, CTX_WITH_YT);

        const [, cacheData] = mockBatchSet.mock.calls[0];
        expect(cacheData.commentCount).toBe(77);
    });

    it('returns undefined commentCount when field is absent', async () => {
        const snap = makeSnap(true, { title: 'No Comments' });

        mockGetAll
            .mockResolvedValueOnce([snap])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['vid1'] }, CTX) as {
            videos: Array<{ commentCount: unknown }>;
        };

        expect(result.videos[0].commentCount).toBeUndefined();
    });
});

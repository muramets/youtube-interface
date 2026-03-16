import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMentionVideo } from '../mentionVideo.js';
import type { ToolContext } from '../../../types.js';

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockWhereGet = vi.fn().mockResolvedValue({ docs: [] });
const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [] });

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        collection: () => ({
            where: () => ({ get: () => mockWhereGet() }),
            get: () => mockCollectionGet(),
        }),
    },
}));

const CTX: ToolContext = { userId: 'user1', channelId: 'ch1', channelName: 'My Channel' };

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockWhereGet.mockResolvedValue({ docs: [] });
    mockCollectionGet.mockResolvedValue({ docs: [] });
});

describe('handleMentionVideo', () => {
    it('returns own-published ownership for custom video with publishedVideoId', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'My Video', thumbnail: 'thumb.jpg', isCustom: true, publishedVideoId: 'yt123' })])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleMentionVideo({ videoId: 'own123' }, CTX);

        expect(result).toEqual({
            found: true,
            videoId: 'own123',
            youtubeVideoId: 'yt123',
            title: 'My Video',
            ownership: 'own-published',
            channelTitle: undefined,
            thumbnailUrl: 'thumb.jpg',
        });
    });

    it('returns own-draft ownership for custom video without publishedVideoId', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Draft Video', thumbnail: 'thumb.jpg', isCustom: true })])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleMentionVideo({ videoId: 'custom-123' }, CTX);

        expect(result).toEqual({
            found: true,
            videoId: 'custom-123',
            title: 'Draft Video',
            ownership: 'own-draft',
            channelTitle: undefined,
            thumbnailUrl: 'thumb.jpg',
        });
    });

    it('returns own-published for non-custom video matching channel name', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'My YT Video', thumbnail: 'thumb.jpg', channelTitle: 'My Channel' })])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleMentionVideo({ videoId: 'yt456' }, CTX);

        expect(result).toEqual({
            found: true,
            videoId: 'yt456',
            title: 'My YT Video',
            ownership: 'own-published',
            channelTitle: 'My Channel',
            thumbnailUrl: 'thumb.jpg',
        });
    });

    it('returns competitor for non-custom video not matching channel name', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Other Video', thumbnail: 'thumb.jpg', channelTitle: 'Other Channel' })])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleMentionVideo({ videoId: 'ext789' }, CTX);

        expect(result).toEqual({
            found: true,
            videoId: 'ext789',
            title: 'Other Video',
            ownership: 'competitor',
            channelTitle: 'Other Channel',
            thumbnailUrl: 'thumb.jpg',
        });
    });

    it('returns competitor ownership for trend_channel source', async () => {
        // Step 1: not found in own or external
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        // Step 3: one trend channel exists
        mockCollectionGet.mockResolvedValueOnce({
            docs: [{ id: 'UCcompetitor' }],
        });

        // Step 3: getAll finds the video in trendChannels
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: 'Competitor Video', thumbnail: 'comp-thumb.jpg' }),
        ]);

        const result = await handleMentionVideo({ videoId: 'comp123' }, CTX);

        expect(result).toEqual({
            found: true,
            videoId: 'comp123',
            title: 'Competitor Video',
            ownership: 'competitor',
            channelTitle: undefined,
            thumbnailUrl: 'comp-thumb.jpg',
        });
    });

    it('returns not found for missing video', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleMentionVideo({ videoId: 'missing' }, CTX);

        expect(result).toEqual({
            found: false,
            videoId: 'missing',
            error: 'Video not found in database',
        });
    });

    it('uses YouTube CDN fallback when thumbnail field is absent', async () => {
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'No Thumb' })])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleMentionVideo({ videoId: 'vid123' }, CTX) as {
            thumbnailUrl: string;
        };

        expect(result.thumbnailUrl).toBe('https://i.ytimg.com/vi/vid123/mqdefault.jpg');
    });

    it('returns error when videoId is missing', async () => {
        const result = await handleMentionVideo({}, CTX);
        expect(result).toHaveProperty('error');
    });
});

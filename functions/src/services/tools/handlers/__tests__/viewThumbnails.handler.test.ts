import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleViewThumbnails } from '../viewThumbnails.js';
import type { ToolContext } from '../../types.js';

// --- Mock Firestore ---

const mockGetAll = vi.fn();
const mockDoc = vi.fn((path: string) => ({ path }));
const mockWhereGet = vi.fn().mockResolvedValue({ docs: [] });
const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [] });

vi.mock('../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => mockDoc(path),
        getAll: (..._refs: unknown[]) => mockGetAll(..._refs),
        collection: () => ({
            where: () => ({
                get: () => mockWhereGet(),
                limit: () => ({ get: () => mockWhereGet() }),
            }),
            get: () => mockCollectionGet(),
        }),
    },
}));

const CTX: ToolContext = { userId: 'user1', channelId: 'ch1' };
const BASE = 'users/user1/channels/ch1';

/** Build a mock Firestore DocumentSnapshot. */
function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockWhereGet.mockResolvedValue({ docs: [] });
    mockCollectionGet.mockResolvedValue({ docs: [] });
});

// --- Tests ---

describe('handleViewThumbnails', () => {
    it('returns error when videoIds is missing', async () => {
        const result = await handleViewThumbnails({}, CTX);
        expect(result).toHaveProperty('error');
    });

    it('returns error when videoIds is empty', async () => {
        const result = await handleViewThumbnails({ videoIds: [] }, CTX);
        expect(result).toHaveProperty('error');
    });

    it('caps at 50 videoIds', async () => {
        const ids = Array.from({ length: 60 }, (_, i) => `v${i}`);
        // Make all snaps return not-found so we don't need full mock data
        const notFoundSnap = makeSnap(false);
        mockGetAll.mockResolvedValue(Array.from({ length: 50 }, () => notFoundSnap));

        await handleViewThumbnails({ videoIds: ids }, CTX);

        // getAll should only be called with 50 refs per collection
        const calls = mockGetAll.mock.calls;
        expect(calls[0].length).toBe(50);
        expect(calls[1].length).toBe(50);
    });

    it('prefers videos/ collection over cached_suggested/', async () => {
        const ids = ['vid1'];
        const videoSnap = makeSnap(true, { title: 'From Videos', thumbnail: 'https://cdn/video.jpg' });
        const suggestedSnap = makeSnap(true, { title: 'From Suggested', thumbnail: 'https://cdn/suggested.jpg' });

        // First call = videoRefs, second = suggestedRefs
        mockGetAll
            .mockResolvedValueOnce([videoSnap])
            .mockResolvedValueOnce([suggestedSnap]);

        const result = await handleViewThumbnails({ videoIds: ids }, CTX) as {
            videos: Array<{ title: string; thumbnailUrl: string }>;
        };

        expect(result.videos[0].title).toBe('From Videos');
        expect(result.videos[0].thumbnailUrl).toBe('https://cdn/video.jpg');
    });

    it('falls back to cached_suggested when videos/ snap not found', async () => {
        const ids = ['vid1'];
        const notFoundSnap = makeSnap(false);
        const suggestedSnap = makeSnap(true, { title: 'Competitor', thumbnail: 'https://cdn/comp.jpg' });

        mockGetAll
            .mockResolvedValueOnce([notFoundSnap])
            .mockResolvedValueOnce([suggestedSnap]);

        const result = await handleViewThumbnails({ videoIds: ids }, CTX) as {
            videos: Array<{ videoId: string; title: string; thumbnailUrl: string }>;
            notFound: string[];
            visualContextUrls: string[];
        };

        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].thumbnailUrl).toBe('https://cdn/comp.jpg');
        expect(result.notFound).toHaveLength(0);
        expect(result.visualContextUrls).toEqual(['https://cdn/comp.jpg']);
    });

    it('reads thumbnail field (not thumbnailUrl) from Firestore', async () => {
        const ids = ['vid1'];
        // Document has `thumbnail` field — no `thumbnailUrl`
        const snap = makeSnap(true, { title: 'Test', thumbnail: 'https://cdn/thumb.jpg' });

        mockGetAll
            .mockResolvedValueOnce([snap])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleViewThumbnails({ videoIds: ids }, CTX) as {
            videos: Array<{ thumbnailUrl: string }>;
        };

        expect(result.videos[0].thumbnailUrl).toBe('https://cdn/thumb.jpg');
    });

    it('adds video to notFound when thumbnail is missing', async () => {
        const ids = ['vid1'];
        const snapNoThumb = makeSnap(true, { title: 'No Thumbnail' }); // no thumbnail field

        mockGetAll
            .mockResolvedValueOnce([snapNoThumb])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleViewThumbnails({ videoIds: ids }, CTX) as {
            videos: unknown[];
            notFound: string[];
        };

        expect(result.videos).toHaveLength(0);
        expect(result.notFound).toContain('vid1');
    });

    it('adds video to notFound when not found in either collection', async () => {
        const ids = ['missing'];
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleViewThumbnails({ videoIds: ids }, CTX) as {
            notFound: string[];
        };

        expect(result.notFound).toContain('missing');
    });

    it('returns visualContextUrls matching videos thumbnails', async () => {
        const ids = ['v1', 'v2'];
        const snaps = [
            makeSnap(true, { title: 'A', thumbnail: 'https://cdn/a.jpg' }),
            makeSnap(true, { title: 'B', thumbnail: 'https://cdn/b.jpg' }),
        ];

        mockGetAll
            .mockResolvedValueOnce(snaps)
            .mockResolvedValueOnce([makeSnap(false), makeSnap(false)]);

        const result = await handleViewThumbnails({ videoIds: ids }, CTX) as {
            visualContextUrls: string[];
        };

        expect(result.visualContextUrls).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
    });

    it('uses correct Firestore paths', async () => {
        const ids = ['vid1'];
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'T', thumbnail: 'https://cdn/t.jpg' })])
            .mockResolvedValueOnce([makeSnap(false)]);

        await handleViewThumbnails({ videoIds: ids }, CTX);

        expect(mockDoc).toHaveBeenCalledWith(`${BASE}/videos/vid1`);
        expect(mockDoc).toHaveBeenCalledWith(`${BASE}/cached_external_videos/vid1`);
    });

    it('resolves title from trendChannels when videos/ and cached_external/ miss', async () => {
        // 1. resolveVideoIdsByTitle: trendChannels list
        // 2. resolver Step 3: trendChannels list (called twice — once per function)
        mockCollectionGet
            .mockResolvedValueOnce({ docs: [{ id: 'UCcomp' }] })   // resolveVideoIdsByTitle
            .mockResolvedValueOnce({ docs: [{ id: 'UCcomp' }] });  // resolver Step 3

        // resolveVideoIdsByTitle: title queries
        // Call 1: videos/ title search → empty
        // Call 2: cached_external/ title search → empty
        // Call 3: trendChannels/UCcomp/videos/ title search → found
        mockWhereGet
            .mockResolvedValueOnce({ docs: [] })
            .mockResolvedValueOnce({ docs: [] })
            .mockResolvedValueOnce({ docs: [{ id: 'compVid' }] });

        // resolver Step 1: compVid not in own or external
        mockGetAll
            .mockResolvedValueOnce([makeSnap(false)])
            .mockResolvedValueOnce([makeSnap(false)]);

        // resolver Step 3: getAll finds compVid
        mockGetAll.mockResolvedValueOnce([
            makeSnap(true, { title: 'Competitor Video', thumbnail: 'https://comp/thumb.jpg' }),
        ]);

        const result = await handleViewThumbnails({ titles: ['Competitor Video'] }, CTX) as {
            videos: Array<{ videoId: string; title: string; thumbnailUrl: string }>;
            visualContextUrls: string[];
            notFound: string[];
        };

        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].videoId).toBe('compVid');
        expect(result.videos[0].thumbnailUrl).toBe('https://comp/thumb.jpg');
        expect(result.visualContextUrls).toEqual(['https://comp/thumb.jpg']);
        expect(result.notFound).toHaveLength(0);
    });
});

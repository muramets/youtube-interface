import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetMultipleVideoDetails } from '../getMultipleVideoDetails.js';
import type { ToolContext } from '../../../types.js';

// --- Mock fns ---

const mockGetAll = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();

// --- Mock Firestore ---

const mockWhere = vi.fn();
const mockCollectionGet = vi.fn().mockResolvedValue({ docs: [] });

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        batch: () => ({
            set: mockBatchSet,
            commit: mockBatchCommit,
        }),
        collection: (path: string) => ({
            where: (field: string, op: string, value: unknown) => {
                mockWhere(path, field, op, value);
                return {
                    limit: () => ({
                        get: () => {
                            // Route based on collection path and query value
                            const key = `${path}|${field}|${value}`;
                            return Promise.resolve(
                                mockWhereResults.get(key) ?? { docs: [] },
                            );
                        },
                    }),
                    get: () => Promise.resolve({ docs: [] }),
                };
            },
            get: () => mockCollectionGet(),
        }),
    },
}));

// --- Mock YouTubeService ---

vi.mock('../../../../youtube.js', () => ({
    YouTubeService: class {
        getVideoDetails = vi.fn().mockResolvedValue({ videos: [], quotaUsed: 0 });
    },
}));

// --- Mock trendSnapshotService ---

vi.mock('../../../../trendSnapshotService.js', () => ({
    getViewDeltas: vi.fn().mockResolvedValue(new Map()),
}));

// --- Helpers ---

const CTX: ToolContext = { userId: 'user1', channelId: 'ch1', channelName: 'My Channel' };

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

const MISS = makeSnap(false);

/** Map of "collectionPath|field|value" → query result */
const mockWhereResults = new Map<string, { docs: Array<{ id: string; data: () => Record<string, unknown> }> }>();

function setTitleResult(collectionPath: string, title: string, docId: string, data: Record<string, unknown>) {
    mockWhereResults.set(`${collectionPath}|title|${title}`, {
        docs: [{ id: docId, data: () => data }],
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockWhereResults.clear();
    mockBatchCommit.mockResolvedValue(undefined);
    mockCollectionGet.mockResolvedValue({ docs: [] });
});

// ─────────────────────────────────────────────────────────────────
// Title resolution
// ─────────────────────────────────────────────────────────────────

describe('getMultipleVideoDetails — title search', () => {
    it('resolves a video by exact title from videos/ collection', async () => {
        const basePath = 'users/user1/channels/ch1';

        // Title search finds the video
        setTitleResult(`${basePath}/videos`, 'My Cool Video', 'vid123', {
            title: 'My Cool Video',
            publishedAt: '2026-02-15T00:00:00Z',
        });

        // resolveVideosByIds finds it by doc ID
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, {
                title: 'My Cool Video',
                publishedAt: '2026-02-15T00:00:00Z',
                channelTitle: 'My Channel',
            })])   // videos/
            .mockResolvedValueOnce([MISS]);  // cached_external/

        const result = await handleGetMultipleVideoDetails(
            { titles: ['My Cool Video'] },
            CTX,
        ) as { videos: Array<{ videoId: string; title: string; publishedAt: string }>; notFound: string[] };

        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].videoId).toBe('vid123');
        expect(result.videos[0].title).toBe('My Cool Video');
        expect(result.videos[0].publishedAt).toBe('2026-02-15T00:00:00Z');
        expect(result.notFound).toHaveLength(0);
    });

    it('returns notFoundTitles when title is not in any collection', async () => {
        // No title matches anywhere, trendChannels empty
        mockCollectionGet.mockResolvedValue({ docs: [] });

        const result = await handleGetMultipleVideoDetails(
            { titles: ['Nonexistent Video'] },
            CTX,
        ) as { videos: unknown[]; notFoundTitles: string[]; error: string };

        expect(result.videos).toHaveLength(0);
        expect(result.notFoundTitles).toContain('Nonexistent Video');
        expect(result.error).toContain('No videos found');
    });

    it('merges titles and videoIds into a single request', async () => {
        const basePath = 'users/user1/channels/ch1';

        // Title resolves to vid-from-title
        setTitleResult(`${basePath}/videos`, 'Title Video', 'vid-from-title', {
            title: 'Title Video',
        });

        // resolveVideosByIds: both vid-from-id and vid-from-title found
        mockGetAll
            .mockResolvedValueOnce([
                makeSnap(true, { title: 'ID Video' }),
                makeSnap(true, { title: 'Title Video', publishedAt: '2026-01-01' }),
            ])
            .mockResolvedValueOnce([MISS, MISS]);

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ['vid-from-id'], titles: ['Title Video'] },
            CTX,
        ) as { videos: Array<{ videoId: string }>; notFound: string[] };

        expect(result.videos).toHaveLength(2);
        const ids = result.videos.map(v => v.videoId);
        expect(ids).toContain('vid-from-id');
        expect(ids).toContain('vid-from-title');
    });

    it('deduplicates when title resolves to same ID as explicit videoId', async () => {
        const basePath = 'users/user1/channels/ch1';

        // Title resolves to the same ID
        setTitleResult(`${basePath}/videos`, 'Same Video', 'same-id', {
            title: 'Same Video',
        });

        // resolveVideosByIds: one video found
        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Same Video' })])
            .mockResolvedValueOnce([MISS]);

        const result = await handleGetMultipleVideoDetails(
            { videoIds: ['same-id'], titles: ['Same Video'] },
            CTX,
        ) as { videos: Array<{ videoId: string }> };

        // Should be 1, not 2 — deduplication
        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].videoId).toBe('same-id');
    });

    it('handles string input defensively (single title as string)', async () => {
        const basePath = 'users/user1/channels/ch1';

        setTitleResult(`${basePath}/videos`, 'Solo Title', 'solo-id', {
            title: 'Solo Title',
        });

        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Solo Title' })])
            .mockResolvedValueOnce([MISS]);

        // Pass string instead of array — should still work
        const result = await handleGetMultipleVideoDetails(
            { titles: 'Solo Title' },
            CTX,
        ) as { videos: Array<{ videoId: string }> };

        expect(result.videos).toHaveLength(1);
        expect(result.videos[0].videoId).toBe('solo-id');
    });

    it('returns error when neither videoIds nor titles provided', async () => {
        const result = await handleGetMultipleVideoDetails({}, CTX) as { error: string };
        expect(result.error).toContain('At least one of videoIds or titles');
    });

    it('does not call YouTube API for title-resolved videos', async () => {
        const basePath = 'users/user1/channels/ch1';

        setTitleResult(`${basePath}/videos`, 'Local Video', 'local-id', {
            title: 'Local Video',
        });

        mockGetAll
            .mockResolvedValueOnce([makeSnap(true, { title: 'Local Video' })])
            .mockResolvedValueOnce([MISS]);

        const ctxWithYT: ToolContext = { ...CTX, youtubeApiKey: 'yt-key' };
        const result = await handleGetMultipleVideoDetails(
            { titles: ['Local Video'] },
            ctxWithYT,
        ) as { quotaUsed?: number };

        // No YouTube API call — video found in Firestore
        expect(result.quotaUsed).toBeUndefined();
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetVideoComments } from '../getVideoComments.js';
import type { ToolContext } from '../../../types.js';

// --- Mock fns ---

const mockGetCommentThreads = vi.fn();

// --- Mock YouTubeService ---

vi.mock('../../../../youtube.js', () => ({
    YouTubeService: class {
        getCommentThreads = mockGetCommentThreads;
    },
}));

const CTX: ToolContext = {
    userId: 'user1',
    channelId: 'ch1',
    youtubeApiKey: 'test-key',
    reportProgress: vi.fn(),
};

const CTX_NO_KEY: ToolContext = { userId: 'user1', channelId: 'ch1' };

function makeComment(text: string, opts?: {
    author?: string;
    authorChannelId?: string;
    likeCount?: number;
    replyCount?: number;
    topReplies?: Array<{ author: string; text: string; likeCount: number; publishedAt: string }>;
}) {
    return {
        author: opts?.author ?? 'User',
        authorChannelId: opts?.authorChannelId,
        text,
        likeCount: opts?.likeCount ?? 0,
        publishedAt: '2024-01-15T10:00:00Z',
        replyCount: opts?.replyCount ?? 0,
        ...(opts?.topReplies ? { topReplies: opts.topReplies } : {}),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

describe('getVideoComments — validation', () => {
    it('returns error when videoId is missing', async () => {
        const result = await handleGetVideoComments({}, CTX);
        expect(result.error).toMatch(/videoId/);
    });

    it('returns error when videoId is empty string', async () => {
        const result = await handleGetVideoComments({ videoId: '  ' }, CTX);
        expect(result.error).toMatch(/videoId/);
    });

    it('returns error when YouTube API key is missing', async () => {
        const result = await handleGetVideoComments({ videoId: 'vid1' }, CTX_NO_KEY);
        expect(result.error).toMatch(/API key/);
    });
});

// ─────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────

describe('getVideoComments — happy path', () => {
    it('returns comments with all fields (1 page, relevance)', async () => {
        mockGetCommentThreads.mockResolvedValueOnce({
            comments: [
                makeComment('Great video!', { author: 'Fan', likeCount: 5, authorChannelId: 'UCfan123' }),
                makeComment('Thanks for sharing', { replyCount: 2 }),
            ],
            totalResults: 150,
            nextPageToken: 'page2token',
            quotaUsed: 1,
        });

        const result = await handleGetVideoComments({ videoId: 'vid1' }, CTX) as Record<string, unknown>;

        expect(result.videoId).toBe('vid1');
        expect(result.totalTopLevelThreads).toBe(150);
        expect(result.fetchedCount).toBe(2);
        expect(result.hasMore).toBe(true);
        expect(result.coveragePercent).toBe(1); // 2/150 rounded
        expect(result.quotaUsed).toBe(1);
        expect(result._systemNote).toBeDefined();

        const comments = result.comments as Array<Record<string, unknown>>;
        expect(comments).toHaveLength(2);
        expect(comments[0].text).toBe('Great video!');
        expect(comments[0].author).toBe('Fan');
        expect(comments[0].authorChannelId).toBe('UCfan123');
    });

    it('sets hasMore=false when no nextPageToken', async () => {
        mockGetCommentThreads.mockResolvedValueOnce({
            comments: [makeComment('Only comment')],
            totalResults: 1,
            quotaUsed: 1,
        });

        const result = await handleGetVideoComments({ videoId: 'vid1' }, CTX) as Record<string, unknown>;
        expect(result.hasMore).toBe(false);
    });

    it('computes coveragePercent correctly', async () => {
        mockGetCommentThreads.mockResolvedValueOnce({
            comments: Array.from({ length: 100 }, (_, i) => makeComment(`Comment ${i}`)),
            totalResults: 200,
            nextPageToken: 'next',
            quotaUsed: 1,
        });

        const result = await handleGetVideoComments({ videoId: 'vid1' }, CTX) as Record<string, unknown>;
        expect(result.coveragePercent).toBe(50); // 100/200
    });

    it('includes _systemNote in response', async () => {
        mockGetCommentThreads.mockResolvedValueOnce({
            comments: [makeComment('Hi')],
            totalResults: 1,
            quotaUsed: 1,
        });

        const result = await handleGetVideoComments({ videoId: 'vid1' }, CTX) as Record<string, unknown>;
        expect(typeof result._systemNote).toBe('string');
        expect((result._systemNote as string).length).toBeGreaterThan(0);
    });
});

// ─────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────

describe('getVideoComments — pagination', () => {
    it('fetches 2 pages when maxPages=2', async () => {
        mockGetCommentThreads
            .mockResolvedValueOnce({
                comments: [makeComment('Page 1')],
                totalResults: 200,
                nextPageToken: 'token2',
                quotaUsed: 1,
            })
            .mockResolvedValueOnce({
                comments: [makeComment('Page 2')],
                totalResults: 200,
                nextPageToken: 'token3',
                quotaUsed: 1,
            });

        const result = await handleGetVideoComments(
            { videoId: 'vid1', maxPages: 2 },
            CTX,
        ) as Record<string, unknown>;

        expect(mockGetCommentThreads).toHaveBeenCalledTimes(2);
        expect(result.fetchedCount).toBe(2);
        expect(result.quotaUsed).toBe(2);
        expect(result.hasMore).toBe(true);
    });

    it('stops early when no more pages (maxPages=3, only 2 available)', async () => {
        mockGetCommentThreads
            .mockResolvedValueOnce({
                comments: [makeComment('Page 1')],
                totalResults: 2,
                nextPageToken: 'token2',
                quotaUsed: 1,
            })
            .mockResolvedValueOnce({
                comments: [makeComment('Page 2')],
                totalResults: 2,
                quotaUsed: 1,
                // no nextPageToken
            });

        const result = await handleGetVideoComments(
            { videoId: 'vid1', maxPages: 3 },
            CTX,
        ) as Record<string, unknown>;

        expect(mockGetCommentThreads).toHaveBeenCalledTimes(2);
        expect(result.hasMore).toBe(false);
    });

    it('reports progress for each page', async () => {
        mockGetCommentThreads
            .mockResolvedValueOnce({
                comments: [makeComment('P1')],
                totalResults: 300,
                nextPageToken: 'token2',
                quotaUsed: 1,
            })
            .mockResolvedValueOnce({
                comments: [makeComment('P2')],
                totalResults: 300,
                nextPageToken: 'token3',
                quotaUsed: 1,
            })
            .mockResolvedValueOnce({
                comments: [makeComment('P3')],
                totalResults: 300,
                quotaUsed: 1,
            });

        await handleGetVideoComments({ videoId: 'vid1', maxPages: 3 }, CTX);

        const reportProgress = CTX.reportProgress as ReturnType<typeof vi.fn>;
        expect(reportProgress).toHaveBeenCalledTimes(3);
        expect(reportProgress).toHaveBeenNthCalledWith(1, 'Reading comments...');
        expect(reportProgress).toHaveBeenNthCalledWith(2, 'Reading more comments (page 2/3)...');
        expect(reportProgress).toHaveBeenNthCalledWith(3, 'Reading more comments (page 3/3)...');
    });
});

// ─────────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────────

describe('getVideoComments — error handling', () => {
    it('returns graceful error when comments disabled (403)', async () => {
        mockGetCommentThreads.mockRejectedValueOnce(
            new Error('The video identified by the videoId parameter has disabled comments.'),
        );

        const result = await handleGetVideoComments({ videoId: 'vid_disabled' }, CTX);
        expect(result.error).toMatch(/disabled/i);
    });

    it('returns error on generic API failure', async () => {
        mockGetCommentThreads.mockRejectedValueOnce(new Error('Network error'));

        const result = await handleGetVideoComments({ videoId: 'vid_fail' }, CTX);
        expect(result.error).toMatch(/Failed to load comments/);
    });
});

// ─────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────

describe('getVideoComments — edge cases', () => {
    it('handles video with 0 comments', async () => {
        mockGetCommentThreads.mockResolvedValueOnce({
            comments: [],
            totalResults: 0,
            quotaUsed: 1,
        });

        const result = await handleGetVideoComments({ videoId: 'vid_empty' }, CTX) as Record<string, unknown>;
        expect(result.comments).toEqual([]);
        expect(result.totalTopLevelThreads).toBe(0);
        expect(result.fetchedCount).toBe(0);
        expect(result.coveragePercent).toBe(0);
    });

    it('passes order=time correctly to API', async () => {
        mockGetCommentThreads.mockResolvedValueOnce({
            comments: [makeComment('Recent')],
            totalResults: 10,
            quotaUsed: 1,
        });

        await handleGetVideoComments({ videoId: 'vid1', order: 'time' }, CTX);

        expect(mockGetCommentThreads).toHaveBeenCalledWith('vid1', expect.objectContaining({
            order: 'time',
        }));
    });

    it('clamps maxPages to 3', async () => {
        mockGetCommentThreads
            .mockResolvedValueOnce({ comments: [makeComment('P1')], totalResults: 500, nextPageToken: 't2', quotaUsed: 1 })
            .mockResolvedValueOnce({ comments: [makeComment('P2')], totalResults: 500, nextPageToken: 't3', quotaUsed: 1 })
            .mockResolvedValueOnce({ comments: [makeComment('P3')], totalResults: 500, nextPageToken: 't4', quotaUsed: 1 });

        await handleGetVideoComments({ videoId: 'vid1', maxPages: 10 }, CTX);

        // Should only call 3 times despite maxPages=10
        expect(mockGetCommentThreads).toHaveBeenCalledTimes(3);
    });

    it('clamps maxResults to 100', async () => {
        mockGetCommentThreads.mockResolvedValueOnce({
            comments: [],
            totalResults: 0,
            quotaUsed: 1,
        });

        await handleGetVideoComments({ videoId: 'vid1', maxResults: 500 }, CTX);

        expect(mockGetCommentThreads).toHaveBeenCalledWith('vid1', expect.objectContaining({
            maxResults: 100,
        }));
    });
});

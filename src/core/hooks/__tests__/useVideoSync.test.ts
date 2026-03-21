// =============================================================================
// useVideoSync.test.ts — Tests for the useVideoSync hook
//
// Covers:
//   - syncVideosWithCrossCache: cross-cache reads, API fallback, quota errors
//   - syncVideo: single video sync, cloned/custom skip, error handling
//   - syncAllVideos: concurrent guard, filtering, notification logic
//   - manualSync: frequency filtering, notification logic
// =============================================================================

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { VideoDetails } from '../../utils/youtubeApi';

// ---------------------------------------------------------------------------
// Mock function handles (must be declared before vi.mock calls)
// ---------------------------------------------------------------------------

const mockFetchTrendChannels = vi.fn();
const mockBatchUpdateVideos = vi.fn();
const mockUpdateVideo = vi.fn();
const mockFetchVideoDetails = vi.fn();
const mockFetchVideosBatch = vi.fn();
const mockAddNotification = vi.fn();
const mockShowToast = vi.fn();
const mockGetDocs = vi.fn();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('firebase/firestore', () => ({
    collection: (...args: unknown[]) => args,
    query: (...args: unknown[]) => args,
    where: (...args: unknown[]) => args,
    documentId: () => '__id__',
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

vi.mock('../../../config/firebase', () => ({
    db: 'mock-db',
}));

vi.mock('../../services/trendService', () => ({
    TrendService: {
        fetchTrendChannels: (...args: unknown[]) => mockFetchTrendChannels(...args),
    },
}));

vi.mock('../../services/videoService', () => ({
    VideoService: {
        batchUpdateVideos: (...args: unknown[]) => mockBatchUpdateVideos(...args),
        updateVideo: (...args: unknown[]) => mockUpdateVideo(...args),
    },
}));

vi.mock('../../utils/youtubeApi', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('../../utils/youtubeApi');
    return {
        ...actual,
        fetchVideoDetails: (...args: unknown[]) => mockFetchVideoDetails(...args),
        fetchVideosBatch: (...args: unknown[]) => mockFetchVideosBatch(...args),
    };
});

vi.mock('../../stores/notificationStore', () => ({
    useNotificationStore: {
        getState: () => ({
            addNotification: mockAddNotification,
        }),
    },
}));

vi.mock('../../stores/uiStore', () => ({
    useUIStore: {
        getState: () => ({
            showToast: mockShowToast,
        }),
    },
}));

import { useVideoSync } from '../useVideoSync';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-1';
const TEST_CHANNEL_ID = 'channel-1';
const API_KEY = 'test-api-key';

function makeVideo(overrides: Partial<VideoDetails> = {}): VideoDetails {
    return {
        id: 'vid-1',
        title: 'Test Video',
        thumbnail: 'thumb.jpg',
        channelId: 'UC-test',
        channelTitle: 'Test Channel',
        channelAvatar: '',
        publishedAt: '2024-01-01T00:00:00Z',
        viewCount: '1000',
        lastUpdated: 1000,
        fetchStatus: 'success',
        ...overrides,
    };
}

function makeQuerySnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
    return {
        docs: docs.map(d => ({
            id: d.id,
            data: () => d.data,
        })),
    };
}

function makeTrendChannel(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        title: `Channel ${id}`,
        avatarUrl: `https://avatar.example/${id}`,
        uploadsPlaylistId: `UU${id}`,
        isVisible: true,
        subscriberCount: 50000,
        lastUpdated: 5000,
        ...overrides,
    };
}

function createWrapper(queryClient: QueryClient) {
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });
}

function setVideosInCache(queryClient: QueryClient, videos: VideoDetails[]) {
    queryClient.setQueryData(['videos', TEST_USER_ID, TEST_CHANNEL_ID], videos);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVideoSync', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        vi.clearAllMocks();
        queryClient = createQueryClient();

        // Default mocks — happy path
        mockFetchTrendChannels.mockResolvedValue([]);
        mockBatchUpdateVideos.mockResolvedValue(undefined);
        mockUpdateVideo.mockResolvedValue(undefined);
        mockFetchVideosBatch.mockResolvedValue([]);
        mockFetchVideoDetails.mockResolvedValue(null);
        mockAddNotification.mockResolvedValue(undefined);
    });

    // =========================================================================
    // syncVideosWithCrossCache
    // =========================================================================

    describe('syncVideosWithCrossCache', () => {
        // syncVideosWithCrossCache is an internal function called by syncAllVideos and manualSync.
        // We test its behavior through those public methods.

        it('uses Trends cache for overlap videos (cache is fresher)', async () => {
            const trendChannel = makeTrendChannel('UC-overlap', { subscriberCount: 75000, avatarUrl: 'https://avatar.example/overlap' });
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            const trendData = {
                title: 'Cached Title',
                thumbnail: 'cached-thumb.jpg',
                viewCount: 5000,
                likeCount: 200,
                duration: 'PT10M',
                description: 'Cached desc',
                tags: ['cached'],
                publishedAt: '2024-06-01T00:00:00Z',
                channelTitle: 'Trend Channel',
                lastUpdated: 9000, // fresher than video.lastUpdated = 1000
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-1', data: trendData }]));

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-overlap', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // batchUpdateVideos called with cache data (not API)
            expect(mockBatchUpdateVideos).toHaveBeenCalled();
            const cacheCall = (mockBatchUpdateVideos as Mock).mock.calls[0];
            expect(cacheCall[0]).toBe(TEST_USER_ID);
            expect(cacheCall[1]).toBe(TEST_CHANNEL_ID);

            const updates = cacheCall[2] as { videoId: string; data: Partial<VideoDetails> }[];
            const update = updates.find(u => u.videoId === 'vid-1');
            expect(update).toBeDefined();
            expect(update!.data.title).toBe('Cached Title');
            expect(update!.data.viewCount).toBe('5000'); // String conversion
            expect(update!.data.likeCount).toBe('200');  // String conversion
            expect(update!.data.channelAvatar).toBe('https://avatar.example/overlap');
            expect(update!.data.subscriberCount).toBe('75000');
            expect(update!.data.fetchStatus).toBe('success');

            // API should NOT have been called since all served from cache
            expect(mockFetchVideosBatch).not.toHaveBeenCalled();
        });

        it('falls back to API when trend data is stale (trendUpdated <= videoUpdated)', async () => {
            const trendChannel = makeTrendChannel('UC-overlap');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            // Trend data older than the video
            const staleTrendData = {
                title: 'Old Title',
                viewCount: 500,
                lastUpdated: 500, // stale: <= video.lastUpdated 1000
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-1', data: staleTrendData }]));

            const apiResult = makeVideo({
                id: 'vid-1',
                channelId: 'UC-overlap',
                title: 'API Title',
                viewCount: '9999',
            });
            mockFetchVideosBatch.mockResolvedValue([apiResult]);

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-overlap', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // API should be called as fallback
            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-1'], API_KEY);
        });

        it('falls back to API when trend doc does not exist', async () => {
            const trendChannel = makeTrendChannel('UC-overlap');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            mockGetDocs.mockResolvedValue(makeQuerySnapshot([]));

            const apiResult = makeVideo({ id: 'vid-1', channelId: 'UC-overlap', title: 'From API' });
            mockFetchVideosBatch.mockResolvedValue([apiResult]);

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-overlap', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-1'], API_KEY);
        });

        it('converts trend data types correctly: String(viewCount), String(likeCount)', async () => {
            const trendChannel = makeTrendChannel('UC-overlap');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            const trendData = {
                title: 'T',
                thumbnail: 't.jpg',
                viewCount: 123456,        // number → should become "123456"
                likeCount: 789,            // number → should become "789"
                duration: 'PT5M',
                description: 'desc',
                tags: [],
                publishedAt: '2024-01-01T00:00:00Z',
                channelTitle: 'Ch',
                lastUpdated: 9000,
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-1', data: trendData }]));

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-overlap', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            const updates = (mockBatchUpdateVideos as Mock).mock.calls[0][2];
            const update = updates.find((u: { videoId: string }) => u.videoId === 'vid-1');
            expect(update.data.viewCount).toBe('123456');
            expect(update.data.likeCount).toBe('789');
        });

        it('gets channelAvatar and subscriberCount from parent TrendChannel doc', async () => {
            const trendChannel = makeTrendChannel('UC-overlap', {
                avatarUrl: 'https://custom-avatar.jpg',
                subscriberCount: 999999,
            });
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            const trendData = {
                title: 'T',
                thumbnail: 't.jpg',
                viewCount: 100,
                lastUpdated: 9000,
                channelTitle: 'Ch',
                publishedAt: '2024-01-01T00:00:00Z',
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-1', data: trendData }]));

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-overlap', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            const updates = (mockBatchUpdateVideos as Mock).mock.calls[0][2];
            const update = updates.find((u: { videoId: string }) => u.videoId === 'vid-1');
            expect(update.data.channelAvatar).toBe('https://custom-avatar.jpg');
            expect(update.data.subscriberCount).toBe('999999');
        });

        it('marks missing API videos as failed', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            // API returns only vid-1, not vid-2
            const apiResult = makeVideo({ id: 'vid-1', title: 'Returned' });
            mockFetchVideosBatch.mockResolvedValue([apiResult]);

            const videos = [
                makeVideo({ id: 'vid-1', channelId: 'UC-api' }),
                makeVideo({ id: 'vid-2', channelId: 'UC-api' }),
            ];
            setVideosInCache(queryClient, videos);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(mockBatchUpdateVideos).toHaveBeenCalled();
            const updates = (mockBatchUpdateVideos as Mock).mock.calls[0][2];
            const failedUpdate = updates.find(
                (u: { videoId: string; data: Partial<VideoDetails> }) => u.videoId === 'vid-2',
            );
            expect(failedUpdate).toBeDefined();
            expect(failedUpdate.data.fetchStatus).toBe('failed');
        });

        it('handles quota error (403) — adds notification, sets hadQuotaError', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            mockFetchVideosBatch.mockRejectedValue(new Error('403 quota exceeded'));

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-api' });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // Quota error notification should be added
            expect(mockAddNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Channel Sync Failed',
                    message: expect.stringContaining('quota'),
                    type: 'error',
                }),
            );

            // No success notification should follow (hadQuotaError = true)
            const successCalls = (mockAddNotification as Mock).mock.calls.filter(
                (call) => call[0]?.type === 'success',
            );
            expect(successCalls).toHaveLength(0);
        });

        it('correctly splits overlap vs apiOnly videos', async () => {
            const trendChannel = makeTrendChannel('UC-trend');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            // Trend doc exists and is fresh for overlap video
            const trendData = {
                title: 'From cache',
                thumbnail: 't.jpg',
                viewCount: 500,
                lastUpdated: 9000,
                channelTitle: 'Ch',
                publishedAt: '2024-01-01T00:00:00Z',
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-trend', data: trendData }]));

            // API result for the non-overlap video
            const apiResult = makeVideo({ id: 'vid-api', channelId: 'UC-other', title: 'From API' });
            mockFetchVideosBatch.mockResolvedValue([apiResult]);

            const overlapVideo = makeVideo({ id: 'vid-trend', channelId: 'UC-trend', lastUpdated: 1000 });
            const apiOnlyVideo = makeVideo({ id: 'vid-api', channelId: 'UC-other', lastUpdated: 1000 });
            setVideosInCache(queryClient, [overlapVideo, apiOnlyVideo]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // Cache update should contain the overlap video
            const cacheCallUpdates = (mockBatchUpdateVideos as Mock).mock.calls[0][2];
            expect(cacheCallUpdates.some((u: { videoId: string }) => u.videoId === 'vid-trend')).toBe(true);

            // API should be called with the non-overlap video
            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-api'], API_KEY);
        });

        it('uses publishedVideoId for Trends cache lookup (custom videos)', async () => {
            const trendChannel = makeTrendChannel('UC-overlap');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            // Trend doc stored under YouTube ID, not internal custom ID
            const trendData = {
                title: 'Cached Custom',
                thumbnail: 'cached-thumb.jpg',
                viewCount: 3000,
                lastUpdated: 9000,
                channelTitle: 'Overlap Ch',
                publishedAt: '2024-06-01T00:00:00Z',
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'yt-real-id', data: trendData }]));

            const customVideo = makeVideo({
                id: 'custom-internal-123',
                channelId: 'UC-overlap',
                isCustom: true,
                publishedVideoId: 'yt-real-id',
                lastUpdated: 1000,
            });
            setVideosInCache(queryClient, [customVideo]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // Should use cache (not API) — query used publishedVideoId to find trend doc
            expect(mockFetchVideosBatch).not.toHaveBeenCalled();

            // batchUpdate should save under internal ID, not YouTube ID
            expect(mockBatchUpdateVideos).toHaveBeenCalled();
            const updates = (mockBatchUpdateVideos as Mock).mock.calls[0][2];
            const update = updates.find((u: { videoId: string }) => u.videoId === 'custom-internal-123');
            expect(update).toBeDefined();
            expect(update!.data.title).toBe('Cached Custom');
            expect(update!.data.viewCount).toBe('3000');
        });
    });

    // =========================================================================
    // syncVideo
    // =========================================================================

    describe('syncVideo', () => {
        it('skips cloned videos (isCloned=true)', async () => {
            const video = makeVideo({ id: 'vid-cloned', isCloned: true });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-cloned', API_KEY);
            });

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
            expect(mockUpdateVideo).not.toHaveBeenCalled();
        });

        it('skips custom videos without publishedVideoId', async () => {
            const video = makeVideo({ id: 'vid-custom', isCustom: true, publishedVideoId: undefined });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-custom', API_KEY);
            });

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });

        it('syncs custom video using publishedVideoId when present', async () => {
            const video = makeVideo({ id: 'vid-custom', isCustom: true, publishedVideoId: 'real-yt-id' });
            setVideosInCache(queryClient, [video]);

            const fetchedDetails = makeVideo({
                id: 'real-yt-id',
                viewCount: '50000',
                title: 'Published Title',
            });
            mockFetchVideoDetails.mockResolvedValue(fetchedDetails);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-custom', API_KEY);
            });

            // Should fetch using publishedVideoId
            expect(mockFetchVideoDetails).toHaveBeenCalledWith('real-yt-id', API_KEY);
            expect(mockUpdateVideo).toHaveBeenCalled();

            // When publishedVideoId is present, only specific fields are updated (not spread)
            const updateData = (mockUpdateVideo as Mock).mock.calls[0][3];
            expect(updateData.viewCount).toBe('50000');
            expect(updateData.fetchStatus).toBe('success');
        });

        it('updates video on successful fetch', async () => {
            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);

            const fetchedDetails = makeVideo({
                id: 'vid-1',
                title: 'Updated Title',
                viewCount: '99999',
            });
            mockFetchVideoDetails.mockResolvedValue(fetchedDetails);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-1', API_KEY);
            });

            expect(mockFetchVideoDetails).toHaveBeenCalledWith('vid-1', API_KEY);
            expect(mockUpdateVideo).toHaveBeenCalledWith(
                TEST_USER_ID,
                TEST_CHANNEL_ID,
                'vid-1',
                expect.objectContaining({
                    fetchStatus: 'success',
                }),
            );
        });

        it('handles VIDEO_NOT_FOUND — marks as failed', async () => {
            const video = makeVideo({ id: 'vid-gone' });
            setVideosInCache(queryClient, [video]);

            mockFetchVideoDetails.mockRejectedValue(new Error('VIDEO_NOT_FOUND'));

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-gone', API_KEY);
            });

            expect(mockUpdateVideo).toHaveBeenCalledWith(
                TEST_USER_ID,
                TEST_CHANNEL_ID,
                'vid-gone',
                expect.objectContaining({
                    fetchStatus: 'failed',
                }),
            );
        });

        it('handles VIDEO_PRIVATE — marks as failed and shows error toast', async () => {
            const video = makeVideo({ id: 'vid-private' });
            setVideosInCache(queryClient, [video]);

            mockFetchVideoDetails.mockRejectedValue(new Error('VIDEO_PRIVATE'));

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-private', API_KEY);
            });

            expect(mockUpdateVideo).toHaveBeenCalledWith(
                TEST_USER_ID,
                TEST_CHANNEL_ID,
                'vid-private',
                expect.objectContaining({ fetchStatus: 'failed' }),
            );
            expect(mockShowToast).toHaveBeenCalledWith(
                'Video is no longer available on YouTube',
                'error',
            );
        });

        it('shows toast on success when not silent', async () => {
            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);
            mockFetchVideoDetails.mockResolvedValue(makeVideo({ id: 'vid-1' }));

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-1', API_KEY);
            });

            expect(mockShowToast).toHaveBeenCalledWith('Video synced successfully', 'success');
        });

        it('does not show toast on success when silent', async () => {
            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);
            mockFetchVideoDetails.mockResolvedValue(makeVideo({ id: 'vid-1' }));

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-1', API_KEY, { silent: true });
            });

            expect(mockShowToast).not.toHaveBeenCalled();
        });

        it('does not show error toast when silent and sync fails', async () => {
            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);
            mockFetchVideoDetails.mockRejectedValue(new Error('NETWORK_ERROR'));

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('vid-1', API_KEY, { silent: true });
            });

            expect(mockShowToast).not.toHaveBeenCalled();
        });

        it('returns early when video not found in query cache', async () => {
            // Empty cache — no videos
            setVideosInCache(queryClient, []);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncVideo('nonexistent-id', API_KEY);
            });

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // syncAllVideos
    // =========================================================================

    describe('syncAllVideos', () => {
        it('guards against concurrent sync (double call is no-op)', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            // Make API call slow enough to detect overlap
            mockFetchVideosBatch.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve([makeVideo()]), 50)),
            );

            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            // Fire two calls simultaneously
            await act(async () => {
                const promise1 = result.current.syncAllVideos(API_KEY);
                const promise2 = result.current.syncAllVideos(API_KEY);
                await Promise.all([promise1, promise2]);
            });

            // fetchTrendChannels should only be called once (second call is guarded)
            expect(mockFetchTrendChannels).toHaveBeenCalledTimes(1);
        });

        it('filters out custom-without-link and cloned videos, keeps custom-with-publishedVideoId', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            const normalVideo = makeVideo({ id: 'vid-normal' });
            const customNoLink = makeVideo({ id: 'vid-custom', isCustom: true });
            const customWithLink = makeVideo({ id: 'vid-linked', isCustom: true, publishedVideoId: 'yt-linked' });
            const clonedVideo = makeVideo({ id: 'vid-cloned', isCloned: true });
            setVideosInCache(queryClient, [normalVideo, customNoLink, customWithLink, clonedVideo]);

            mockFetchVideosBatch.mockResolvedValue([
                makeVideo({ id: 'vid-normal' }),
                makeVideo({ id: 'yt-linked' }),
            ]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // Normal video uses its own id, custom video uses publishedVideoId
            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-normal', 'yt-linked'], API_KEY);
        });

        it('skips custom videos with publishedVideoId when fetchStatus is failed', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            const normalVideo = makeVideo({ id: 'vid-normal' });
            const customFailed = makeVideo({ id: 'vid-failed', isCustom: true, publishedVideoId: 'yt-gone', fetchStatus: 'failed' });
            const customSuccess = makeVideo({ id: 'vid-ok', isCustom: true, publishedVideoId: 'yt-ok', fetchStatus: 'success' });
            setVideosInCache(queryClient, [normalVideo, customFailed, customSuccess]);

            mockFetchVideosBatch.mockResolvedValue([
                makeVideo({ id: 'vid-normal' }),
                makeVideo({ id: 'yt-ok' }),
            ]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // Failed custom video should be excluded, only normal + successful custom synced
            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-normal', 'yt-ok'], API_KEY);
        });

        it('maps YouTube ID back to internal ID for custom videos with publishedVideoId', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            const customVideo = makeVideo({ id: 'internal-123', isCustom: true, publishedVideoId: 'yt-real-id' });
            setVideosInCache(queryClient, [customVideo]);

            const apiResult = makeVideo({ id: 'yt-real-id', viewCount: '50000', title: 'YouTube Title' });
            mockFetchVideosBatch.mockResolvedValue([apiResult]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // API called with YouTube ID
            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['yt-real-id'], API_KEY);

            // But Firestore update uses internal ID
            const updates = (mockBatchUpdateVideos as Mock).mock.calls[0][2];
            const update = updates.find((u: { videoId: string }) => u.videoId === 'internal-123');
            expect(update).toBeDefined();
            expect(update.data.viewCount).toBe('50000');
            expect(update.data.fetchStatus).toBe('success');
        });

        it('no notification when all from cache and 0 quota', async () => {
            const trendChannel = makeTrendChannel('UC-cached');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            const trendData = {
                title: 'Cached',
                thumbnail: 't.jpg',
                viewCount: 100,
                lastUpdated: 9000,
                channelTitle: 'Ch',
                publishedAt: '2024-01-01T00:00:00Z',
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-1', data: trendData }]));

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-cached', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            // No notification — all served from cache, 0 quota
            const successNotifs = (mockAddNotification as Mock).mock.calls.filter(
                (call) => call[0]?.type === 'success',
            );
            expect(successNotifs).toHaveLength(0);
        });

        it('mixed cache notification includes both counts', async () => {
            const trendChannel = makeTrendChannel('UC-cached');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            // Fresh trend data for overlap video
            const trendData = {
                title: 'Cached',
                thumbnail: 't.jpg',
                viewCount: 100,
                lastUpdated: 9000,
                channelTitle: 'Ch',
                publishedAt: '2024-01-01T00:00:00Z',
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-cached', data: trendData }]));

            // API result for non-overlap video
            const apiResult = makeVideo({ id: 'vid-api', channelId: 'UC-other' });
            mockFetchVideosBatch.mockResolvedValue([apiResult]);

            const overlapVideo = makeVideo({ id: 'vid-cached', channelId: 'UC-cached', lastUpdated: 1000 });
            const apiOnlyVideo = makeVideo({ id: 'vid-api', channelId: 'UC-other', lastUpdated: 1000 });
            setVideosInCache(queryClient, [overlapVideo, apiOnlyVideo]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(mockAddNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Channel Sync: 2 videos updated',
                    message: expect.stringContaining('1 from Trends cache'),
                    type: 'success',
                }),
            );
        });

        it('API-only notification (no cache) shows total synced', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            const apiResults = [
                makeVideo({ id: 'vid-1' }),
                makeVideo({ id: 'vid-2' }),
            ];
            mockFetchVideosBatch.mockResolvedValue(apiResults);

            setVideosInCache(queryClient, apiResults);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(mockAddNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Channel Sync: 2 videos updated',
                    message: expect.stringContaining('Successfully synced 2 videos'),
                    type: 'success',
                }),
            );
        });

        it('error notification on failure', async () => {
            mockFetchTrendChannels.mockRejectedValue(new Error('Firestore down'));

            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(mockAddNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Channel Sync Failed',
                    message: 'An error occurred during synchronization.',
                    type: 'error',
                }),
            );
        });

        it('resets isSyncing after completion', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);
            mockFetchVideosBatch.mockResolvedValue([]);

            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            expect(result.current.isSyncing).toBe(false);

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(result.current.isSyncing).toBe(false);
        });

        it('resets isSyncing after error', async () => {
            mockFetchTrendChannels.mockRejectedValue(new Error('boom'));

            const video = makeVideo({ id: 'vid-1' });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(result.current.isSyncing).toBe(false);
        });

        it('returns early when no syncable videos', async () => {
            setVideosInCache(queryClient, [
                makeVideo({ id: 'vid-custom', isCustom: true }),
                makeVideo({ id: 'vid-cloned', isCloned: true }),
            ]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.syncAllVideos(API_KEY);
            });

            expect(mockFetchTrendChannels).not.toHaveBeenCalled();
            expect(mockFetchVideosBatch).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // manualSync
    // =========================================================================

    describe('manualSync', () => {
        it('filters by syncFrequencyHours — only syncs stale videos', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            const now = Date.now();
            const twoHoursAgo = now - 2 * 60 * 60 * 1000;
            const tenHoursAgo = now - 10 * 60 * 60 * 1000;

            const recentVideo = makeVideo({ id: 'vid-recent', lastUpdated: twoHoursAgo });
            const staleVideo = makeVideo({ id: 'vid-stale', lastUpdated: tenHoursAgo });
            setVideosInCache(queryClient, [recentVideo, staleVideo]);

            mockFetchVideosBatch.mockResolvedValue([staleVideo]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                // syncFrequencyHours = 6 → only videos older than 6h should sync
                await result.current.manualSync(API_KEY, 6);
            });

            // Only the stale video should be synced
            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-stale'], API_KEY);
        });

        it('all recently-updated videos — skips sync entirely', async () => {
            const now = Date.now();
            const oneHourAgo = now - 1 * 60 * 60 * 1000;

            const recentVideos = [
                makeVideo({ id: 'vid-1', lastUpdated: oneHourAgo }),
                makeVideo({ id: 'vid-2', lastUpdated: oneHourAgo }),
            ];
            setVideosInCache(queryClient, recentVideos);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.manualSync(API_KEY, 6);
            });

            // No sync needed — all recently updated
            expect(mockFetchTrendChannels).not.toHaveBeenCalled();
            expect(mockFetchVideosBatch).not.toHaveBeenCalled();
            expect(mockAddNotification).not.toHaveBeenCalled();
        });

        it('guards against concurrent sync', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);
            mockFetchVideosBatch.mockImplementation(
                () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
            );

            const staleVideo = makeVideo({ id: 'vid-1', lastUpdated: 1000 });
            setVideosInCache(queryClient, [staleVideo]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                const p1 = result.current.manualSync(API_KEY, 1);
                const p2 = result.current.manualSync(API_KEY, 1);
                await Promise.all([p1, p2]);
            });

            expect(mockFetchTrendChannels).toHaveBeenCalledTimes(1);
        });

        it('filters out custom-without-link and cloned, keeps custom-with-publishedVideoId', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            const normal = makeVideo({ id: 'vid-normal', lastUpdated: 1000 });
            const customNoLink = makeVideo({ id: 'vid-custom', isCustom: true, lastUpdated: 1000 });
            const customWithLink = makeVideo({ id: 'vid-linked', isCustom: true, publishedVideoId: 'yt-linked', lastUpdated: 1000 });
            const cloned = makeVideo({ id: 'vid-cloned', isCloned: true, lastUpdated: 1000 });
            setVideosInCache(queryClient, [normal, customNoLink, customWithLink, cloned]);

            mockFetchVideosBatch.mockResolvedValue([
                makeVideo({ id: 'vid-normal' }),
                makeVideo({ id: 'yt-linked' }),
            ]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.manualSync(API_KEY, 0);
            });

            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-normal', 'yt-linked'], API_KEY);
        });

        it('skips custom videos with publishedVideoId when fetchStatus is failed', async () => {
            mockFetchTrendChannels.mockResolvedValue([]);

            const normal = makeVideo({ id: 'vid-normal', lastUpdated: 1000 });
            const customFailed = makeVideo({ id: 'vid-fail', isCustom: true, publishedVideoId: 'yt-gone', fetchStatus: 'failed', lastUpdated: 1000 });
            const customOk = makeVideo({ id: 'vid-ok', isCustom: true, publishedVideoId: 'yt-ok', fetchStatus: 'success', lastUpdated: 1000 });
            setVideosInCache(queryClient, [normal, customFailed, customOk]);

            mockFetchVideosBatch.mockResolvedValue([
                makeVideo({ id: 'vid-normal' }),
                makeVideo({ id: 'yt-ok' }),
            ]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.manualSync(API_KEY, 0);
            });

            expect(mockFetchVideosBatch).toHaveBeenCalledWith(['vid-normal', 'yt-ok'], API_KEY);
        });

        it('no notification when all from cache and 0 quota', async () => {
            const trendChannel = makeTrendChannel('UC-cached');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            const trendData = {
                title: 'Cached',
                thumbnail: 't.jpg',
                viewCount: 100,
                lastUpdated: 9000,
                channelTitle: 'Ch',
                publishedAt: '2024-01-01T00:00:00Z',
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-1', data: trendData }]));

            const video = makeVideo({ id: 'vid-1', channelId: 'UC-cached', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.manualSync(API_KEY, 0);
            });

            const successNotifs = (mockAddNotification as Mock).mock.calls.filter(
                (call) => call[0]?.type === 'success',
            );
            expect(successNotifs).toHaveLength(0);
        });

        it('mixed cache notification includes both counts', async () => {
            const trendChannel = makeTrendChannel('UC-cached');
            mockFetchTrendChannels.mockResolvedValue([trendChannel]);

            const trendData = {
                title: 'Cached',
                thumbnail: 't.jpg',
                viewCount: 100,
                lastUpdated: 9000,
                channelTitle: 'Ch',
                publishedAt: '2024-01-01T00:00:00Z',
            };
            mockGetDocs.mockResolvedValue(makeQuerySnapshot([{ id: 'vid-cached', data: trendData }]));

            const apiResult = makeVideo({ id: 'vid-api', channelId: 'UC-other' });
            mockFetchVideosBatch.mockResolvedValue([apiResult]);

            const overlapVideo = makeVideo({ id: 'vid-cached', channelId: 'UC-cached', lastUpdated: 1000 });
            const apiOnlyVideo = makeVideo({ id: 'vid-api', channelId: 'UC-other', lastUpdated: 1000 });
            setVideosInCache(queryClient, [overlapVideo, apiOnlyVideo]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.manualSync(API_KEY, 0);
            });

            expect(mockAddNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Channel Sync: 2 videos updated',
                    message: expect.stringContaining('1 from Trends cache'),
                    type: 'success',
                }),
            );
        });

        it('error notification on failure', async () => {
            mockFetchTrendChannels.mockRejectedValue(new Error('Service unavailable'));

            const video = makeVideo({ id: 'vid-1', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.manualSync(API_KEY, 0);
            });

            expect(mockAddNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Channel Sync Failed',
                    type: 'error',
                }),
            );
        });

        it('resets isSyncing in finally block after error', async () => {
            mockFetchTrendChannels.mockRejectedValue(new Error('fail'));

            const video = makeVideo({ id: 'vid-1', lastUpdated: 1000 });
            setVideosInCache(queryClient, [video]);

            const { result } = renderHook(
                () => useVideoSync(TEST_USER_ID, TEST_CHANNEL_ID),
                { wrapper: createWrapper(queryClient) },
            );

            await act(async () => {
                await result.current.manualSync(API_KEY, 0);
            });

            expect(result.current.isSyncing).toBe(false);
        });
    });
});

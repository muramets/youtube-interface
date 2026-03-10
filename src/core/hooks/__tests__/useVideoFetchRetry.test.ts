// =============================================================================
// useVideoFetchRetry.test.ts — retry logic for fetching private/unavailable videos
//
// Verifies:
//   - Filter logic: only retries eligible videos (isCustom, publishedVideoId, etc.)
//   - Retry timing: immediate first attempt, 24h delay for subsequent
//   - Success path: updates Firestore + query cache
//   - Failure path: toast on first failure, info notification, persistent error on final
//   - Display title/thumbnail fallback logic
//   - Guards: no-op when user/channel/apiKey missing
//   - Deduplication: processingRef prevents concurrent retries
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { VideoDetails } from '../../utils/youtubeApi';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDeleteFieldSentinel = Symbol('deleteField');
vi.mock('firebase/firestore', () => ({
    deleteField: () => mockDeleteFieldSentinel,
}));

const mockUpdateVideo = vi.fn().mockResolvedValue(undefined);
vi.mock('../useVideos', () => ({
    useVideos: vi.fn(() => ({
        videos: [] as VideoDetails[],
        updateVideo: mockUpdateVideo,
    })),
}));

const mockUser = { uid: 'user-1' };
vi.mock('../useAuth', () => ({
    useAuth: vi.fn(() => ({ user: mockUser })),
}));

const mockCurrentChannel = { id: 'ch-1' };
vi.mock('../../stores/channelStore', () => ({
    useChannelStore: vi.fn(() => ({ currentChannel: mockCurrentChannel })),
}));

const mockGeneralSettings = { apiKey: 'test-api-key' };
vi.mock('../useSettings', () => ({
    useSettings: vi.fn(() => ({ generalSettings: mockGeneralSettings })),
}));

const mockAddNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('../../stores/notificationStore', () => ({
    useNotificationStore: vi.fn(() => ({ addNotification: mockAddNotification })),
}));

const mockShowToast = vi.fn();
vi.mock('../../stores/uiStore', () => ({
    useUIStore: vi.fn(() => ({ showToast: mockShowToast })),
}));

const mockFetchVideoDetails = vi.fn();
const mockExtractVideoId = vi.fn();
vi.mock('../../utils/youtubeApi', async () => {
    const actual = await vi.importActual<typeof import('../../utils/youtubeApi')>('../../utils/youtubeApi');
    return {
        ...actual,
        fetchVideoDetails: (...args: unknown[]) => mockFetchVideoDetails(...args),
        extractVideoId: (...args: unknown[]) => mockExtractVideoId(...args),
    };
});

// Import after mocks
import { useVideoFetchRetry } from '../useVideoFetchRetry';
import { useVideos } from '../useVideos';
import { useAuth } from '../useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { useSettings } from '../useSettings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

function createWrapper(qc?: QueryClient) {
    const queryClient = qc ?? new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Flush all pending microtasks/promises under fake timers */
async function flush() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

function makeVideo(overrides: Partial<VideoDetails> = {}): VideoDetails {
    return {
        id: 'vid-1',
        title: 'My Video',
        thumbnail: 'thumb.jpg',
        channelId: 'UC-test',
        channelTitle: 'Test Channel',
        channelAvatar: '',
        publishedAt: '2024-01-01',
        isCustom: true,
        publishedVideoId: 'yt-123',
        fetchStatus: 'failed',
        fetchRetryCount: 0,
        lastFetchAttempt: 0,
        ...overrides,
    };
}

function makeYouTubeDetails(): VideoDetails {
    return {
        id: 'yt-123',
        title: 'YouTube Title',
        thumbnail: 'yt-thumb.jpg',
        channelId: 'UC-yt',
        channelTitle: 'YT Channel',
        channelAvatar: 'yt-avatar.jpg',
        publishedAt: '2024-06-01',
        viewCount: '1000',
        duration: 'PT10M',
        description: 'A description',
        tags: ['tag1'],
        likeCount: '50',
        subscriberCount: '500',
        fetchStatus: 'success',
        lastFetchAttempt: Date.now(),
    };
}

function setVideos(videos: VideoDetails[]) {
    vi.mocked(useVideos).mockReturnValue({
        videos,
        updateVideo: mockUpdateVideo,
    } as unknown as ReturnType<typeof useVideos>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVideoFetchRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
        vi.clearAllMocks();

        // Reset mocks to defaults
        vi.mocked(useAuth).mockReturnValue({ user: mockUser } as ReturnType<typeof useAuth>);
        vi.mocked(useChannelStore).mockReturnValue({ currentChannel: mockCurrentChannel } as ReturnType<typeof useChannelStore>);
        vi.mocked(useSettings).mockReturnValue({ generalSettings: mockGeneralSettings } as ReturnType<typeof useSettings>);
        vi.mocked(useVideos).mockReturnValue({
            videos: [],
            updateVideo: mockUpdateVideo,
        } as unknown as ReturnType<typeof useVideos>);

        mockExtractVideoId.mockReturnValue('yt-123');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Filter Logic
    // -----------------------------------------------------------------------

    describe('filter logic', () => {
        it('only retries videos that are isCustom AND have publishedVideoId', async () => {
            const eligible = makeVideo({ id: 'eligible' });
            const notCustom = makeVideo({ id: 'not-custom', isCustom: false });
            const noPublishedId = makeVideo({ id: 'no-pub', publishedVideoId: undefined });

            setVideos([eligible, notCustom, noPublishedId]);
            mockFetchVideoDetails.mockResolvedValue(makeYouTubeDetails());

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).toHaveBeenCalledTimes(1);
            expect(mockFetchVideoDetails).toHaveBeenCalledWith('yt-123', 'test-api-key');
        });

        it('skips videos with fetchStatus: success', async () => {
            setVideos([makeVideo({ fetchStatus: 'success' })]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });

        it('skips videos with fetchStatus: pending', async () => {
            setVideos([makeVideo({ fetchStatus: 'pending' })]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });

        it('skips videos that reached MAX_RETRY_ATTEMPTS (7)', async () => {
            setVideos([makeVideo({ fetchRetryCount: 7 })]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Retry Timing
    // -----------------------------------------------------------------------

    describe('retry timing', () => {
        it('first attempt (retryCount=0) retries immediately', async () => {
            setVideos([makeVideo({ fetchRetryCount: 0 })]);
            mockFetchVideoDetails.mockResolvedValue(makeYouTubeDetails());

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).toHaveBeenCalledTimes(1);
        });

        it('subsequent retries wait 24h — skips if lastFetchAttempt < 24h ago', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 2,
                lastFetchAttempt: now - 12 * HOUR_MS,
            })]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });

        it('retries when 24h has passed since last attempt', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 2,
                lastFetchAttempt: now - 25 * HOUR_MS,
            })]);
            mockFetchVideoDetails.mockResolvedValue(makeYouTubeDetails());

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).toHaveBeenCalledTimes(1);
        });
    });

    // -----------------------------------------------------------------------
    // Success Path
    // -----------------------------------------------------------------------

    describe('success path', () => {
        it('calls updateVideo with YouTube data and cleanup fields on success', async () => {
            setVideos([makeVideo()]);
            const ytDetails = makeYouTubeDetails();
            mockFetchVideoDetails.mockResolvedValue(ytDetails);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockUpdateVideo).toHaveBeenCalledTimes(1);
            const call = mockUpdateVideo.mock.calls[0][0];
            expect(call.videoId).toBe('vid-1');
            expect(call.updates.fetchStatus).toBe('success');
            expect(call.updates.viewCount).toBe(ytDetails.viewCount);
            expect(call.updates.publishedAt).toBe(ytDetails.publishedAt);
            expect(call.updates.duration).toBe(ytDetails.duration);
            expect(call.updates.thumbnail).toBe(ytDetails.thumbnail);
            expect(call.updates.description).toBe(ytDetails.description);
            expect(call.updates.tags).toEqual(ytDetails.tags);
            expect(call.updates.channelTitle).toBe(ytDetails.channelTitle);
            expect(call.updates.channelId).toBe(ytDetails.channelId);
            expect(call.updates.channelAvatar).toBe(ytDetails.channelAvatar);
            expect(call.updates.subscriberCount).toBe(ytDetails.subscriberCount);
            expect(call.updates.likeCount).toBe(ytDetails.likeCount);
            // deleteField() sentinel used for cleanup fields
            expect(call.updates.mergedVideoData).toBe(mockDeleteFieldSentinel);
            expect(call.updates.fetchRetryCount).toBe(mockDeleteFieldSentinel);
            expect(call.updates.lastFetchAttempt).toBe(mockDeleteFieldSentinel);
        });

        it('updates query cache on successful fetch', async () => {
            setVideos([makeVideo()]);
            const ytDetails = makeYouTubeDetails();
            mockFetchVideoDetails.mockResolvedValue(ytDetails);

            const queryClient = new QueryClient({
                defaultOptions: { queries: { retry: false } },
            });
            // Pre-populate cache with the video
            queryClient.setQueryData(['videos', 'user-1', 'ch-1'], [makeVideo()]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper(queryClient) });
            await flush();

            // Verify cache was updated
            const cached = queryClient.getQueryData<VideoDetails[]>(['videos', 'user-1', 'ch-1']);
            expect(cached).toBeDefined();
            expect(cached![0].fetchStatus).toBe('success');
            expect(cached![0].viewCount).toBe(ytDetails.viewCount);
        });
    });

    // -----------------------------------------------------------------------
    // Failure Path — Notifications
    // -----------------------------------------------------------------------

    describe('failure path — notifications', () => {
        it('shows toast on first failure (retryCount=0, initial check)', async () => {
            setVideos([makeVideo({ fetchRetryCount: 0 })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockShowToast).toHaveBeenCalledTimes(1);
            expect(mockShowToast).toHaveBeenCalledWith(
                'Video not available yet. Will retry in 24 hours.',
                'error',
            );
            // Should NOT add a notification for the first toast case
            expect(mockAddNotification).not.toHaveBeenCalled();
        });

        it('adds info notification for intermediate failure', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 3,
                lastFetchAttempt: now - 25 * HOUR_MS,
            })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockAddNotification).toHaveBeenCalledTimes(1);
            const notif = mockAddNotification.mock.calls[0][0];
            expect(notif.type).toBe('info');
            expect(notif.title).toBe('Data update delayed');
            expect(notif.message).toContain('#4');
            expect(notif.message).toContain('My Video');
            expect(notif.internalId).toBe('fetch-retry-vid-1-4');
            expect(notif.category).toBe('video');
            expect(mockShowToast).not.toHaveBeenCalled();
        });

        it('adds persistent error notification on final failure (7th attempt)', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 6,
                lastFetchAttempt: now - 25 * HOUR_MS,
            })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockAddNotification).toHaveBeenCalledTimes(1);
            const notif = mockAddNotification.mock.calls[0][0];
            expect(notif.type).toBe('error');
            expect(notif.title).toBe('Failed to update data for Home Page');
            expect(notif.message).toContain('My Video');
            expect(notif.internalId).toBe('fetch-failed-final-vid-1');
            expect(notif.isPersistent).toBe(true);
            expect(notif.category).toBe('video');
        });

        it('updates Firestore with failure status on fetch error', async () => {
            setVideos([makeVideo({ fetchRetryCount: 0 })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockUpdateVideo).toHaveBeenCalledTimes(1);
            const call = mockUpdateVideo.mock.calls[0][0];
            expect(call.videoId).toBe('vid-1');
            expect(call.updates.fetchStatus).toBe('failed');
            expect(call.updates.fetchRetryCount).toBe(1);
            expect(call.updates.lastFetchAttempt).toBe(Date.now());
        });

        it('treats null fetchVideoDetails result as failure', async () => {
            setVideos([makeVideo({ fetchRetryCount: 0 })]);
            mockFetchVideoDetails.mockResolvedValue(null);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockUpdateVideo).toHaveBeenCalledTimes(1);
            const call = mockUpdateVideo.mock.calls[0][0];
            expect(call.updates.fetchStatus).toBe('failed');
            expect(call.updates.fetchRetryCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Display Title/Thumbnail Logic
    // -----------------------------------------------------------------------

    describe('display title/thumbnail fallback', () => {
        it('uses abTestTitles[0] when available, falls back to video.title', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 3,
                lastFetchAttempt: now - 25 * HOUR_MS,
                abTestTitles: ['AB Title 1', 'AB Title 2'],
                title: 'Original Title',
            })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockAddNotification).toHaveBeenCalledTimes(1);
            expect(mockAddNotification.mock.calls[0][0].message).toContain('AB Title 1');
        });

        it('falls back to video.title when abTestTitles is empty', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 3,
                lastFetchAttempt: now - 25 * HOUR_MS,
                abTestTitles: [],
                title: 'Fallback Title',
            })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockAddNotification).toHaveBeenCalledTimes(1);
            expect(mockAddNotification.mock.calls[0][0].message).toContain('Fallback Title');
        });

        it('uses abTestThumbnails[0] when available', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 3,
                lastFetchAttempt: now - 25 * HOUR_MS,
                abTestThumbnails: ['ab-thumb-1.jpg', 'ab-thumb-2.jpg'],
            })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockAddNotification).toHaveBeenCalledTimes(1);
            expect(mockAddNotification.mock.calls[0][0].thumbnail).toBe('ab-thumb-1.jpg');
        });

        it('falls back to customImage when abTestThumbnails is empty', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 3,
                lastFetchAttempt: now - 25 * HOUR_MS,
                abTestThumbnails: [],
                customImage: 'custom-img.jpg',
                thumbnail: 'default-thumb.jpg',
            })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockAddNotification).toHaveBeenCalledTimes(1);
            expect(mockAddNotification.mock.calls[0][0].thumbnail).toBe('custom-img.jpg');
        });

        it('falls back to video.thumbnail when no customImage or abTestThumbnails', async () => {
            const now = Date.now();
            setVideos([makeVideo({
                fetchRetryCount: 3,
                lastFetchAttempt: now - 25 * HOUR_MS,
                abTestThumbnails: undefined,
                customImage: undefined,
                thumbnail: 'default-thumb.jpg',
            })]);
            mockFetchVideoDetails.mockRejectedValue(new Error('API error'));

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockAddNotification).toHaveBeenCalledTimes(1);
            expect(mockAddNotification.mock.calls[0][0].thumbnail).toBe('default-thumb.jpg');
        });
    });

    // -----------------------------------------------------------------------
    // Guards
    // -----------------------------------------------------------------------

    describe('guards', () => {
        it('does nothing when user is null', async () => {
            vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);
            setVideos([makeVideo()]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });

        it('does nothing when currentChannel is null', async () => {
            vi.mocked(useChannelStore).mockReturnValue({ currentChannel: null } as ReturnType<typeof useChannelStore>);
            setVideos([makeVideo()]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });

        it('does nothing when apiKey is missing', async () => {
            vi.mocked(useSettings).mockReturnValue({ generalSettings: { apiKey: '' } } as ReturnType<typeof useSettings>);
            setVideos([makeVideo()]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Deduplication
    // -----------------------------------------------------------------------

    describe('deduplication', () => {
        it('skips videos already being processed (processingRef)', async () => {
            // Create a long-running fetch that won't resolve until we tell it to
            let resolveFetch!: (value: VideoDetails) => void;
            const longPromise = new Promise<VideoDetails>((resolve) => {
                resolveFetch = resolve;
            });
            mockFetchVideoDetails.mockReturnValue(longPromise);

            setVideos([makeVideo()]);

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });

            // First call is now in-flight
            await flush();
            expect(mockFetchVideoDetails).toHaveBeenCalledTimes(1);

            // Trigger interval (1 hour) — should NOT retry same video
            await act(async () => {
                await vi.advanceTimersByTimeAsync(HOUR_MS);
            });

            // Still only 1 call — the second was skipped because video is in processingRef
            expect(mockFetchVideoDetails).toHaveBeenCalledTimes(1);

            // Resolve to clean up
            resolveFetch(makeYouTubeDetails());
            await flush();
        });
    });

    // -----------------------------------------------------------------------
    // extractVideoId integration
    // -----------------------------------------------------------------------

    describe('extractVideoId usage', () => {
        it('uses extractVideoId result when it returns a value', async () => {
            mockExtractVideoId.mockReturnValue('extracted-id');
            setVideos([makeVideo({ publishedVideoId: 'https://youtube.com/watch?v=extracted-id' })]);
            mockFetchVideoDetails.mockResolvedValue(makeYouTubeDetails());

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).toHaveBeenCalledWith('extracted-id', 'test-api-key');
        });

        it('falls back to raw publishedVideoId when extractVideoId returns null', async () => {
            mockExtractVideoId.mockReturnValue(null);
            setVideos([makeVideo({ publishedVideoId: 'raw-video-id' })]);
            mockFetchVideoDetails.mockResolvedValue(makeYouTubeDetails());

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });
            await flush();

            expect(mockFetchVideoDetails).toHaveBeenCalledWith('raw-video-id', 'test-api-key');
        });
    });

    // -----------------------------------------------------------------------
    // Interval behavior
    // -----------------------------------------------------------------------

    describe('interval behavior', () => {
        it('re-checks every hour via setInterval', async () => {
            const now = Date.now();
            // Video that already had 1 attempt, last attempt was 23h ago (not yet 24h)
            setVideos([makeVideo({
                fetchRetryCount: 1,
                lastFetchAttempt: now - 23 * HOUR_MS,
            })]);
            mockFetchVideoDetails.mockResolvedValue(makeYouTubeDetails());

            renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });

            // Initial run: 23h since last attempt → skip (need 24h)
            await flush();
            expect(mockFetchVideoDetails).not.toHaveBeenCalled();

            // Advance 1 hour → setInterval fires → now 24h has passed → should retry
            await act(async () => {
                await vi.advanceTimersByTimeAsync(HOUR_MS);
            });

            expect(mockFetchVideoDetails).toHaveBeenCalledTimes(1);
        });

        it('cleans up interval on unmount', async () => {
            setVideos([]);
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

            const { unmount } = renderHook(() => useVideoFetchRetry(), { wrapper: createWrapper() });

            unmount();

            expect(clearIntervalSpy).toHaveBeenCalled();
            clearIntervalSpy.mockRestore();
        });
    });
});

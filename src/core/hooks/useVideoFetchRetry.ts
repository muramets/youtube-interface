import { useEffect, useRef } from 'react';
import { deleteField } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { useVideos } from './useVideos';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import { useSettings } from './useSettings';
import { useNotificationStore } from '../stores/notificationStore';
import { useUIStore } from '../stores/uiStore';
import { fetchVideoDetails, extractVideoId, type VideoDetails } from '../utils/youtubeApi';

const MAX_RETRY_ATTEMPTS = 7;
const RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Hook to handle retry logic for fetching private/unavailable videos.
 * 
 * - Checks for videos with publishedVideoId but no mergedVideoData
 * - Retries up to 7 times with 24h intervals
 * - Shows toast for first immediate failure
 * - Shows notifications for subsequent retry failures
 * - Final notification when max attempts reached
 */
export const useVideoFetchRetry = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos, updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { generalSettings } = useSettings();
    const { addNotification } = useNotificationStore();
    const { showToast } = useUIStore();
    const queryClient = useQueryClient();

    const processingRef = useRef(new Set<string>());
    const initialCheckDoneRef = useRef(false);

    useEffect(() => {
        if (!user?.uid || !currentChannel?.id || !generalSettings.apiKey) return;

        const checkAndRetryFetches = async () => {
            const now = Date.now();

            // Find videos that need retry
            const videosNeedingRetry = videos.filter(v =>
                v.isCustom &&
                v.publishedVideoId &&
                !v.mergedVideoData &&
                v.fetchStatus !== 'success' &&
                v.fetchStatus !== 'pending' && // Don't interfere with active user updates
                (v.fetchRetryCount ?? 0) < MAX_RETRY_ATTEMPTS
            );

            for (const video of videosNeedingRetry) {
                // Skip if already processing
                if (processingRef.current.has(video.id)) continue;

                const retryCount = video.fetchRetryCount ?? 0;
                const lastAttempt = video.lastFetchAttempt ?? 0;

                // Check if enough time has passed since last attempt (24h)
                // For first attempt (retryCount=0), always try immediately
                if (retryCount > 0 && (now - lastAttempt) < RETRY_INTERVAL_MS) {
                    continue;
                }

                processingRef.current.add(video.id);

                try {
                    const cleanVideoId = extractVideoId(video.publishedVideoId!) || video.publishedVideoId!;
                    const details = await fetchVideoDetails(cleanVideoId, generalSettings.apiKey!);

                    if (details) {
                        // Immediately update cache with new data
                        queryClient.setQueryData<VideoDetails[]>(['videos', user.uid, currentChannel.id], (old) => {
                            if (!old) return old;
                            return old.map(v => {
                                if (v.id === video.id) {
                                    return {
                                        ...v,
                                        mergedVideoData: details,
                                        fetchStatus: 'success' as const,
                                        fetchRetryCount: undefined,
                                        lastFetchAttempt: undefined
                                    };
                                }
                                return v;
                            });
                        });

                        // Success! Update video with fetched data
                        await updateVideo({
                            videoId: video.id,
                            updates: {
                                mergedVideoData: details,
                                fetchStatus: 'success',
                                fetchRetryCount: deleteField() as unknown as number,
                                lastFetchAttempt: deleteField() as unknown as number
                            }
                        });
                    } else {
                        // Failed to fetch (null return) - treat as failure
                        throw new Error('Video details returned null');
                    }
                } catch (error) {
                    console.error(`Failed to fetch video ${video.id}:`, error);

                    // Immediately update cache to clear mergedVideoData
                    queryClient.setQueryData<VideoDetails[]>(['videos', user.uid, currentChannel.id], (old) => {
                        if (!old) return old;
                        return old.map(v => {
                            if (v.id === video.id) {
                                const { mergedVideoData, ...rest } = v;
                                return {
                                    ...rest,
                                    fetchStatus: 'failed' as const,
                                    fetchRetryCount: retryCount + 1,
                                    lastFetchAttempt: now
                                };
                            }
                            return v;
                        });
                    });

                    // Handle failure (both threw Error or returned null)
                    const newRetryCount = retryCount + 1;
                    const isFinalAttempt = newRetryCount >= MAX_RETRY_ATTEMPTS;

                    await updateVideo({
                        videoId: video.id,
                        updates: {
                            mergedVideoData: deleteField() as any, // Clear potentially stale data
                            fetchStatus: 'failed',
                            fetchRetryCount: newRetryCount,
                            lastFetchAttempt: now
                        }
                    });

                    // Show appropriate notification
                    const displayTitle = (video.abTestTitles && video.abTestTitles.length > 0)
                        ? video.abTestTitles[0]
                        : video.title;

                    const displayThumbnail = (video.abTestThumbnails && video.abTestThumbnails.length > 0)
                        ? video.abTestThumbnails[0]
                        : (video.customImage || video.thumbnail);

                    if (retryCount === 0 && !initialCheckDoneRef.current) {
                        showToast('Video not available yet. Will retry in 24 hours.', 'error');
                    } else if (isFinalAttempt) {
                        await addNotification({
                            title: 'Failed to update data for Home Page',
                            message: `Could not retrieve details for "${displayTitle}". Please check if the video is still available on YouTube.`,
                            type: 'error',
                            internalId: `fetch-failed-final-${video.id}`,
                            link: `/video/${video.channelId}/${video.id}/details?action=update_link`,
                            isPersistent: true,
                            thumbnail: displayThumbnail
                        });
                    } else {
                        // Silent retry failure (info notification)
                        await addNotification({
                            title: 'Data update delayed',
                            message: `Update #${newRetryCount} for "${displayTitle}". Will automatically retry in 24 hours.`,
                            type: 'info',
                            internalId: `fetch-retry-${video.id}-${newRetryCount}`,
                            link: `/video/${video.channelId}/${video.id}/details?action=update_link`,
                            thumbnail: displayThumbnail
                        });
                    }
                } finally {
                    processingRef.current.delete(video.id);
                }
            }

            initialCheckDoneRef.current = true;
        };

        checkAndRetryFetches();

        // Check every hour (to catch when 24h interval passes)
        const interval = setInterval(checkAndRetryFetches, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, [videos, user, currentChannel, generalSettings.apiKey, updateVideo, addNotification, showToast]);
};

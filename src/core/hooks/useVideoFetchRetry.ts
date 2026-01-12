import { useEffect, useRef } from 'react';
import { useVideos } from './useVideos';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import { useSettings } from './useSettings';
import { useNotificationStore } from '../stores/notificationStore';
import { useUIStore } from '../stores/uiStore';
import { fetchVideoDetails } from '../utils/youtubeApi';

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
                    const details = await fetchVideoDetails(video.publishedVideoId!, generalSettings.apiKey!);

                    if (details) {
                        // Success! Update video with fetched data
                        await updateVideo({
                            videoId: video.id,
                            updates: {
                                mergedVideoData: details,
                                fetchStatus: 'success',
                                fetchRetryCount: undefined,
                                lastFetchAttempt: undefined
                            }
                        });
                    } else {
                        // Failed to fetch (null return) - treat as failure
                        throw new Error('Video details returned null');
                    }
                } catch (error) {
                    console.error(`Failed to fetch video ${video.id}:`, error);

                    // Handle failure (both threw Error or returned null)
                    const newRetryCount = retryCount + 1;
                    const isFinalAttempt = newRetryCount >= MAX_RETRY_ATTEMPTS;

                    await updateVideo({
                        videoId: video.id,
                        updates: {
                            fetchStatus: isFinalAttempt ? 'failed' : 'pending',
                            fetchRetryCount: newRetryCount,
                            lastFetchAttempt: now
                        }
                    });

                    // Show appropriate notification
                    if (retryCount === 0 && !initialCheckDoneRef.current) {
                        showToast('Video not available yet. Will retry in 24 hours.', 'error');
                    } else if (isFinalAttempt) {
                        await addNotification({
                            title: 'Video Fetch Failed',
                            message: `Stopped trying to fetch "${video.title}" after ${MAX_RETRY_ATTEMPTS} attempts. Update the link to try again.`,
                            type: 'error',
                            internalId: `fetch-failed-final-${video.id}`,
                            link: `/video/${video.id}`,
                            isPersistent: true
                        });
                    } else {
                        // Silent retry failure (info notification)
                        await addNotification({
                            title: 'Video Fetch Retry Failed',
                            message: `Retry #${newRetryCount} for "${video.title}" failed. Will try again in 24 hours.`,
                            type: 'info',
                            internalId: `fetch-retry-${video.id}-${newRetryCount}`,
                            link: `/video/${video.id}`
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

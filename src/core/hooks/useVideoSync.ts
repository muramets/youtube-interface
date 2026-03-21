import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { collection, query, where, documentId, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { VideoService } from '../services/videoService';
import { TrendService } from '../services/trendService';
import { fetchVideoDetails, fetchVideosBatch, type VideoDetails } from '../utils/youtubeApi';
import { useNotificationStore } from '../stores/notificationStore';
import { useUIStore } from '../stores/uiStore';

export const useVideoSync = (userId: string, channelId: string) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const isSyncingRef = useRef(false);
    const queryClient = useQueryClient();

    /**
     * Shared sync engine: cross-cache read from Trends Firestore + YouTube API batch fallback.
     * Used by both syncAllVideos and manualSync.
     */
    const syncVideosWithCrossCache = useCallback(async (
        videosToSync: VideoDetails[],
        apiKey: string
    ): Promise<{
        cachedCount: number;
        apiSuccessCount: number;
        apiSkippedCount: number;
        quotaUsed: number;
        hadQuotaError: boolean;
    }> => {
        const now = Date.now();

        // --- Cross-cache: fetch trend channels from Firestore ---
        const trendChannels = await TrendService.fetchTrendChannels(userId, channelId);
        const trendChannelMap = new Map(trendChannels.map(c => [c.id, c]));

        const overlapVideos: VideoDetails[] = [];
        const apiOnlyVideos: VideoDetails[] = [];

        for (const video of videosToSync) {
            if (video.channelId && trendChannelMap.has(video.channelId)) {
                overlapVideos.push(video);
            } else {
                apiOnlyVideos.push(video);
            }
        }

        let cachedCount = 0;

        // --- Phase 1: Read overlap videos from Trends cache (batch query) ---
        if (overlapVideos.length > 0) {
            // Group videos by trend channel to batch-fetch
            const videosByChannel = new Map<string, VideoDetails[]>();
            for (const video of overlapVideos) {
                const chId = video.channelId!;
                if (!videosByChannel.has(chId)) videosByChannel.set(chId, []);
                videosByChannel.get(chId)!.push(video);
            }

            // Batch-fetch from each trend channel (Firestore 'in' supports up to 30 IDs)
            const IN_CHUNK = 30;
            const trendDataMap = new Map<string, Record<string, unknown>>();

            await Promise.all(
                Array.from(videosByChannel.entries()).map(async ([trendChannelId, videos]) => {
                    const videoIds = videos.map(v => v.publishedVideoId || v.id);
                    const colRef = collection(db,
                        `users/${userId}/channels/${channelId}/trendChannels/${trendChannelId}/videos`
                    );

                    for (let i = 0; i < videoIds.length; i += IN_CHUNK) {
                        const chunk = videoIds.slice(i, i + IN_CHUNK);
                        try {
                            const q = query(colRef, where(documentId(), 'in', chunk));
                            const snapshot = await getDocs(q);
                            snapshot.docs.forEach(d => {
                                trendDataMap.set(d.id, d.data());
                            });
                        } catch {
                            // Query failure — these videos will fall back to API
                        }
                    }
                })
            );

            // Process results
            const cacheUpdates: { videoId: string; data: Partial<VideoDetails> }[] = [];

            for (const video of overlapVideos) {
                const td = trendDataMap.get(video.publishedVideoId || video.id);
                if (!td) {
                    apiOnlyVideos.push(video);
                    continue;
                }

                // Use cache only if trend data is newer than current video data
                const trendUpdated = (td.lastUpdated as number) ?? 0;
                const videoUpdated = video.lastUpdated ?? 0;
                if (trendUpdated <= videoUpdated) {
                    apiOnlyVideos.push(video);
                    continue;
                }

                const tc = trendChannelMap.get(video.channelId!);

                const cacheData: Record<string, unknown> = {
                    title: td.title,
                    thumbnail: td.thumbnail,
                    viewCount: String(td.viewCount ?? 0),
                    description: td.description || '',
                    tags: td.tags || [],
                    publishedAt: td.publishedAt,
                    channelTitle: td.channelTitle || '',
                    channelAvatar: tc?.avatarUrl || '',
                    lastUpdated: now,
                    fetchStatus: 'success',
                    lastFetchAttempt: now
                };
                // Only include optional fields if they have values (Firestore rejects undefined)
                if (td.likeCount != null) cacheData.likeCount = String(td.likeCount);
                if (td.duration) cacheData.duration = td.duration;
                if (tc?.subscriberCount != null) cacheData.subscriberCount = String(tc.subscriberCount);

                cacheUpdates.push({
                    videoId: video.id,
                    data: cacheData as Partial<VideoDetails>
                });
                cachedCount++;
            }

            if (cacheUpdates.length > 0) {
                await VideoService.batchUpdateVideos(userId, channelId, cacheUpdates);
            }
        }

        // --- Phase 2: Fetch remaining videos from YouTube API ---
        const CHUNK_SIZE = 50;
        let quotaUsed = 0;
        let apiSuccessCount = 0;
        let apiSkippedCount = 0;
        let hadQuotaError = false;

        for (let i = 0; i < apiOnlyVideos.length; i += CHUNK_SIZE) {
            const chunk = apiOnlyVideos.slice(i, i + CHUNK_SIZE);

            // Build ID mapping: custom videos use publishedVideoId for YouTube API,
            // but results are saved under the internal video.id
            const youtubeToInternalId = new Map<string, string>();
            const youtubeIds = chunk.map(v => {
                const ytId = v.publishedVideoId || v.id;
                if (v.publishedVideoId) {
                    youtubeToInternalId.set(v.publishedVideoId, v.id);
                }
                return ytId;
            });

            try {
                const updatedDetails = await fetchVideosBatch(youtubeIds, apiKey);
                const returnedYoutubeIds = new Set(updatedDetails.map(d => d.id));
                quotaUsed += 2; // ~2 units per batch (videos.list + channels.list)
                apiSuccessCount += updatedDetails.length;

                const updates: { videoId: string; data: Partial<VideoDetails> }[] = updatedDetails.map(details => {
                    // Strip undefined values — Firestore rejects them
                    const clean: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(details)) {
                        if (value !== undefined) clean[key] = value;
                    }
                    return {
                        videoId: youtubeToInternalId.get(details.id) || details.id,
                        data: {
                            ...clean,
                            lastUpdated: now,
                            fetchStatus: 'success' as const,
                            lastFetchAttempt: now
                        } as Partial<VideoDetails>
                    };
                });

                // Handle missing videos (likely deleted or private)
                youtubeIds.forEach(ytId => {
                    if (!returnedYoutubeIds.has(ytId)) {
                        updates.push({
                            videoId: youtubeToInternalId.get(ytId) || ytId,
                            data: {
                                fetchStatus: 'failed',
                                lastFetchAttempt: now
                            }
                        });
                    }
                });

                if (updates.length > 0) {
                    await VideoService.batchUpdateVideos(userId, channelId, updates);
                }
            } catch (error: unknown) {
                console.error("Batch sync failed:", error);
                const errorMessage = error instanceof Error ? error.message : String(error);

                if (errorMessage.includes('403') || errorMessage.includes('quota')) {
                    useNotificationStore.getState().addNotification({
                        title: 'Channel Sync Failed',
                        message: 'YouTube API quota exceeded. Please try again later.',
                        type: 'error',
                        category: 'channel'
                    });
                    hadQuotaError = true;
                    break;
                }
                apiSkippedCount += chunk.length;
            }
        }

        return { cachedCount, apiSuccessCount, apiSkippedCount, quotaUsed, hadQuotaError };
    }, [userId, channelId]);

    const syncVideo = useCallback(async (videoId: string, apiKey: string, options: { silent?: boolean } = {}) => {
        const queryKey = ['videos', userId, channelId];
        const videos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
        const video = videos.find(v => v.id === videoId);
        if (!video) return;

        // Skip cloned videos — they are copies, not YouTube-synced
        if (video.isCloned) return;

        const targetId = video.publishedVideoId || videoId;
        if (video.isCustom && !video.publishedVideoId) return;

        try {
            const details = await fetchVideoDetails(targetId, apiKey);

            if (details) {
                const updates = video.publishedVideoId ? {
                    viewCount: details.viewCount,
                    publishedAt: details.publishedAt,
                    duration: details.duration,
                    thumbnail: details.thumbnail,
                    description: details.description,
                    tags: details.tags,
                    channelTitle: details.channelTitle,
                    channelId: details.channelId,
                    channelAvatar: details.channelAvatar,
                    subscriberCount: details.subscriberCount,
                    likeCount: details.likeCount,
                    lastUpdated: Date.now(),
                    fetchStatus: 'success' as const,
                    lastFetchAttempt: Date.now()
                } : {
                    ...details,
                    lastUpdated: Date.now(),
                    fetchStatus: 'success' as const,
                    lastFetchAttempt: Date.now()
                };

                await VideoService.updateVideo(userId, channelId, videoId, updates);

                if (!options.silent) {
                    useUIStore.getState().showToast('Video synced successfully', 'success');
                }
            }
        } catch (error: unknown) {
            console.error('[useVideoSync] Sync failed for video:', videoId, error);
            const err = error as Error;
            const isUnavailable = err.message === 'VIDEO_NOT_FOUND' || err.message === 'VIDEO_PRIVATE';

            if (isUnavailable) {
                await VideoService.updateVideo(userId, channelId, videoId, {
                    fetchStatus: 'failed',
                    lastFetchAttempt: Date.now()
                    // Note: Do NOT set isPlaylistOnly here - that would hide the video from Home page
                    // The video should still appear with an "Unavailable" placeholder
                });

                if (!options.silent) {
                    useUIStore.getState().showToast('Video is no longer available on YouTube', 'error');
                }
            } else if (!options.silent) {
                useUIStore.getState().showToast('Failed to sync video', 'error');
            }
        }
    }, [userId, channelId, queryClient]);

    const syncAllVideos = useCallback(async (apiKey: string) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        setIsSyncing(true);

        try {
            const queryKey = ['videos', userId, channelId];
            const videos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
            const syncableVideos = videos.filter(v => !v.isCloned && (!v.isCustom || (v.publishedVideoId && v.fetchStatus !== 'failed')));

            if (syncableVideos.length === 0) return;

            const { cachedCount, apiSuccessCount, apiSkippedCount, quotaUsed, hadQuotaError } = await syncVideosWithCrossCache(syncableVideos, apiKey);

            // --- Notification ---
            if (!hadQuotaError) {
                const totalSynced = cachedCount + apiSuccessCount;
                const skippedSuffix = apiSkippedCount > 0 ? ` ${apiSkippedCount} skipped due to network error.` : '';
                if (cachedCount > 0 && quotaUsed === 0 && apiSkippedCount === 0) {
                    // All videos served from Trends cache — no notification needed
                } else if (cachedCount > 0) {
                    useNotificationStore.getState().addNotification({
                        title: `Channel Sync: ${totalSynced} videos updated`,
                        message: `${cachedCount} from Trends cache, ${apiSuccessCount} from YouTube API.${skippedSuffix}`,
                        type: apiSkippedCount > 0 ? 'warning' : 'success',
                        meta: `${quotaUsed}`,
                        quotaBreakdown: { details: quotaUsed },
                        category: 'channel'
                    });
                } else if (totalSynced > 0 || apiSkippedCount > 0) {
                    useNotificationStore.getState().addNotification({
                        title: `Channel Sync: ${totalSynced} videos updated`,
                        message: `Successfully synced ${totalSynced} videos.${skippedSuffix}`,
                        type: apiSkippedCount > 0 ? 'warning' : 'success',
                        meta: `${quotaUsed}`,
                        quotaBreakdown: { details: quotaUsed },
                        category: 'channel'
                    });
                }
            }
        } catch (error) {
            console.error("Global sync failed:", error);
            useNotificationStore.getState().addNotification({
                title: 'Channel Sync Failed',
                message: 'An error occurred during synchronization.',
                type: 'error',
                category: 'channel'
            });
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
        }
    }, [userId, channelId, queryClient, syncVideosWithCrossCache]);

    const manualSync = useCallback(async (apiKey: string, syncFrequencyHours: number) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        setIsSyncing(true);

        try {
            const queryKey = ['videos', userId, channelId];
            const videos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
            const now = Date.now();
            const videosToUpdate = videos.filter(v => {
                if (v.isCloned) return false;
                if (v.isCustom && (!v.publishedVideoId || v.fetchStatus === 'failed')) return false;
                const lastUpdated = v.lastUpdated || 0;
                const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
                return hoursSinceUpdate >= syncFrequencyHours;
            });

            if (videosToUpdate.length === 0) return;

            const { cachedCount, apiSuccessCount, apiSkippedCount, quotaUsed, hadQuotaError } = await syncVideosWithCrossCache(videosToUpdate, apiKey);

            // --- Notification ---
            if (!hadQuotaError) {
                const totalSynced = cachedCount + apiSuccessCount;
                const skippedSuffix = apiSkippedCount > 0 ? ` ${apiSkippedCount} skipped due to network error.` : '';
                if (cachedCount > 0 && quotaUsed === 0 && apiSkippedCount === 0) {
                    // All from cache — no notification
                } else if (totalSynced > 0 || apiSkippedCount > 0) {
                    if (cachedCount > 0) {
                        useNotificationStore.getState().addNotification({
                            title: `Channel Sync: ${totalSynced} videos updated`,
                            message: `${cachedCount} from Trends cache, ${apiSuccessCount} from YouTube API.${skippedSuffix}`,
                            type: apiSkippedCount > 0 ? 'warning' : 'success',
                            meta: `${quotaUsed}`,
                            quotaBreakdown: { details: quotaUsed },
                            category: 'channel'
                        });
                    } else {
                        useNotificationStore.getState().addNotification({
                            title: `Channel Sync: ${totalSynced} videos updated`,
                            message: `Successfully synced ${totalSynced} videos.${skippedSuffix}`,
                            type: apiSkippedCount > 0 ? 'warning' : 'success',
                            meta: `${quotaUsed}`,
                            quotaBreakdown: { details: quotaUsed },
                            category: 'channel'
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Sync failed:", error);
            useNotificationStore.getState().addNotification({
                title: 'Channel Sync Failed',
                message: 'An error occurred during synchronization.',
                type: 'error',
                category: 'channel'
            });
        } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
        }
    }, [userId, channelId, queryClient, syncVideosWithCrossCache]);

    return {
        isSyncing,
        syncVideo,
        syncAllVideos,
        manualSync
    };
};

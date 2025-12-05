import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { VideoService } from '../services/videoService';
import { fetchVideoDetails, fetchVideosBatch, type VideoDetails } from '../utils/youtubeApi';
import { useNotificationStore } from '../stores/notificationStore';
import { useUIStore } from '../stores/uiStore';

export const useVideoSync = (userId: string, channelId: string) => {
    const [isSyncing, setIsSyncing] = useState(false);
    const queryClient = useQueryClient();
    const queryKey = ['videos', userId, channelId];

    const syncVideo = async (videoId: string, apiKey: string) => {
        const videos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
        const video = videos.find(v => v.id === videoId);
        if (!video) return;

        const targetId = video.publishedVideoId || videoId;
        if (video.isCustom && !video.publishedVideoId) return;

        const details = await fetchVideoDetails(targetId, apiKey);

        if (details) {
            if (video.publishedVideoId) {
                await VideoService.updateVideo(userId, channelId, videoId, {
                    mergedVideoData: details,
                    lastUpdated: Date.now()
                });
            } else {
                await VideoService.updateVideo(userId, channelId, videoId, {
                    ...details,
                    lastUpdated: Date.now()
                });
            }
            useUIStore.getState().showToast('Video synced successfully (quota used: 1 unit)', 'success');
        }
    };

    const syncAllVideos = async (apiKey: string) => {
        if (isSyncing) return;
        setIsSyncing(true);

        try {
            const videos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
            const syncableVideos = videos.filter(v => !v.isCustom && !v.isCloned);

            if (syncableVideos.length === 0) return;

            const CHUNK_SIZE = 50;
            const now = Date.now();

            for (let i = 0; i < syncableVideos.length; i += CHUNK_SIZE) {
                const chunk = syncableVideos.slice(i, i + CHUNK_SIZE);
                const videoIds = chunk.map(v => v.id);

                try {
                    const updatedDetails = await fetchVideosBatch(videoIds, apiKey);

                    const updates = updatedDetails.map(details => ({
                        videoId: details.id,
                        data: {
                            ...details,
                            lastUpdated: now
                        }
                    }));

                    if (updates.length > 0) {
                        await VideoService.batchUpdateVideos(userId, channelId, updates);
                    }
                } catch (error: unknown) {
                    console.error("Batch sync failed:", error);
                    const errorMessage = error instanceof Error ? error.message : String(error);

                    if (errorMessage.includes('403') || errorMessage.includes('quota')) {
                        useNotificationStore.getState().addNotification({
                            title: 'Auto-Sync Failed',
                            message: 'YouTube API quota exceeded. Please try again later.',
                            type: 'error'
                        });
                        break;
                    }
                }
            }

            const totalQuota = Math.ceil(syncableVideos.length / 50) * 2;
            useNotificationStore.getState().addNotification({
                title: 'Sync Completed',
                message: `Successfully synced ${syncableVideos.length} videos.`,
                type: 'success',
                meta: `Quota used: ${totalQuota} units`
            });

        } catch (error) {
            console.error("Global sync failed:", error);
            useNotificationStore.getState().addNotification({
                title: 'Sync Failed',
                message: 'An error occurred during synchronization.',
                type: 'error'
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const manualSync = async (apiKey: string, syncFrequencyHours: number) => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const videos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
            const now = Date.now();
            const videosToUpdate = videos.filter(v => {
                if (v.isCustom || v.isCloned) return false;
                const lastUpdated = v.lastUpdated || 0;
                const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
                return hoursSinceUpdate >= syncFrequencyHours;
            });

            if (videosToUpdate.length === 0) return;

            const CHUNK_SIZE = 50;
            for (let i = 0; i < videosToUpdate.length; i += CHUNK_SIZE) {
                const chunk = videosToUpdate.slice(i, i + CHUNK_SIZE);
                const updates: { videoId: string; data: Partial<VideoDetails> }[] = [];

                const results = await Promise.all(
                    chunk.map(async (video) => {
                        try {
                            const details = await fetchVideoDetails(video.id, apiKey);
                            return details ? { videoId: video.id, details } : null;
                        } catch (e) {
                            console.error(`Failed to fetch details for ${video.id}`, e);
                            return null;
                        }
                    })
                );

                results.forEach(result => {
                    if (result) {
                        updates.push({
                            videoId: result.videoId,
                            data: {
                                ...result.details,
                                lastUpdated: now
                            }
                        });
                    }
                });

                if (updates.length > 0) {
                    await VideoService.batchUpdateVideos(userId, channelId, updates);
                }
            }

        } catch (error) {
            console.error("Sync failed:", error);
        } finally {
            setIsSyncing(false);
        }
    };

    return {
        isSyncing,
        syncVideo,
        syncAllVideos,
        manualSync
    };
};

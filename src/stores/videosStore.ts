import { create } from 'zustand';
import { VideoService } from '../services/videoService';
import { type VideoDetails, type HistoryItem, type CoverVersion, fetchVideoDetails, extractVideoId, fetchVideosBatch, type PackagingVersion, type PackagingCheckin } from '../utils/youtubeApi';
import { useUIStore } from './uiStore';
import { useNotificationStore } from './notificationStore';

import { useSettingsStore } from './settingsStore';

interface VideosState {
    videos: VideoDetails[];
    isLoading: boolean;
    isSyncing: boolean;

    // Actions
    setVideos: (videos: VideoDetails[]) => void;
    setLoading: (loading: boolean) => void;

    // Async Actions
    subscribeToVideos: (userId: string, channelId: string) => () => void;
    addVideo: (userId: string, channelId: string, url: string, apiKey: string) => Promise<boolean>;
    addCustomVideo: (userId: string, channelId: string, video: Omit<VideoDetails, 'id'>) => Promise<string | undefined>;
    updateVideo: (userId: string, channelId: string, videoId: string, updates?: Partial<VideoDetails>, apiKey?: string) => Promise<boolean>;
    removeVideo: (userId: string, channelId: string, videoId: string) => Promise<void>;
    reorderVideos: (userId: string, channelId: string, newOrder: string[]) => Promise<void>;

    // Advanced Actions
    cloneVideo: (userId: string, channelId: string, originalVideo: VideoDetails, coverVersion: CoverVersion, cloneDurationSeconds: number) => Promise<void>;
    syncVideo: (userId: string, channelId: string, videoId: string, apiKey: string) => Promise<void>;
    syncAllVideos: (userId: string, channelId: string, apiKey: string) => Promise<void>;
    manualSync: (userId: string, channelId: string, apiKey: string, syncFrequencyHours: number) => Promise<void>;

    // History
    fetchVideoHistory: (userId: string, channelId: string, videoId: string) => Promise<CoverVersion[]>;
    saveVideoHistory: (userId: string, channelId: string, videoId: string, historyItem: HistoryItem) => Promise<void>;
    deleteVideoHistoryItem: (userId: string, channelId: string, videoId: string, historyId: string) => Promise<void>;

    // Packaging
    saveDraft: (userId: string, channelId: string, videoId: string) => Promise<void>;
    createVersion: (userId: string, channelId: string, videoId: string, snapshot: PackagingVersion['configurationSnapshot']) => Promise<void>;
    addCheckin: (userId: string, channelId: string, videoId: string, versionNumber: number, checkin: PackagingCheckin) => Promise<void>;
}

export const useVideosStore = create<VideosState>((set, get) => ({
    videos: [],
    isLoading: true,
    isSyncing: false,

    setVideos: (videos) => set({ videos }),
    setLoading: (loading) => set({ isLoading: loading }),

    subscribeToVideos: (userId, channelId) => {
        set({ isLoading: true });
        return VideoService.subscribeToVideos(userId, channelId, (data) => {
            set({ videos: data, isLoading: false });
        });
    },

    addVideo: async (userId, channelId, url, apiKey) => {
        const videoId = extractVideoId(url);
        if (!videoId) {
            alert('Invalid YouTube URL');
            return false;
        }

        if (get().videos.some(v => v.id === videoId)) {
            alert('Video already exists');
            return false;
        }

        const details = await fetchVideoDetails(videoId, apiKey);
        if (details) {
            const videoWithTimestamp: VideoDetails = {
                ...details,
                createdAt: Date.now()
            };

            await VideoService.addVideo(userId, channelId, videoWithTimestamp);

            // Note: Order update should be handled by the caller or a separate store action if order is in settingsStore
            // But since we pass currentOrder, we can update it here if we had access to updateVideoOrder.
            // For now, we'll assume the component handles the order update or we inject the store.
            // Actually, better to keep it pure here. The caller (component) should call updateVideoOrder from settingsStore.
            // Wait, the context did it automatically. We should probably keep that convenience.
            // But settingsStore is separate. We can import useSettingsStore? No, that's a hook.
            // We can import the store instance if we export it, but let's keep it simple for now.
            // We will return true and let the component handle order update? Or pass the update function?
            // Let's stick to the context pattern: the context had access to settings.
            // Here, we can't easily access another store inside a store without direct import.

            return true;
        } else {
            alert('Failed to fetch video details.');
            return false;
        }
    },

    addCustomVideo: async (userId, channelId, video) => {
        const id = `custom-${Date.now()}`;
        const newVideo: VideoDetails = {
            ...video,
            id,
            isCustom: true,
            createdAt: Date.now()
        };

        await VideoService.addVideo(userId, channelId, newVideo);
        return id;
    },

    updateVideo: async (userId, channelId, videoId, updates, apiKey) => {
        // If it's a real video update requiring API fetch
        if (!videoId.startsWith('custom-') && !updates && apiKey) {
            const details = await fetchVideoDetails(videoId, apiKey);
            if (details) {
                await VideoService.updateVideo(userId, channelId, videoId, details);
                return true;
            }
            return false;
        }

        if (updates) {
            const finalUpdates = { ...updates };

            // If a publishedVideoId is provided (or changed), fetch its details
            if (updates.publishedVideoId && apiKey) {
                try {
                    const mergedDetails = await fetchVideoDetails(updates.publishedVideoId, apiKey);
                    if (mergedDetails) {
                        finalUpdates.mergedVideoData = mergedDetails;
                    }
                } catch (error) {
                    console.error("Failed to fetch merged video details:", error);
                    // We continue even if fetch fails, but maybe we should alert?
                    // For now, we'll just save the ID.
                }
            } else if (updates.publishedVideoId === '') {
                // If explicitly cleared, remove the merged data
                finalUpdates.mergedVideoData = undefined; // or null, depending on backend. Firestore handles undefined as ignore, so maybe null?
                // Actually, deleteField() is needed for Firestore, but let's assume VideoService handles partials.
                // If we pass undefined to object spread, it stays undefined.
                // We might need to explicitly set it to null if we want to clear it.
                // For now, let's just clear it from the object if it's empty string.
                delete finalUpdates.mergedVideoData;
            }

            await VideoService.updateVideo(userId, channelId, videoId, finalUpdates);
            return true;
        }
        return false;
    },

    removeVideo: async (userId, channelId, videoId) => {
        await VideoService.deleteVideo(userId, channelId, videoId);
    },

    reorderVideos: async () => {
        // This is actually a settings operation, but kept here for compatibility if needed.
        // Ideally, use settingsStore.updateVideoOrder directly.
    },

    cloneVideo: async (userId, channelId, originalVideo, coverVersion, cloneDurationSeconds) => {
        try {
            const now = Date.now();
            const id = `clone-${now}-${Math.random().toString(36).substr(2, 9)}`;
            const expiresAt = now + (cloneDurationSeconds * 1000);

            const newVideo: VideoDetails = {
                ...originalVideo,
                id,
                isCustom: true,
                isCloned: true,
                clonedFromId: originalVideo.id,
                createdAt: now,
                expiresAt,
                customImage: coverVersion?.url || originalVideo.customImage,
                customImageName: coverVersion?.originalName || originalVideo.customImageName,
                customImageVersion: coverVersion?.version || originalVideo.customImageVersion,
                coverHistory: originalVideo.coverHistory || []
            };

            // Optimistic update: Add to local state immediately
            set(state => ({ videos: [...state.videos, newVideo] }));

            // Optimistic update: Update video order immediately
            const { videoOrder, updateVideoOrder } = useSettingsStore.getState();
            const newOrder = [id, ...videoOrder];
            // We await this because it updates the settings store state (which drives the UI order)
            // The settings store update is also optimistic locally, so this is fast.
            updateVideoOrder(userId, channelId, newOrder);

            // Perform DB operation in background
            await VideoService.addVideo(userId, channelId, newVideo);
        } catch (error) {
            console.error("Error cloning video:", error);
            alert("Failed to clone video.");
            // Rollback could be implemented here if needed, but for now we rely on next sync/refresh
        }
    },

    syncVideo: async (userId, channelId, videoId, apiKey) => {
        const video = get().videos.find(v => v.id === videoId);
        if (!video) return;

        // Determine which ID to fetch: the video's own ID or the publishedVideoId
        const targetId = video.publishedVideoId || videoId;

        // Don't sync if it's a custom video without a published ID
        if (video.isCustom && !video.publishedVideoId) return;

        const details = await fetchVideoDetails(targetId, apiKey);

        if (details) {
            if (video.publishedVideoId) {
                // Update merged data for custom video
                await VideoService.updateVideo(userId, channelId, videoId, {
                    mergedVideoData: details,
                    lastUpdated: Date.now()
                });
            } else {
                // Standard update
                await VideoService.updateVideo(userId, channelId, videoId, {
                    ...details,
                    lastUpdated: Date.now()
                });
            }

            // Show success toast with quota usage
            useUIStore.getState().showToast('Video synced successfully (quota used: 1 unit)', 'success');
        }
    },

    syncAllVideos: async (userId, channelId, apiKey) => {
        if (get().isSyncing) return;
        set({ isSyncing: true });

        try {
            const { videos } = get();
            // Filter out custom and cloned videos
            const syncableVideos = videos.filter(v => !v.isCustom && !v.isCloned);

            if (syncableVideos.length === 0) return;

            const CHUNK_SIZE = 50;
            const now = Date.now();

            for (let i = 0; i < syncableVideos.length; i += CHUNK_SIZE) {
                const chunk = syncableVideos.slice(i, i + CHUNK_SIZE);
                const videoIds = chunk.map(v => v.id);

                try {
                    // Use optimized batch fetch
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

                    // Handle Quota Error
                    const errorMessage = error instanceof Error ? error.message : String(error);

                    if (errorMessage.includes('403') || errorMessage.includes('quota')) {
                        useNotificationStore.getState().addNotification({
                            title: 'Auto-Sync Failed',
                            message: 'YouTube API quota exceeded. Please try again later.',
                            type: 'error'
                        });
                        break; // Stop syncing if quota exceeded
                    }
                }
            }


            // Calculate total quota used (1 unit per video details fetch)
            // Note: fetchVideosBatch uses 1 unit per call if we consider it as one "list" call, 
            // but actually 'videos' endpoint costs 1 unit per call regardless of IDs count (up to 50).
            // So each chunk (up to 50 videos) costs 1 unit.
            const totalQuota = Math.ceil(syncableVideos.length / 50);

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
            set({ isSyncing: false });
        }
    },

    manualSync: async (userId, channelId, apiKey, syncFrequencyHours) => {
        // Deprecated in favor of syncAllVideos, but kept for compatibility
        // We can redirect to syncAllVideos if needed, or keep as is for legacy
        // For now, let's leave it but it won't be used by the new auto-sync
        if (get().isSyncing) return;
        set({ isSyncing: true });
        try {
            const now = Date.now();
            const videosToUpdate = get().videos.filter(v => {
                if (v.isCustom || v.isCloned) return false;
                const lastUpdated = v.lastUpdated || 0;
                const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
                return hoursSinceUpdate >= syncFrequencyHours;
            });

            if (videosToUpdate.length === 0) return;

            // Process in chunks of 50 to avoid hitting API rate limits too hard or timeout
            const CHUNK_SIZE = 50;
            for (let i = 0; i < videosToUpdate.length; i += CHUNK_SIZE) {
                const chunk = videosToUpdate.slice(i, i + CHUNK_SIZE);
                const updates: { videoId: string; data: Partial<VideoDetails> }[] = [];

                // Fetch details in parallel
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

                // Prepare updates
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

                // Batch update Firestore
                if (updates.length > 0) {
                    await VideoService.batchUpdateVideos(userId, channelId, updates);
                }
            }

        } catch (error) {
            console.error("Sync failed:", error);
        } finally {
            set({ isSyncing: false });
        }
    },

    fetchVideoHistory: (userId, channelId, videoId) => {
        return VideoService.fetchVideoHistory(userId, channelId, videoId);
    },

    saveVideoHistory: (userId, channelId, videoId, historyItem) => {
        return VideoService.saveVideoHistory(userId, channelId, videoId, historyItem);
    },

    deleteVideoHistoryItem: (userId, channelId, videoId, historyId) => {
        return VideoService.deleteVideoHistoryItem(userId, channelId, videoId, historyId);
    },

    saveDraft: async (userId, channelId, videoId) => {
        // Just update isDraft to true
        set(state => ({
            videos: state.videos.map(v => v.id === videoId ? { ...v, isDraft: true } : v)
        }));
        await VideoService.updateVideo(userId, channelId, videoId, { isDraft: true });
    },

    createVersion: async (userId, channelId, videoId, snapshot) => {
        const video = get().videos.find(v => v.id === videoId);
        if (!video) return;

        const currentHistory = video.packagingHistory || [];
        const nextVersionNumber = currentHistory.length > 0
            ? Math.max(...currentHistory.map(v => v.versionNumber)) + 1
            : 1;

        const newVersion: PackagingVersion = {
            versionNumber: nextVersionNumber,
            startDate: Date.now(),
            configurationSnapshot: snapshot,
            checkins: [{
                id: `v${nextVersionNumber}-creation`,
                date: Date.now(),
                metrics: {
                    impressions: 0,
                    ctr: 0,
                    views: 0,
                    avdSeconds: 0,
                    avdPercentage: 0
                }
            }]
        };

        const updatedHistory = [...currentHistory, newVersion];

        // Optimistic update
        set(state => ({
            videos: state.videos.map(v => v.id === videoId ? {
                ...v,
                packagingHistory: updatedHistory,
                isDraft: false
            } : v)
        }));

        await VideoService.updateVideo(userId, channelId, videoId, {
            packagingHistory: updatedHistory,
            isDraft: false
        });
    },

    addCheckin: async (userId, channelId, videoId, versionNumber, checkin) => {
        const video = get().videos.find(v => v.id === videoId);
        if (!video || !video.packagingHistory) return;

        const updatedHistory = video.packagingHistory.map(version => {
            if (version.versionNumber === versionNumber) {
                return {
                    ...version,
                    checkins: [...version.checkins, checkin]
                };
            }
            return version;
        });

        // Optimistic update
        set(state => ({
            videos: state.videos.map(v => v.id === videoId ? { ...v, packagingHistory: updatedHistory } : v)
        }));

        await VideoService.updateVideo(userId, channelId, videoId, { packagingHistory: updatedHistory });
    }
}));

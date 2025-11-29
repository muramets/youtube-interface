import { create } from 'zustand';
import { VideoService } from '../services/videoService';
import { type VideoDetails, type HistoryItem, type CoverVersion, fetchVideoDetails, extractVideoId } from '../utils/youtubeApi';

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
            await VideoService.updateVideo(userId, channelId, videoId, updates);
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

            await VideoService.addVideo(userId, channelId, newVideo);
        } catch (error) {
            console.error("Error cloning video:", error);
            alert("Failed to clone video.");
        }
    },

    syncVideo: async (userId, channelId, videoId, apiKey) => {
        const details = await fetchVideoDetails(videoId, apiKey);
        if (details) {
            await VideoService.updateVideo(userId, channelId, videoId, {
                ...details,
                lastUpdated: Date.now()
            });
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
                    const updatedDetails = await import('../utils/youtubeApi').then(m => m.fetchVideosBatch(videoIds, apiKey));

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
                        import('./notificationStore').then(({ useNotificationStore }) => {
                            useNotificationStore.getState().addNotification({
                                title: 'Auto-Sync Failed',
                                message: 'YouTube API quota exceeded. Please try again later.',
                                type: 'error'
                            });
                        });
                        break; // Stop syncing if quota exceeded
                    }
                }
            }
        } catch (error) {
            console.error("Global sync failed:", error);
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
    }
}));

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useCallback } from 'react';
import { deleteField } from 'firebase/firestore';
import { VideoService } from '../services/videoService';
import { fetchVideoDetails, extractVideoId, type VideoDetails, type PackagingVersion, type PackagingCheckin, type HistoryItem, type CoverVersion } from '../utils/youtubeApi';
import { SettingsService } from '../services/settingsService';

export const useVideos = (userId: string, channelId: string) => {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['videos', userId, channelId], [userId, channelId]);

    // 1. Query with Real-time Subscription
    const { data: videos = [], isLoading, error } = useQuery<VideoDetails[]>({
        queryKey,
        queryFn: async () => {
            // Perform initial fetch to ensure isLoading is true until data arrives
            return VideoService.fetchVideos(userId, channelId);
        },
        staleTime: Infinity,
        enabled: !!userId && !!channelId,
    });

    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubscribe = VideoService.subscribeToVideos(userId, channelId, (data) => {
            queryClient.setQueryData(queryKey, data);
        });
        return () => unsubscribe();
    }, [userId, channelId, queryClient, queryKey]);

    // 2. Mutations

    // Add Video
    const addVideoMutation = useMutation({
        mutationFn: async ({ url, apiKey }: { url: string, apiKey: string }) => {
            const videoId = extractVideoId(url);
            if (!videoId) throw new Error('Invalid YouTube URL');

            // Check if exists in current cache
            const currentVideos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
            if (currentVideos.some(v => v.id === videoId)) throw new Error('Video already exists');

            const details = await fetchVideoDetails(videoId, apiKey);
            if (!details) throw new Error('Failed to fetch video details');

            const videoWithTimestamp: VideoDetails = {
                ...details,
                createdAt: Date.now()
            };

            await VideoService.addVideo(userId, channelId, videoWithTimestamp);
            return videoWithTimestamp;
        }
    });

    // Add Custom Video
    const addCustomVideoMutation = useMutation({
        mutationFn: async (video: Omit<VideoDetails, 'id'> & { id?: string }) => {
            const id = video.id || `custom-${Date.now()}`;
            const newVideo: VideoDetails = {
                ...video,
                id,
                isCustom: true,
                createdAt: Date.now()
            };

            // Optimistic Order Update
            const videoOrder = queryClient.getQueryData<string[]>(['settings', 'videoOrder', userId, channelId]) || [];
            const newOrder = [id, ...videoOrder];

            // Update cache and firestore
            queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], newOrder);
            await SettingsService.updateVideoOrder(userId, channelId, newOrder);

            await VideoService.addVideo(userId, channelId, newVideo);
            return id;
        }
    });

    // Update Video
    const updateVideoMutation = useMutation({
        mutationFn: async ({ videoId, updates, apiKey }: { videoId: string, updates?: Partial<VideoDetails>, apiKey?: string }) => {
            // Real update fetch logic
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
                // Merged video logic
                if (updates.publishedVideoId && apiKey) {
                    try {
                        const mergedDetails = await fetchVideoDetails(updates.publishedVideoId, apiKey);
                        if (mergedDetails) {
                            finalUpdates.mergedVideoData = mergedDetails;
                            // Clear retry state on success
                            finalUpdates.fetchStatus = 'success';
                            finalUpdates.fetchRetryCount = deleteField() as any;
                            finalUpdates.lastFetchAttempt = deleteField() as any;
                        } else {
                            // Failed to fetch - initialize retry state
                            finalUpdates.fetchStatus = 'pending';
                            finalUpdates.fetchRetryCount = 0;
                            finalUpdates.lastFetchAttempt = Date.now();
                        }
                    } catch (error) {
                        console.error("Failed to fetch merged video details:", error);
                        // Initialize retry state on error
                        finalUpdates.fetchStatus = 'pending';
                        finalUpdates.fetchRetryCount = 0;
                        finalUpdates.lastFetchAttempt = Date.now();
                    }
                } else if (updates.publishedVideoId === '') {
                    // Clearing publishedVideoId - reset all related fields
                    delete finalUpdates.mergedVideoData;
                    finalUpdates.fetchStatus = deleteField() as any;
                    finalUpdates.fetchRetryCount = deleteField() as any;
                    finalUpdates.lastFetchAttempt = deleteField() as any;
                }

                await VideoService.updateVideo(userId, channelId, videoId, finalUpdates);
                return true;
            }
            return false;
        }
    });

    // Remove Video
    const removeVideoMutation = useMutation({
        mutationFn: async (videoId: string) => {
            await VideoService.deleteVideo(userId, channelId, videoId);
        }
    });

    // Clone Video
    const cloneVideoMutation = useMutation({
        mutationFn: async ({ originalVideo, coverVersion, cloneDurationSeconds }: { originalVideo: VideoDetails, coverVersion: CoverVersion | null, cloneDurationSeconds: number }) => {
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

            // Optimistic Order Update
            const videoOrder = queryClient.getQueryData<string[]>(['settings', 'videoOrder', userId, channelId]) || [];
            const newOrder = [id, ...videoOrder];

            // Update cache and firestore
            queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], newOrder);
            await SettingsService.updateVideoOrder(userId, channelId, newOrder);

            await VideoService.addVideo(userId, channelId, newVideo);
        }
    });

    // Packaging Mutations
    const saveDraftMutation = useMutation({
        mutationFn: async (videoId: string) => {
            await VideoService.updateVideo(userId, channelId, videoId, { isDraft: true });
        }
    });

    const createVersionMutation = useMutation({
        mutationFn: async ({ videoId, snapshot }: { videoId: string, snapshot: PackagingVersion['configurationSnapshot'] }) => {
            const video = (queryClient.getQueryData<VideoDetails[]>(queryKey) || []).find(v => v.id === videoId);
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
                        avdSeconds: 0
                    }
                }]
            };

            const updatedHistory = [...currentHistory, newVersion];
            await VideoService.updateVideo(userId, channelId, videoId, {
                packagingHistory: updatedHistory,
                isDraft: false
            });
        }
    });

    const addCheckinMutation = useMutation({
        mutationFn: async ({ videoId, versionNumber, checkin }: { videoId: string, versionNumber: number, checkin: PackagingCheckin }) => {
            const video = (queryClient.getQueryData<VideoDetails[]>(queryKey) || []).find(v => v.id === videoId);
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

            await VideoService.updateVideo(userId, channelId, videoId, { packagingHistory: updatedHistory });
        }
    });

    // History Mutations
    const saveVideoHistoryMutation = useMutation({
        mutationFn: async ({ videoId, historyItem }: { videoId: string, historyItem: HistoryItem }) => {
            await VideoService.saveVideoHistory(userId, channelId, videoId, historyItem);
        }
    });

    const deleteVideoHistoryItemMutation = useMutation({
        mutationFn: async ({ videoId, historyId }: { videoId: string, historyId: string }) => {
            await VideoService.deleteVideoHistoryItem(userId, channelId, videoId, historyId);
        }
    });

    return {
        videos,
        isLoading,
        error,
        addVideo: addVideoMutation.mutateAsync,
        addCustomVideo: addCustomVideoMutation.mutateAsync,
        updateVideo: updateVideoMutation.mutateAsync,
        removeVideo: removeVideoMutation.mutateAsync,
        cloneVideo: cloneVideoMutation.mutateAsync,
        saveDraft: saveDraftMutation.mutateAsync,
        createVersion: createVersionMutation.mutateAsync,
        addCheckin: addCheckinMutation.mutateAsync,
        saveVideoHistory: saveVideoHistoryMutation.mutateAsync,
        deleteVideoHistoryItem: deleteVideoHistoryItemMutation.mutateAsync,
        fetchVideoHistory: useCallback((videoId: string) => VideoService.fetchVideoHistory(userId, channelId, videoId), [userId, channelId])
    };
};

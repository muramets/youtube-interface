import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useCallback } from 'react';
import { deleteField } from 'firebase/firestore';
import { useChannelStore } from '../stores/channelStore';
import { VideoService } from '../services/videoService';
import { fetchVideoDetails, extractVideoId, type VideoDetails, type PackagingCheckin, type HistoryItem, type CoverVersion } from '../utils/youtubeApi';
import { useNotificationStore } from '../stores/notificationStore';
import { useUIStore } from '../stores/uiStore';
import type { PackagingVersion } from '../types/versioning';
import { SettingsService } from '../services/settingsService';

// Global set to track videos currently being deleted across all instances of the hook
// This prevents "flickering" where a video reappears in one instance (e.g. HomePage)
// because an unrelated update in another instance (e.g. VideoCard) triggered a snapshot
const terminatingVideoIds = new Set<string>();

// Export the return type for use in other components
export interface UseVideosResult {
    videos: VideoDetails[];
    isLoading: boolean;
    error: unknown;
    addVideo: (vars: { url: string; apiKey: string; isPlaylistOnly?: boolean }) => Promise<VideoDetails>;
    addCustomVideo: (video: Omit<VideoDetails, 'id'> & { id?: string }) => Promise<string>;
    updateVideo: (vars: { videoId: string; updates?: Partial<VideoDetails>; apiKey?: string; expectedRevision?: number }) => Promise<boolean>;
    removeVideo: (videoId: string) => Promise<void>;
    cloneVideo: (vars: { originalVideo: VideoDetails; coverVersion: CoverVersion | null; cloneDurationSeconds: number; overrides?: { title?: string; customImage?: string; customImageName?: string; customImageVersion?: number; abTestVariantIndex?: number } }) => Promise<string>;
    saveDraft: (vars: { videoId: string; expectedRevision: number }) => Promise<void>;
    createVersion: (vars: { videoId: string; snapshot: PackagingVersion['configurationSnapshot']; expectedRevision: number }) => Promise<void>;
    addCheckin: (vars: { videoId: string; versionNumber: number; checkin: PackagingCheckin; expectedRevision: number }) => Promise<void>;
    saveVideoHistory: (vars: { videoId: string; historyItem: HistoryItem }) => Promise<void>;
    deleteVideoHistoryItem: (vars: { videoId: string; historyId: string }) => Promise<void>;
    fetchVideoHistory: (videoId: string) => Promise<CoverVersion[]>;
}

export const useVideos = (userId: string, channelId: string): UseVideosResult => {
    const queryClient = useQueryClient();
    const { showToast } = useUIStore();
    const { currentChannel } = useChannelStore();
    const queryKey = useMemo(() => ['videos', userId, channelId], [userId, channelId]);

    const EMPTY_VIDEOS: VideoDetails[] = useMemo(() => [], []);
    const { data: rawVideos, isLoading, error } = useQuery<VideoDetails[]>({
        queryKey,
        queryFn: async () => {
            // Perform initial fetch to ensure isLoading is true until data arrives
            const videos = await VideoService.fetchVideos(userId, channelId);

            // Apply terminator filter to initial fetch too (prevents flicker if invalidation happens fast)
            return videos.filter(v => !terminatingVideoIds.has(v.id));
        },
        staleTime: Infinity,
        enabled: !!userId && !!channelId,
    });

    const videos = rawVideos || EMPTY_VIDEOS;

    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubscribe = VideoService.subscribeToVideos(userId, channelId, (data) => {
            // Filter out videos that are currently being deleted
            const filteredData = data.filter(v => !terminatingVideoIds.has(v.id));
            queryClient.setQueryData(queryKey, filteredData);
        });
        return () => {
            unsubscribe();
        }
    }, [userId, channelId, queryClient, queryKey]);

    // 2. Mutations

    // Add Video
    const addVideoMutation = useMutation({
        mutationFn: async ({ url, apiKey, isPlaylistOnly }: { url: string, apiKey: string, isPlaylistOnly?: boolean }) => {
            const videoId = extractVideoId(url);
            if (!videoId) throw new Error('Invalid YouTube URL');

            // Check if exists in current cache
            const currentVideos = queryClient.getQueryData<VideoDetails[]>(queryKey) || [];
            if (currentVideos.some(v => v.id === videoId)) throw new Error('Video already exists');

            const details = await fetchVideoDetails(videoId, apiKey);
            if (!details) throw new Error('Failed to fetch video details');

            const videoWithTimestamp: VideoDetails = {
                ...details,
                createdAt: Date.now(),
            };

            if (!isPlaylistOnly) {
                videoWithTimestamp.addedToHomeAt = Date.now();
            } else {
                videoWithTimestamp.isPlaylistOnly = true;
            }

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
                channelTitle: video.channelTitle || currentChannel?.name || '',
                channelAvatar: video.channelAvatar || currentChannel?.avatar || '',
                viewCount: video.viewCount || '1000000',
                createdAt: Date.now(),
            };

            // Only add to home if NOT playlist-only
            if (!video.isPlaylistOnly) {
                newVideo.addedToHomeAt = Date.now();
            }

            // Optimistic Order Update
            const videoOrder = queryClient.getQueryData<string[]>(['settings', 'videoOrder', userId, channelId]) || [];
            const newOrder = [id, ...videoOrder];

            // Update cache and firestore
            queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], newOrder);
            await SettingsService.updateVideoOrder(userId, channelId, newOrder);

            // Optimistically update videos cache
            queryClient.setQueryData<VideoDetails[]>(queryKey, (old) => {
                if (!old) return [newVideo];
                return [...old, newVideo];
            });

            await VideoService.addVideo(userId, channelId, newVideo);
            return id;
        }
    });

    // Update Video
    const updateVideoMutation = useMutation({
        mutationFn: async ({ videoId, updates, apiKey, expectedRevision }: { videoId: string, updates?: Partial<VideoDetails>, apiKey?: string, expectedRevision?: number }) => {
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
                        const cleanVideoId = extractVideoId(updates.publishedVideoId) || updates.publishedVideoId;
                        const mergedDetails = await fetchVideoDetails(cleanVideoId, apiKey);

                        if (mergedDetails) {
                            finalUpdates.mergedVideoData = mergedDetails;
                            // Clear retry state on success
                            finalUpdates.fetchStatus = 'success';
                            finalUpdates.fetchRetryCount = deleteField() as unknown as number;
                            finalUpdates.lastFetchAttempt = deleteField() as unknown as number;
                        } else {
                            // Failed to fetch - clear data and initialize retry state
                            console.error("Fetch returned null for video:", cleanVideoId);
                            showToast(`Failed to load video: ${cleanVideoId}`, 'error');
                            finalUpdates.mergedVideoData = deleteField() as unknown as VideoDetails['mergedVideoData'];
                            finalUpdates.fetchStatus = 'failed';
                            finalUpdates.fetchRetryCount = 0;
                            finalUpdates.lastFetchAttempt = Date.now();
                        }
                    } catch (error) {
                        console.error("Failed to fetch merged video details:", error);
                        if (error instanceof Error) {
                            showToast(`Error fetching video: ${error.message}`, 'error');
                        }
                        // Clear data and initialize retry state on error
                        finalUpdates.mergedVideoData = deleteField() as unknown as VideoDetails['mergedVideoData'];
                        finalUpdates.fetchStatus = 'failed';
                        finalUpdates.fetchRetryCount = 0;
                        finalUpdates.lastFetchAttempt = Date.now();
                    }
                } else if (updates.publishedVideoId === '') {
                    // Clearing publishedVideoId - reset all related fields
                    delete finalUpdates.mergedVideoData;
                    finalUpdates.fetchStatus = deleteField() as unknown as 'pending' | 'success' | 'failed';
                    finalUpdates.fetchRetryCount = deleteField() as unknown as number;
                    finalUpdates.lastFetchAttempt = deleteField() as unknown as number;
                }

                if (expectedRevision !== undefined) {
                    await VideoService.updateVideoSafe(userId, channelId, videoId, finalUpdates, expectedRevision);
                } else {
                    await VideoService.updateVideo(userId, channelId, videoId, finalUpdates);
                }
                return true;
            }
            return false;
        },
        onMutate: async ({ videoId, updates }) => {
            // Optimistically update cache
            await queryClient.cancelQueries({ queryKey: ['videos', userId, channelId] });
            const previousVideos = queryClient.getQueryData<VideoDetails[]>(['videos', userId, channelId]);

            queryClient.setQueryData<VideoDetails[]>(['videos', userId, channelId], (old) => {
                if (!old) return old;
                return old.map(v => {
                    if (v.id === videoId && updates) {
                        // 1. Special handling for publishedVideoId
                        if (updates.publishedVideoId !== undefined) {
                            if (updates.publishedVideoId === '') {
                                const { mergedVideoData: _1, fetchStatus: _2, fetchRetryCount: _3, lastFetchAttempt: _4, ...rest } = v;
                                void _1; void _2; void _3; void _4;
                                return { ...rest, ...updates, publishedVideoId: '' };
                            }
                            return {
                                ...v,
                                ...updates,
                                mergedVideoData: undefined,
                                fetchStatus: 'pending' as const
                            };
                        }
                        // 2. Generic update for all other fields (e.g. A/B tests)
                        return { ...v, ...updates };
                    }
                    return v;
                });
            });

            return { previousVideos };
        },
        onError: (_err, _variables, context) => {
            // Rollback on error
            if (context?.previousVideos) {
                queryClient.setQueryData(['videos', userId, channelId], context.previousVideos);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['videos', userId, channelId] });
        }
    });

    // Remove Video
    const removeVideoMutation = useMutation({
        mutationFn: async (videoId: string) => {
            await VideoService.deleteVideo(userId, channelId, videoId);
        },
        onMutate: async (videoId: string) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: ['videos', userId, channelId] });

            // Mark video as being terminated globally
            terminatingVideoIds.add(videoId);

            // Snapshot the previous value
            const previousVideos = queryClient.getQueryData<VideoDetails[]>(['videos', userId, channelId]);

            // Optimistically update to remove the video
            queryClient.setQueryData<VideoDetails[]>(['videos', userId, channelId], (old) => {
                if (!old) return old;
                return old.filter(v => v.id !== videoId);
            });

            // Return context with the snapshotted value
            return { previousVideos };
        },
        onError: (_err, videoId, context) => {
            // Remove from terminating set on error
            terminatingVideoIds.delete(videoId);

            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousVideos) {
                queryClient.setQueryData(['videos', userId, channelId], context.previousVideos);
            }
        },
        onSettled: (_data, _error, videoId) => {
            // Remove from terminating set when done (success or error) after a delay
            // to allow for consistency propagation
            setTimeout(() => {
                terminatingVideoIds.delete(videoId);
            }, 3000);

            // Clean up any "Fetch Failed" notifications associated with this video
            // We use strict matching for the final failure, and try-catch to be safe
            useNotificationStore.getState().removeNotificationByInternalId(`fetch-failed-final-${videoId}`);

            // Still invalidate to ensure we have the correct state eventually
            queryClient.invalidateQueries({ queryKey: ['videos', userId, channelId] });
        }
    });

    // Clone Video
    const cloneVideoMutation = useMutation({
        mutationFn: async ({ originalVideo, coverVersion, cloneDurationSeconds, overrides }: { originalVideo: VideoDetails, coverVersion: CoverVersion | null, cloneDurationSeconds: number; overrides?: { title?: string; customImage?: string; customImageName?: string; customImageVersion?: number; abTestVariantIndex?: number } }) => {
            const now = Date.now();
            const id = `clone-${now}-${Math.random().toString(36).substr(2, 9)}`;
            const expiresAt = now + (cloneDurationSeconds * 1000);

            // Determine values (overrides take precedence, then coverVersion, then original)
            const finalTitle = overrides?.title ?? originalVideo.title;
            const finalImage = overrides?.customImage ?? coverVersion?.url ?? originalVideo.customImage;
            const finalImageName = overrides?.customImageName ?? coverVersion?.originalName ?? originalVideo.customImageName;
            const finalImageVersion = overrides?.customImageVersion ?? coverVersion?.version ?? originalVideo.customImageVersion;
            const finalVariantIndex = overrides?.abTestVariantIndex;

            // Create a shallow copy and remove fields that should NOT be in the clone
            // (to avoid undefined errors in Firestore and ensure clean state)
            const baseVideo = { ...originalVideo };
            delete baseVideo.mergedVideoData;
            delete baseVideo.publishedVideoId;
            delete baseVideo.fetchStatus;
            delete baseVideo.lastFetchAttempt;
            delete baseVideo.viewCount;
            delete baseVideo.likeCount;
            delete baseVideo.abTestTitles;
            delete baseVideo.abTestThumbnails;
            delete baseVideo.abTestResults;

            const newVideo: VideoDetails = {
                ...baseVideo,
                id,
                title: finalTitle,
                channelId: originalVideo.channelId || channelId,
                channelTitle: originalVideo.channelTitle || currentChannel?.name || '',
                channelAvatar: originalVideo.channelAvatar || currentChannel?.avatar || '',
                viewCount: originalVideo.viewCount || '0',
                publishedAt: originalVideo.publishedAt || new Date().toISOString(),
                likeCount: originalVideo.likeCount || '0',
                isCustom: true,
                isCloned: true,
                clonedFromId: originalVideo.id,
                createdAt: now,
                expiresAt,
                customImage: finalImage,
                customImageName: finalImageName,
                customImageVersion: finalImageVersion,
                coverHistory: originalVideo.coverHistory || [],
                isPlaylistOnly: originalVideo.isPlaylistOnly ?? false, // Inherit playlist-only status (default to false)

                // Initialize empty A/B test data
                abTestTitles: [],
                abTestThumbnails: [],
                abTestResults: { titles: [], thumbnails: [] },

                // Store linkage to variant
                ...(finalVariantIndex !== undefined ? { abTestVariantIndex: finalVariantIndex } : {})
            };

            // Optimistic Order Update
            const videoOrder = queryClient.getQueryData<string[]>(['settings', 'videoOrder', userId, channelId]) || [];
            const newOrder = [id, ...videoOrder];

            // Update cache and firestore
            queryClient.setQueryData(['settings', 'videoOrder', userId, channelId], newOrder);
            await SettingsService.updateVideoOrder(userId, channelId, newOrder);

            // Optimistically update videos cache
            queryClient.setQueryData<VideoDetails[]>(queryKey, (old) => {
                if (!old) return [newVideo];
                return [...old, newVideo];
            });

            await VideoService.addVideo(userId, channelId, newVideo);
            return id;
        }
    });

    // Packaging Mutations
    const saveDraftMutation = useMutation({
        mutationFn: async ({ videoId, expectedRevision }: { videoId: string, expectedRevision: number }) => {
            await VideoService.updateVideoSafe(userId, channelId, videoId, { isDraft: true }, expectedRevision);
        }
    });

    const createVersionMutation = useMutation({
        mutationFn: async ({ videoId, snapshot, expectedRevision }: { videoId: string, snapshot: PackagingVersion['configurationSnapshot'], expectedRevision: number }) => {
            const video = (queryClient.getQueryData<VideoDetails[]>(queryKey) || []).find(v => v.id === videoId);
            if (!video) return;

            const currentHistory = video.packagingHistory || [];
            const nextVersionNumber = currentHistory.length > 0
                ? Math.max(...currentHistory.map(v => v.versionNumber)) + 1
                : 1;

            const newVersion: PackagingVersion = {
                versionNumber: nextVersionNumber,
                startDate: Date.now(),
                endDate: null,
                configurationSnapshot: snapshot,
                revision: 1, // Start revision at 1 for the first snapshot in this version object? 
                // Wait, packagingRevision is at video level. This is fine.
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
            await VideoService.updateVideoSafe(userId, channelId, videoId, {
                packagingHistory: updatedHistory,
                isDraft: false
            }, expectedRevision);
        }
    });

    const addCheckinMutation = useMutation({
        mutationFn: async ({ videoId, versionNumber, checkin, expectedRevision }: { videoId: string, versionNumber: number, checkin: PackagingCheckin, expectedRevision: number }) => {
            const video = (queryClient.getQueryData<VideoDetails[]>(queryKey) || []).find(v => v.id === videoId);
            if (!video || !video.packagingHistory) return;

            const updatedHistory = video.packagingHistory.map(version => {
                if (version.versionNumber === versionNumber) {
                    return {
                        ...version,
                        checkins: [...(version.checkins || []), checkin]
                    };
                }
                return version;
            });

            await VideoService.updateVideoSafe(userId, channelId, videoId, { packagingHistory: updatedHistory }, expectedRevision);
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

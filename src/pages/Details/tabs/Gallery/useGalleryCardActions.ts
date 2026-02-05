/**
 * useGalleryCardActions
 * 
 * Hook that provides action handlers for Gallery Card menu items:
 * - Convert to Video (Home)
 * - Convert to Video in Playlist
 * - Clone to Home
 * - Clone to Playlist
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useVideos } from '../../../../core/hooks/useVideos';
import { useSettings } from '../../../../core/hooks/useSettings';
import { useUIStore } from '../../../../core/stores/uiStore';
import { PlaylistService } from '../../../../core/services/playlistService';
import type { GalleryItem } from '../../../../core/types/gallery';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { uploadImageToStorage } from '../../../../core/services/storageService';
import { resizeImageToBlob } from '../../../../core/utils/imageUtils';

interface UseGalleryCardActionsReturn {
    // Action handlers
    handleConvertToVideo: (item: GalleryItem) => Promise<void>;
    handleConvertToVideoInPlaylist: (item: GalleryItem, playlistId: string, playlistName: string) => Promise<void>;
    handleCloneToHome: (item: GalleryItem) => Promise<void>;
    handleCloneToPlaylist: (item: GalleryItem, playlistId: string, playlistName: string) => Promise<void>;
    handleSetAsCover: (item: GalleryItem) => Promise<void>;
    // Loading states
    isConverting: boolean;
    isCloning: boolean;
    isSettingCover: boolean;
}


export function useGalleryCardActions(video?: VideoDetails): UseGalleryCardActionsReturn {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { addCustomVideo, cloneVideo, updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { uploadDefaults, cloneSettings } = useSettings();
    const { showToast } = useUIStore();

    const [isConverting, setIsConverting] = useState(false);
    const [isCloning, setIsCloning] = useState(false);
    const [isSettingCover, setIsSettingCover] = useState(false);

    // Helper: Create base video data from gallery item
    const createVideoData = useCallback((item: GalleryItem): Omit<VideoDetails, 'id'> => {
        return {
            title: uploadDefaults.title || item.filename.replace(/\.[^/.]+$/, ''),
            description: uploadDefaults.description || '',
            tags: uploadDefaults.tags || [],
            thumbnail: item.originalUrl,
            customImage: item.originalUrl,
            customImageName: item.filename,
            channelId: currentChannel?.id || '',
            channelTitle: currentChannel?.name || '',
            channelAvatar: currentChannel?.avatar || '',
            publishedAt: new Date().toISOString(),
            viewCount: '1000000',
            duration: '1:02:11',
            isCustom: true
        };
    }, [uploadDefaults, currentChannel]);

    // Action 1: Convert to Video (Home)
    const handleConvertToVideo = useCallback(async (item: GalleryItem) => {
        if (!user || !currentChannel) return;

        setIsConverting(true);
        try {
            const videoData = createVideoData(item);
            await addCustomVideo(videoData);

            showToast(
                'Video created — click to view',
                'success',
                'view',
                () => navigate('/')
            );
        } catch (error) {
            console.error('Failed to convert to video:', error);
            showToast('Failed to create video', 'error');
        } finally {
            setIsConverting(false);
        }
    }, [user, currentChannel, createVideoData, addCustomVideo, showToast, navigate]);

    // Action 2: Convert to Video in Playlist
    const handleConvertToVideoInPlaylist = useCallback(async (
        item: GalleryItem,
        playlistId: string,
        playlistName: string
    ) => {
        if (!user || !currentChannel) return;

        setIsConverting(true);
        try {
            const videoData = {
                ...createVideoData(item),
                isPlaylistOnly: true
            };
            const videoId = await addCustomVideo(videoData);

            // Add to playlist
            await PlaylistService.addVideosToPlaylist(
                user.uid,
                currentChannel.id,
                playlistId,
                [videoId]
            );

            showToast(
                `Video added to "${playlistName}" — click to view`,
                'success',
                'view',
                () => navigate(`/playlists/${playlistId}`)
            );
        } catch (error) {
            console.error('Failed to convert to video in playlist:', error);
            showToast('Failed to create video', 'error');
        } finally {
            setIsConverting(false);
        }
    }, [user, currentChannel, createVideoData, addCustomVideo, showToast, navigate]);

    // Action 3: Clone to Home
    const handleCloneToHome = useCallback(async (item: GalleryItem) => {
        if (!user || !currentChannel) return;

        setIsCloning(true);
        try {
            // Create a minimal "original video" for clone source
            const originalVideo: VideoDetails = {
                id: `gallery-source-${item.id}`,
                title: uploadDefaults.title || item.filename.replace(/\.[^/.]+$/, ''),
                description: uploadDefaults.description || '',
                tags: uploadDefaults.tags || [],
                thumbnail: item.originalUrl,
                customImage: item.originalUrl,
                customImageName: item.filename,
                channelId: currentChannel.id,
                channelTitle: currentChannel.name || '',
                channelAvatar: currentChannel.avatar || '',
                publishedAt: new Date().toISOString(),
                viewCount: '1000000',
                duration: '1:02:11',
                isCustom: true,
                customImageVersion: 1
            };

            await cloneVideo({
                originalVideo,
                coverVersion: null,
                cloneDurationSeconds: cloneSettings?.cloneDurationSeconds || 3600
            });

            showToast(
                'Clone created — click to view',
                'success',
                'view',
                () => navigate('/')
            );
        } catch (error) {
            console.error('Failed to clone to home:', error);
            showToast('Failed to create clone', 'error');
        } finally {
            setIsCloning(false);
        }
    }, [user, currentChannel, uploadDefaults, cloneVideo, cloneSettings, showToast, navigate]);

    // Action 4: Clone to Playlist
    const handleCloneToPlaylist = useCallback(async (
        item: GalleryItem,
        playlistId: string,
        playlistName: string
    ) => {
        if (!user || !currentChannel) return;

        setIsCloning(true);
        try {
            const originalVideo: VideoDetails = {
                id: `gallery-source-${item.id}`,
                title: uploadDefaults.title || item.filename.replace(/\.[^/.]+$/, ''),
                description: uploadDefaults.description || '',
                tags: uploadDefaults.tags || [],
                thumbnail: item.originalUrl,
                customImage: item.originalUrl,
                customImageName: item.filename,
                channelId: currentChannel.id,
                channelTitle: currentChannel.name || '',
                channelAvatar: currentChannel.avatar || '',
                publishedAt: new Date().toISOString(),
                viewCount: '1000000',
                duration: '1:02:11',
                isCustom: true,
                isPlaylistOnly: true,
                customImageVersion: 1
            };

            const newVideoId = await cloneVideo({
                originalVideo,
                coverVersion: null,
                cloneDurationSeconds: cloneSettings?.cloneDurationSeconds || 3600
            });

            // Add to playlist
            await PlaylistService.addVideosToPlaylist(
                user.uid,
                currentChannel.id,
                playlistId,
                [newVideoId]
            );

            showToast(
                `Clone added to "${playlistName}" — click to view`,
                'success',
                'view',
                () => navigate(`/playlists/${playlistId}`)
            );
        } catch (error) {
            console.error('Failed to clone to playlist:', error);
            showToast('Failed to create clone', 'error');
        } finally {
            setIsCloning(false);
        }
    }, [user, currentChannel, uploadDefaults, cloneVideo, cloneSettings, showToast, navigate]);

    // Action 5: Set as Cover (Custom Videos Only)
    const handleSetAsCover = useCallback(async (item: GalleryItem) => {
        if (!user || !currentChannel || !video) return;

        // 1. Optimistic UI: Immediately update the cache & Show Loading Toast
        const queryKey = ['videos', user.uid, currentChannel.id];
        await queryClient.cancelQueries({ queryKey });

        const previousVideos = queryClient.getQueryData<VideoDetails[]>(queryKey);

        // Optimistically update the video in the list
        queryClient.setQueryData<VideoDetails[]>(queryKey, (old) => {
            if (!old) return old;
            return old.map(v => {
                if (v.id === video.id) {
                    return {
                        ...v,
                        thumbnail: item.originalUrl, // Use gallery URL immediately
                        customImage: item.originalUrl,
                    };
                }
                return v;
            });
        });

        // Show loading toast immediately (non-blocking)
        showToast('Updating cover...', 'loading');
        setIsSettingCover(true);

        try {
            // 2. Fetch the original image
            const response = await fetch(item.originalUrl);
            const blob = await response.blob();

            // 3. Resize/Compress (mimic PackagingTab - 1280px, 0.7 quality)
            const file = new File([blob], item.filename, { type: blob.type });
            const optimizedBlob = await resizeImageToBlob(file, 1280, 0.7);

            // 4. Upload to Cover Path
            const timestamp = Date.now();
            const safeFilename = item.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `users/${user.uid}/channels/${currentChannel.id}/videos/${video.id}/${timestamp}_${safeFilename}`;

            const newCoverUrl = await uploadImageToStorage(optimizedBlob, storagePath);

            // 5. Calculate Version
            const coverHistory = video.coverHistory || [];
            const historyMax = coverHistory.length > 0
                ? Math.max(...coverHistory.map(v => v.version))
                : 0;
            const currentMax = video.customImageVersion || 0;
            const nextVersion = Math.max(historyMax, currentMax) + 1;

            // 6. Update History
            let newHistory = [...coverHistory];
            if (video.customImage) {
                if (!newHistory.some(h => h.url === video.customImage)) {
                    newHistory = [{
                        url: video.customImage,
                        version: video.customImageVersion || 1,
                        timestamp: Date.now(),
                        originalName: video.customImageName
                    }, ...newHistory];
                }
            }

            // 7. Update Video (Firestore)
            // This will trigger a sync eventually, ensuring consistency
            await updateVideo({
                videoId: video.id,
                updates: {
                    customImage: newCoverUrl,
                    customImageName: item.filename,
                    customImageVersion: nextVersion,
                    thumbnail: newCoverUrl,
                    coverHistory: newHistory
                }
            });

            showToast('Cover updated', 'success');

        } catch (error) {
            console.error('Failed to set cover:', error);
            showToast('Failed to set cover', 'error');

            // Rollback optimistic update
            if (previousVideos) {
                queryClient.setQueryData(queryKey, previousVideos);
            }
        } finally {
            setIsSettingCover(false);
        }
    }, [user, currentChannel, video, showToast, updateVideo, queryClient]);


    return {
        handleConvertToVideo,
        handleConvertToVideoInPlaylist,
        handleCloneToHome,
        handleCloneToPlaylist,
        handleSetAsCover,
        isConverting,
        isCloning,
        isSettingCover
    };
}

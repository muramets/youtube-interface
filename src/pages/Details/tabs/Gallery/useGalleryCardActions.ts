/**
 * useGalleryCardActions
 * 
 * Hook that provides action handlers for Gallery Card menu items:
 * - Convert to Video (Home)
 * - Convert to Video in Playlist
 * - Clone to Home
 * - Clone to Playlist
 */

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

interface UseGalleryCardActionsReturn {
    // Action handlers
    handleConvertToVideo: (item: GalleryItem) => Promise<void>;
    handleConvertToVideoInPlaylist: (item: GalleryItem, playlistId: string, playlistName: string) => Promise<void>;
    handleCloneToHome: (item: GalleryItem) => Promise<void>;
    handleCloneToPlaylist: (item: GalleryItem, playlistId: string, playlistName: string) => Promise<void>;
    // Loading states
    isConverting: boolean;
    isCloning: boolean;
}

export function useGalleryCardActions(): UseGalleryCardActionsReturn {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { addCustomVideo, cloneVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { uploadDefaults, cloneSettings } = useSettings();
    const { showToast } = useUIStore();

    const [isConverting, setIsConverting] = useState(false);
    const [isCloning, setIsCloning] = useState(false);

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

    return {
        handleConvertToVideo,
        handleConvertToVideoInPlaylist,
        handleCloneToHome,
        handleCloneToPlaylist,
        isConverting,
        isCloning
    };
}

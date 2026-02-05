import { useCallback } from 'react';
import { deleteField } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useChannelStore } from '../stores/channelStore';
import { useVideos } from './useVideos';
import { deleteImageFromStorage } from '../services/storageService';

/**
 * Hook for managing thumbnail version actions (like, remove)
 * Now handles rating syncing between Cloned Videos and Gallery Items
 */
export const useThumbnailActions = (videoId: string) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { updateVideo, removeVideo, videos } = useVideos(user?.uid || '', currentChannel?.id || '');

    const handleRateImage = useCallback(async (version: number, rating: 1 | 0 | -1) => {
        if (!user || !currentChannel) return;

        const video = videos.find(v => v.id === videoId);
        if (!video) return;

        const operations: Promise<unknown>[] = [];

        // 1. If Cloned: Sync rating to Parent's Gallery Item by matching filename
        if (video.isCloned && video.clonedFromId && video.customImageName) {
            const parentVideo = videos.find(v => v.id === video.clonedFromId);

            if (parentVideo) {
                const galleryItems = parentVideo.galleryItems || [];

                // Find matching item by filename (safest link between clone cover and gallery source)
                const targetItemIndex = galleryItems.findIndex(item => item.filename === video.customImageName);

                if (targetItemIndex !== -1) {
                    const updatedGalleryItems = [...galleryItems];
                    updatedGalleryItems[targetItemIndex] = {
                        ...updatedGalleryItems[targetItemIndex],
                        rating: rating,
                        // Backward compatibility
                        isLiked: rating === 1
                    };

                    operations.push(
                        updateVideo({
                            videoId: parentVideo.id,
                            updates: { galleryItems: updatedGalleryItems }
                        })
                    );
                }
            }
        }

        // 2. Legacy: Update `likedThumbnailVersions` on the current video (for visual consistency on the card itself if still used)
        // We might deprecate this in favor of just using gallery data, but for now keep it for the "Heart" on the card
        const likedVersions = video.likedThumbnailVersions || [];
        let updatedLikedVersions = [...likedVersions];

        if (rating === 1) {
            if (!updatedLikedVersions.includes(version)) {
                updatedLikedVersions.push(version);
            }
        } else {
            updatedLikedVersions = updatedLikedVersions.filter(v => v !== version);
        }

        operations.push(
            updateVideo({
                videoId,
                updates: { likedThumbnailVersions: updatedLikedVersions }
            })
        );

        await Promise.all(operations);

    }, [user, currentChannel, videoId, videos, updateVideo]);

    const handleRemoveThumbnail = useCallback(async (version: number) => {
        if (!user || !currentChannel) return;

        const video = videos.find(v => v.id === videoId);
        if (!video) return;

        console.log('[useThumbnailActions] Removing thumbnail version:', version, 'from video:', videoId, 'isCloned:', video.isCloned);

        // If this is a clone, delete the clone AND remove thumbnail from original video's history
        if (video.isCloned && video.clonedFromId) {
            console.log('[useThumbnailActions] Deleting clone:', videoId);

            // Execute operations in parallel to avoid race conditions (visual glitches)
            const operations: Promise<unknown>[] = [removeVideo(videoId)];

            // Find original video and update history if found
            const originalVideo = videos.find(v => v.id === video.clonedFromId);
            if (originalVideo) {
                const updatedHistory = (originalVideo.coverHistory || []).filter(v => v.version !== version);
                console.log('[useThumbnailActions] Removing from original video history:', video.clonedFromId, 'updated history:', updatedHistory);

                operations.push(
                    updateVideo({
                        videoId: video.clonedFromId,
                        updates: { coverHistory: updatedHistory }
                    })
                );
            }

            await Promise.all(operations);
            return;
        }

        // For regular videos: remove from history and delete associated clones
        const itemToRemove = (video.coverHistory || []).find(v => v.version === version);
        const urlToCleanup = itemToRemove?.url;

        const updatedHistory = (video.coverHistory || []).filter(v => v.version !== version);
        console.log('[useThumbnailActions] Updated history:', updatedHistory);

        // Smart Cleanup: Only delete from Storage if NOT referenced in packaging or current
        if (urlToCleanup && urlToCleanup.includes('firebasestorage.googleapis.com')) {
            const isUsedInPackaging = (video.packagingHistory || []).some(v =>
                v.configurationSnapshot?.coverImage === urlToCleanup ||
                v.configurationSnapshot?.abTestVariants?.includes(urlToCleanup)
            );
            const isCurrent = video.customImage === urlToCleanup;

            if (!isUsedInPackaging && !isCurrent) {
                console.log('[useThumbnailActions] Smart Cleanup: Deleting unused file from storage', urlToCleanup);
                deleteImageFromStorage(urlToCleanup).catch((err: unknown) =>
                    console.error('[useThumbnailActions] Failed to cleanup storage:', err)
                );
            } else {
                console.log('[useThumbnailActions] Smart Cleanup: Preserving image (in use)', {
                    isUsedInPackaging,
                    isCurrent
                });
            }
        }

        // Find and remove associated clone
        const cloneToRemove = videos.find(v =>
            v.isCloned &&
            v.clonedFromId === videoId &&
            v.customImageVersion === version
        );

        if (cloneToRemove) {
            console.log('[useThumbnailActions] Found clone to remove:', cloneToRemove.id);
            await removeVideo(cloneToRemove.id);
        }

        // If removing current thumbnail, apply previous version from history (if exists)
        if (video.customImageVersion === version) {
            console.log('[useThumbnailActions] Removing current thumbnail');

            // Find the most recent version in updated history
            const previousVersion = updatedHistory.length > 0
                ? updatedHistory.reduce((max, v) => v.version > max.version ? v : max)
                : null;

            if (previousVersion) {
                console.log('[useThumbnailActions] Applying previous version:', previousVersion.version);
                await updateVideo({
                    videoId,
                    updates: {
                        customImage: previousVersion.url,
                        customImageName: previousVersion.originalName,
                        customImageVersion: previousVersion.version,
                        coverHistory: updatedHistory
                    }
                });
            } else {
                console.log('[useThumbnailActions] No history left, clearing thumbnail');
                await updateVideo({
                    videoId,
                    updates: {
                        customImage: '',
                        customImageName: '',
                        customImageVersion: deleteField() as unknown as number,
                        coverHistory: updatedHistory
                    }
                });
            }
        } else {
            console.log('[useThumbnailActions] Updating history only');
            await updateVideo({
                videoId,
                updates: { coverHistory: updatedHistory }
            });
        }
    }, [user, currentChannel, videoId, videos, updateVideo, removeVideo]);

    return {
        handleRateImage,
        handleRemoveThumbnail
    };
};

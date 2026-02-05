/**
 * useGallery Hook
 * 
 * React hook for managing Visual Gallery state and operations.
 * Handles uploads, sorting, ordering, and CRUD operations.
 */

import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import type { GalleryItem, GallerySortMode } from '../../../core/types/gallery';
import {
    addGalleryItem,
    removeGalleryItem,
    updateGalleryOrder,
    toggleGalleryItemLike,
    downloadGalleryItem
} from '../../../core/services/galleryService';

interface UseGalleryOptions {
    videoId: string;
    initialItems: GalleryItem[];
}

interface UseGalleryReturn {
    // Data
    items: GalleryItem[];
    sortedItems: GalleryItem[];

    // Loading states
    isUploading: boolean;
    uploadingFilename: string | null;

    // Sorting
    sortMode: GallerySortMode;
    setSortMode: (mode: GallerySortMode) => void;

    // Actions
    uploadImage: (file: File) => Promise<void>;
    removeImage: (item: GalleryItem) => Promise<void>;
    reorderItems: (reorderedItems: GalleryItem[]) => Promise<void>;
    toggleLike: (itemId: string) => Promise<void>;
    downloadOriginal: (item: GalleryItem) => Promise<void>;

    // Setters for external updates
    setItems: (items: GalleryItem[]) => void;
}

export const useGallery = ({ videoId, initialItems }: UseGalleryOptions): UseGalleryReturn => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // State
    const [items, setItems] = useState<GalleryItem[]>(initialItems);
    const [sortMode, setSortMode] = useState<GallerySortMode>('newest');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadingFilename, setUploadingFilename] = useState<string | null>(null);

    // Sorted items based on current sort mode
    const sortedItems = useMemo(() => {
        const sorted = [...items];

        switch (sortMode) {
            case 'newest':
                return sorted.sort((a, b) => b.uploadedAt - a.uploadedAt);
            case 'oldest':
                return sorted.sort((a, b) => a.uploadedAt - b.uploadedAt);
            case 'custom':
            default:
                return sorted.sort((a, b) => a.order - b.order);
        }
    }, [items, sortMode]);

    // Upload new image
    const uploadImage = useCallback(async (file: File) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        setIsUploading(true);
        setUploadingFilename(file.name);

        try {
            // Upload to server - useEffect will sync the new item from video.galleryItems prop
            // We don't do optimistic update here to avoid duplicates from race condition
            // (Firestore listener may fire before this function returns)
            await addGalleryItem(
                user.uid,
                currentChannel.id,
                videoId,
                file,
                items.length
            );

            // Small delay to allow Firestore listener to update items
            // before hiding the placeholder (prevents flicker)
            await new Promise(resolve => setTimeout(resolve, 300));
        } finally {
            setIsUploading(false);
            setUploadingFilename(null);
        }
    }, [user?.uid, currentChannel?.id, videoId, items.length]);

    // Remove image
    const removeImage = useCallback(async (item: GalleryItem) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // Optimistic update
        setItems(prev => prev.filter(i => i.id !== item.id));

        try {
            await removeGalleryItem(
                user.uid,
                currentChannel.id,
                videoId,
                item
            );
        } catch (error) {
            // Rollback on error
            setItems(prev => [...prev, item]);
            throw error;
        }
    }, [user?.uid, currentChannel?.id, videoId]);

    // Reorder items (for drag-and-drop)
    const reorderItems = useCallback(async (reorderedItems: GalleryItem[]) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // Calculate new order values 
        // We MUST update the order property here, otherwise the 'custom' sort 
        // (which uses .order) will revert the items back to their old positions
        // immediately after we switch sortMode to 'custom'.
        const itemsWithNewOrder = reorderedItems.map((item, index) => ({
            ...item,
            order: index
        }));

        // Optimistic update
        const previousItems = items;
        setItems(itemsWithNewOrder);

        // Auto-switch to custom sort mode if not already
        // This ensures the user sees the order they just created
        setSortMode('custom');

        try {
            await updateGalleryOrder(
                user.uid,
                currentChannel.id,
                videoId,
                itemsWithNewOrder
            );
        } catch (error) {
            // Rollback on error
            setItems(previousItems);
            throw error;
        }
    }, [user?.uid, currentChannel?.id, videoId, items]);

    // Toggle like
    const toggleLike = useCallback(async (itemId: string) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // Optimistic update
        setItems(prev => prev.map(item =>
            item.id === itemId
                ? { ...item, isLiked: !item.isLiked }
                : item
        ));

        try {
            await toggleGalleryItemLike(
                user.uid,
                currentChannel.id,
                videoId,
                itemId,
                items
            );
        } catch (error) {
            // Rollback on error
            setItems(prev => prev.map(item =>
                item.id === itemId
                    ? { ...item, isLiked: !item.isLiked }
                    : item
            ));
            throw error;
        }
    }, [user?.uid, currentChannel?.id, videoId, items]);

    // Download original
    const downloadOriginal = useCallback(async (item: GalleryItem) => {
        await downloadGalleryItem(item);
    }, []);

    return {
        items,
        sortedItems,
        isUploading,
        uploadingFilename,
        sortMode,
        setSortMode,
        uploadImage,
        removeImage,
        reorderItems,
        toggleLike,
        downloadOriginal,
        setItems
    };
};

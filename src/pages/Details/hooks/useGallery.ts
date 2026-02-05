/**
 * useGallery Hook
 * 
 * React hook for managing Visual Gallery state and operations.
 * Handles uploads, sorting, ordering, and CRUD operations.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import type { GalleryItem, GallerySortMode, GallerySource, GallerySourceType } from '../../../core/types/gallery';
import { DEFAULT_SOURCE_ID } from '../../../core/types/gallery';
import {
    addGalleryItem,
    removeGalleryItem,
    updateGalleryOrder,
    setGalleryItemRating,
    downloadGalleryItem,
    addGallerySource,
    deleteGallerySource,
    ensureDefaultSource,
    moveItemToSource,
    updateGallerySource,
    prepareGalleryItem,
    saveGalleryItems
} from '../../../core/services/galleryService';

interface UseGalleryOptions {
    videoId: string;
    initialItems: GalleryItem[];
    initialSources?: GallerySource[];
}

// Type for files currently being uploaded
export interface UploadingFile {
    id: string;        // Unique ID for React key
    filename: string;  // Display name
    status: 'pending' | 'uploading' | 'done';
}

interface UseGalleryReturn {
    // Data
    items: GalleryItem[];
    sortedItems: GalleryItem[];
    filteredItems: GalleryItem[];

    // Sources
    sources: GallerySource[];
    activeSourceId: string | null;
    setActiveSourceId: (id: string | null) => void;

    // Loading states
    isUploading: boolean;
    uploadingFiles: UploadingFile[];

    // Sorting
    sortMode: GallerySortMode;
    setSortMode: (mode: GallerySortMode) => void;

    // Actions
    uploadImage: (file: File) => Promise<void>;
    uploadImages: (files: File[]) => Promise<void>;
    removeImage: (item: GalleryItem) => Promise<void>;
    reorderItems: (reorderedItems: GalleryItem[]) => Promise<void>;
    rateImage: (itemId: string, rating: 1 | 0 | -1) => Promise<void>;
    downloadOriginal: (item: GalleryItem) => Promise<void>;

    // Source Actions
    addSource: (data: { type: GallerySourceType; label: string; url?: string }) => Promise<GallerySource>;
    deleteSource: (sourceId: string) => Promise<void>;
    updateSource: (sourceId: string, data: { type?: GallerySourceType; label?: string; url?: string }) => Promise<void>;
    moveItemToSource: (itemId: string, newSourceId: string) => Promise<void>;

    // Setters for external updates
    setItems: (items: GalleryItem[]) => void;
    setSources: (sources: GallerySource[]) => void;
}

export const useGallery = ({ videoId, initialItems, initialSources = [] }: UseGalleryOptions): UseGalleryReturn => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // State
    const [items, setItems] = useState<GalleryItem[]>(initialItems);
    const [sources, setSources] = useState<GallerySource[]>(initialSources);
    const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
    const [sortMode, setSortMode] = useState<GallerySortMode>('newest');
    const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);

    // Track mount time to identify new items (prevent removing placeholders for old items with same name)
    const mountTimeRef = useRef(0);
    // Initialize mount time on client side
    useEffect(() => {
        mountTimeRef.current = Date.now();
    }, []);

    // NOTE: We removed the automatic sync of initialItems and initialSources here
    // because it causes conflicts with optimistic updates and infinite loops.
    // Synchronization is now handled explicitly by the consumer (GalleryTab.tsx).

    // Initialize default source on first load
    useEffect(() => {
        if (isInitialized || !user?.uid || !currentChannel?.id) return;

        const initSources = async () => {
            try {
                const { sources: newSources, items: newItems } = await ensureDefaultSource(
                    user.uid,
                    currentChannel.id,
                    videoId,
                    sources,
                    items
                );
                setSources(newSources);
                setItems(newItems);
                // Auto-select first source
                if (newSources.length > 0 && !activeSourceId) {
                    setActiveSourceId(newSources[0].id);
                }
            } catch (error) {
                console.error('Failed to initialize gallery sources:', error);
            }
            setIsInitialized(true);
        };

        initSources();
        // CRITICAL: Only depend on values that should trigger re-initialization
        // DO NOT include sources, items, or activeSourceId - they change DURING initialization!
    }, [user, currentChannel, videoId, isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

    // Derived state for backwards compatibility
    const isUploading = uploadingFiles.length > 0;

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

    // Filtered items by active source
    const filteredItems = useMemo(() => {
        if (!activeSourceId) return sortedItems;
        return sortedItems.filter(item => item.sourceId === activeSourceId);
    }, [sortedItems, activeSourceId]);

    // Upload single image
    const uploadImage = useCallback(async (file: File) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Add to uploading files
        setUploadingFiles(prev => [
            ...prev,
            { id: uploadId, filename: file.name, status: 'uploading' }
        ]);

        // Safety cleanup timeout (15s)
        setTimeout(() => {
            setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
        }, 15000);

        try {
            const item = await addGalleryItem(
                user.uid,
                currentChannel.id,
                videoId,
                file,
                items.length,
                activeSourceId || DEFAULT_SOURCE_ID
            );

            // Manual cleanup on success
            setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));

            // Note: addGalleryItem (singular) already saves to DB,
            // so we don't strictly need optimistic update here, 
            // but we could do it for consistency if we returned the item.
            // For now, reliance on Firestore listener for single item is acceptable,
            // OR we can optimistic update:
            setItems(prev => [...prev, item]);

        } catch (error) {
            // Remove on error
            setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
            throw error;
        }
    }, [user, currentChannel, videoId, items.length, activeSourceId]);

    // Upload multiple images (batch)
    const uploadImages = useCallback(async (files: File[]) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // Create upload entries for all files
        const uploadEntries: UploadingFile[] = files.map((file, index) => ({
            id: `upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
            filename: file.name,
            status: 'pending' as const
        }));

        // Add all files to uploading state immediately
        setUploadingFiles(prev => [...prev, ...uploadEntries]);

        const successfulItems: GalleryItem[] = [];

        // Upload all files in parallel
        await Promise.all(
            files.map(async (file, index) => {
                const uploadId = uploadEntries[index].id;

                // Mark as uploading
                setUploadingFiles(prev =>
                    prev.map(f => f.id === uploadId ? { ...f, status: 'uploading' as const } : f)
                );

                // Safety cleanup timeout (15s)
                setTimeout(() => {
                    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
                }, 15000);

                try {
                    // 1. Prepare item (Upload + Create Object) - NO DB WRITE YET
                    const item = await prepareGalleryItem(
                        user!.uid,
                        currentChannel!.id,
                        videoId,
                        file,
                        items.length + index, // Optimistic order index
                        activeSourceId || DEFAULT_SOURCE_ID
                    );

                    // 2. Optimistic Update: Add to local state immediately
                    // This ensures the "Real Card" appears as soon as this individual file is ready
                    setItems(prev => [...prev, item]);
                    successfulItems.push(item);

                    // Cleanup uploading state for this file (it's now in items)
                    // The useEffect monitoring 'items' will also do this, but explicit is safer
                    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));

                } catch (error) {
                    console.error(`Failed to upload ${file.name}:`, error);
                    // Remove failure from uploading state
                    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
                    // Check if we should rethrow? For batch, maybe we just log and continue?
                    // But if ALL fail, we should probably know. 
                    // For now, partial success is allowed.
                }
            })
        );

        // 3. Batch Save: Write all successful items to Firestore in ONE go
        if (successfulItems.length > 0) {
            try {
                // We need to re-sort successfulItems by order because Promise.all 
                // might finish in random order, but arrayUnion interaction is safer if sorted (though set doesn't care)
                // However, the order field is already set correctly individually.
                await saveGalleryItems(
                    user.uid,
                    currentChannel.id,
                    videoId,
                    successfulItems
                );
            } catch (error) {
                console.error('Failed to save batch to Firestore:', error);
                // Rollback? Complicated for batch. 
                // For now, rely on optimistic state and maybe show toast error if provided context
                // Or remove them from items?
                // setItems(prev => prev.filter(i => !successfulItems.find(si => si.id === i.id)));
                throw error;
            }
        }
    }, [user, currentChannel, videoId, items.length, activeSourceId]);

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
    }, [user, currentChannel, videoId]);

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
    }, [user, currentChannel, videoId, items]);

    // Rate image (Like/Dislike/None)
    const rateImage = useCallback(async (itemId: string, rating: 1 | 0 | -1) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // Optimistic update
        const previousItems = items;
        setItems(prev => prev.map(item =>
            item.id === itemId
                ? { ...item, rating, isLiked: rating === 1 }
                : item
        ));

        try {
            await setGalleryItemRating(
                user.uid,
                currentChannel.id,
                videoId,
                itemId,
                rating,
                items
            );
        } catch (error) {
            // Rollback on error
            setItems(previousItems);
            throw error;
        }
    }, [user, currentChannel, videoId, items]);

    // Download original
    const downloadOriginal = useCallback(async (item: GalleryItem) => {
        await downloadGalleryItem(item);
    }, []);

    // Add a new source
    const addSourceHandler = useCallback(async (data: { type: GallerySourceType; label: string; url?: string }): Promise<GallerySource> => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        const newSource = await addGallerySource(
            user.uid,
            currentChannel.id,
            videoId,
            data
        );

        // Optimistic update handled by Firestore listener, but set active
        setActiveSourceId(newSource.id);
        return newSource;
    }, [user, currentChannel, videoId]);

    // Update source
    const updateSourceHandler = useCallback(async (sourceId: string, data: { type?: GallerySourceType; label?: string; url?: string }) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // Optimistic update
        setSources(prev => prev.map(s => s.id === sourceId ? { ...s, ...data } : s));

        await updateGallerySource(
            user.uid,
            currentChannel.id,
            videoId,
            sourceId,
            data,
            sources
        );
    }, [user, currentChannel, videoId, sources]);

    // Delete a source and its items
    const deleteSourceHandler = useCallback(async (sourceId: string) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // Don't delete the default "Original Video" source
        if (sourceId === DEFAULT_SOURCE_ID) {
            throw new Error('Cannot delete the default source');
        }

        await deleteGallerySource(
            user.uid,
            currentChannel.id,
            videoId,
            sourceId,
            items,
            sources
        );

        // Switch to first remaining source
        const remainingSources = sources.filter(s => s.id !== sourceId);
        if (remainingSources.length > 0) {
            setActiveSourceId(remainingSources[0].id);
        }
    }, [user, currentChannel, videoId, items, sources]);

    // Move an item to a different source
    const moveItemToSourceHandler = useCallback(async (itemId: string, newSourceId: string) => {
        if (!user?.uid || !currentChannel?.id) {
            throw new Error('User or channel not available');
        }

        // 1. Optimistic update immediately
        const previousItems = items;
        setItems(prev => prev.map(item =>
            item.id === itemId
                ? { ...item, sourceId: newSourceId }
                : item
        ));

        try {
            // 2. Perform API call
            await moveItemToSource(
                user.uid,
                currentChannel.id,
                videoId,
                itemId,
                newSourceId,
                items
            );
        } catch (error) {
            // 3. Rollback on error
            console.error('Failed to move item:', error);
            setItems(previousItems);
        }
    }, [user, currentChannel, videoId, items]);

    return {
        items,
        sortedItems,
        filteredItems,
        sources,
        activeSourceId,
        setActiveSourceId,
        isUploading,
        uploadingFiles,
        sortMode,
        setSortMode,
        uploadImage,
        uploadImages,
        removeImage,
        reorderItems,
        rateImage,
        downloadOriginal,
        addSource: addSourceHandler,
        deleteSource: deleteSourceHandler,
        updateSource: updateSourceHandler,
        moveItemToSource: moveItemToSourceHandler,
        setItems,
        setSources
    };
};

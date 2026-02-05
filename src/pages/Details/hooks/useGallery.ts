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
    toggleGalleryItemLike,
    downloadGalleryItem,
    addGallerySource,
    deleteGallerySource,
    ensureDefaultSource,
    moveItemToSource,
    updateGallerySource
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
    toggleLike: (itemId: string) => Promise<void>;
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
    // Track mount time to identify new items (prevent removing placeholders for old items with same name)
    const mountTimeRef = useRef(0);
    // Initialize mount time on client side
    useEffect(() => {
        mountTimeRef.current = Date.now();
    }, []);

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
    }, [user?.uid, currentChannel?.id, videoId, isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

    // Smart cleanup: Remove uploading files if they appear in items
    useEffect(() => {
        setUploadingFiles(prev => {
            const active = prev.filter(uf => {
                // Keep if NOT in items OR if in items but uploaded before mount (old item)
                // Logic: Remove if (In items AND item.uploadedAt > mountTime)
                const isNewItem = items.some(item => item.filename === uf.filename && item.uploadedAt > mountTimeRef.current);
                return !isNewItem;
            });
            return active.length < prev.length ? active : prev;
        });
    }, [items]);

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
            await addGalleryItem(
                user.uid,
                currentChannel.id,
                videoId,
                file,
                items.length,
                activeSourceId || DEFAULT_SOURCE_ID
            );
            // Cleanup handled by useEffect watching items
        } catch (error) {
            // Remove on error
            setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
            throw error;
        }
    }, [user?.uid, currentChannel?.id, videoId, items.length, activeSourceId]);

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
                    await addGalleryItem(
                        user.uid,
                        currentChannel.id,
                        videoId,
                        file,
                        items.length + index,
                        activeSourceId || DEFAULT_SOURCE_ID
                    );
                    // Cleanup handled by useEffect watching items
                } catch (error) {
                    // Remove on error
                    setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
                    throw error;
                }
            })
        );
    }, [user?.uid, currentChannel?.id, videoId, items.length, activeSourceId]);

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
    }, [user?.uid, currentChannel?.id, videoId]);

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
    }, [user?.uid, currentChannel?.id, videoId, sources]);

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
    }, [user?.uid, currentChannel?.id, videoId, items, sources]);

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
    }, [user?.uid, currentChannel?.id, videoId, items]);

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
        toggleLike,
        downloadOriginal,
        addSource: addSourceHandler,
        deleteSource: deleteSourceHandler,
        updateSource: updateSourceHandler,
        moveItemToSource: moveItemToSourceHandler,
        setItems,
        setSources
    };
};

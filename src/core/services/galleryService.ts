/**
 * Gallery Service
 * 
 * CRUD operations for Visual Gallery - managing gallery items in Firestore
 * and coordinating with Storage for file uploads/downloads.
 */

import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { v4 as uuidv4 } from 'uuid';
import type { GalleryItem, GallerySource, GallerySourceType } from '../types/gallery';
import { DEFAULT_SOURCE_ID } from '../types/gallery';
import {
    uploadGalleryImage,
    waitForThumbnail,
    deleteGalleryImage,
    triggerFileDownload
} from './storageService';

/**
 * Add an image to video's gallery.
 * 
 * Flow:
 * 1. Upload original to Storage
 * 2. Wait for Firebase Extension to generate thumbnail
 * 3. Add GalleryItem to video document in Firestore
 * 
 * @returns The created GalleryItem
 */
export const addGalleryItem = async (
    userId: string,
    channelId: string,
    videoId: string,
    file: File,
    existingItemsCount: number,
    sourceId?: string
): Promise<GalleryItem> => {
    // 1. Upload to Storage
    const { storagePath, originalUrl, thumbnailPath, filename, fileSize } = await uploadGalleryImage(
        userId,
        channelId,
        videoId,
        file
    );

    // 2. Wait for thumbnail generation (using list polling to avoid console 404s)
    let thumbnailUrl: string;
    try {
        thumbnailUrl = await waitForThumbnail(thumbnailPath);
    } catch {
        // If thumbnail times out, use original as fallback
        console.warn('Thumbnail generation timed out, using original as thumbnail');
        thumbnailUrl = originalUrl;
    }

    // 3. Create GalleryItem
    const galleryItem: GalleryItem = {
        id: uuidv4(),
        filename,
        originalUrl,
        thumbnailUrl,
        storagePath,
        uploadedAt: Date.now(),
        order: existingItemsCount, // Append to end
        fileSize,
        sourceId: sourceId || DEFAULT_SOURCE_ID
    };

    // 4. Add to Firestore
    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        galleryItems: arrayUnion(galleryItem)
    });

    return galleryItem;
};

/**
 * Remove an image from video's gallery.
 * 
 * Flow:
 * 1. Delete from Storage (original + thumbnail)
 * 2. Remove from Firestore
 */
export const removeGalleryItem = async (
    userId: string,
    channelId: string,
    videoId: string,
    item: GalleryItem
): Promise<void> => {
    // 1. Delete from Storage
    await deleteGalleryImage(item.storagePath);

    // 2. Remove from Firestore
    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        galleryItems: arrayRemove(item)
    });
};

/**
 * Update gallery items order (for drag-and-drop).
 * Single Firestore write with reordered array.
 */
export const updateGalleryOrder = async (
    userId: string,
    channelId: string,
    videoId: string,
    reorderedItems: GalleryItem[]
): Promise<void> => {
    // Update order field for each item
    const updatedItems = reorderedItems.map((item, index) => ({
        ...item,
        order: index
    }));

    // Replace entire array
    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        galleryItems: updatedItems
    });
};

/**
 * Toggle liked status for a gallery item.
 */
export const toggleGalleryItemLike = async (
    userId: string,
    channelId: string,
    videoId: string,
    itemId: string,
    currentItems: GalleryItem[]
): Promise<GalleryItem[]> => {
    // Find and toggle the item
    const updatedItems = currentItems.map(item =>
        item.id === itemId
            ? { ...item, isLiked: !item.isLiked }
            : item
    );

    // Update Firestore
    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        galleryItems: updatedItems
    });

    return updatedItems;
};

/**
 * Download original file.
 * Triggers browser download dialog.
 */
export const downloadGalleryItem = async (item: GalleryItem): Promise<void> => {
    await triggerFileDownload(item.originalUrl, item.filename);
};

/**
 * Batch delete all gallery items for a video.
 * Called when video is deleted.
 */
export const deleteAllGalleryItems = async (
    userId: string,
    channelId: string,
    videoId: string,
    items: GalleryItem[]
): Promise<void> => {
    // Delete all from Storage in parallel
    await Promise.all(items.map(item => deleteGalleryImage(item.storagePath)));

    // Clear from Firestore
    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        galleryItems: []
    });
};

// ============================================================================
// GALLERY SOURCES CRUD
// ============================================================================

/**
 * Add a new source to video's gallery.
 * 
 * @returns The created GallerySource
 */
export const addGallerySource = async (
    userId: string,
    channelId: string,
    videoId: string,
    data: { type: GallerySourceType; label: string; url?: string }
): Promise<GallerySource> => {
    const source: GallerySource = {
        id: uuidv4(),
        type: data.type,
        label: data.label,
        url: data.url,
        createdAt: Date.now()
    };

    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        gallerySources: arrayUnion(source)
    });

    return source;
};

/**
 * Update a gallery source (rename/update URL).
 */
export const updateGallerySource = async (
    userId: string,
    channelId: string,
    videoId: string,
    sourceId: string,
    updateData: { label?: string; url?: string; type?: GallerySourceType },
    currentSources: GallerySource[]
): Promise<GallerySource[]> => {
    const updatedSources = currentSources.map(s =>
        s.id === sourceId ? { ...s, ...updateData } : s
    );

    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        gallerySources: updatedSources
    });

    return updatedSources;
};

/**
 * Delete a source and all its associated items.
 */
export const deleteGallerySource = async (
    userId: string,
    channelId: string,
    videoId: string,
    sourceId: string,
    currentItems: GalleryItem[],
    currentSources: GallerySource[]
): Promise<void> => {
    // Find source to delete
    const sourceToDelete = currentSources.find(s => s.id === sourceId);
    if (!sourceToDelete) return;

    // Find and delete all items belonging to this source
    const itemsToDelete = currentItems.filter(item => item.sourceId === sourceId);

    // Delete from Storage in parallel
    await Promise.all(itemsToDelete.map(item => deleteGalleryImage(item.storagePath)));

    // Update Firestore: remove source and its items
    const updatedItems = currentItems.filter(item => item.sourceId !== sourceId);
    const updatedSources = currentSources.filter(s => s.id !== sourceId);

    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        gallerySources: updatedSources,
        galleryItems: updatedItems
    });
};

/**
 * Ensure default "Original Video" source exists.
 * Creates it if gallerySources array is empty or missing.
 * Also migrates existing items without sourceId to default source.
 */
export const ensureDefaultSource = async (
    userId: string,
    channelId: string,
    videoId: string,
    currentSources: GallerySource[],
    currentItems: GalleryItem[]
): Promise<{ sources: GallerySource[]; items: GalleryItem[] }> => {
    // If sources exist, do nothing except migrate orphan items
    if (currentSources.length > 0) {
        // Check for orphan items (no sourceId)
        const orphanItems = currentItems.filter(item => !item.sourceId);
        if (orphanItems.length > 0) {
            const defaultSource = currentSources.find(s => s.id === DEFAULT_SOURCE_ID) || currentSources[0];
            const migratedItems = currentItems.map(item =>
                item.sourceId ? item : { ...item, sourceId: defaultSource.id }
            );

            const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
            await updateDoc(videoRef, { galleryItems: migratedItems });

            return { sources: currentSources, items: migratedItems };
        }
        return { sources: currentSources, items: currentItems };
    }

    // Create default source
    const defaultSource: GallerySource = {
        id: DEFAULT_SOURCE_ID,
        type: 'original',
        label: 'Original Video',
        createdAt: Date.now()
    };

    // Migrate all existing items to default source
    const migratedItems = currentItems.map(item => ({
        ...item,
        sourceId: DEFAULT_SOURCE_ID
    }));

    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, {
        gallerySources: [defaultSource],
        galleryItems: migratedItems
    });

    return { sources: [defaultSource], items: migratedItems };
};


/**
 * Move a gallery item to a different source.
 * Updates the item's sourceId in Firestore.
 */
export const moveItemToSource = async (
    userId: string,
    channelId: string,
    videoId: string,
    itemId: string,
    newSourceId: string,
    currentItems: GalleryItem[]
): Promise<GalleryItem[]> => {
    const updatedItems = currentItems.map(item =>
        item.id === itemId ? { ...item, sourceId: newSourceId } : item
    );

    const videoRef = doc(db, 'users', userId, 'channels', channelId, 'videos', videoId);
    await updateDoc(videoRef, { galleryItems: updatedItems });

    return updatedItems;
};

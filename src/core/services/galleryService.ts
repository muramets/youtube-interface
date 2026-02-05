/**
 * Gallery Service
 * 
 * CRUD operations for Visual Gallery - managing gallery items in Firestore
 * and coordinating with Storage for file uploads/downloads.
 */

import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { v4 as uuidv4 } from 'uuid';
import type { GalleryItem } from '../types/gallery';
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
    existingItemsCount: number
): Promise<GalleryItem> => {
    // 1. Upload to Storage
    const { storagePath, originalUrl, thumbnailPath, filename, fileSize } = await uploadGalleryImage(
        userId,
        channelId,
        videoId,
        file
    );

    // 2. Wait for thumbnail generation
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
        fileSize
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

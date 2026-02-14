import { storage } from '../../config/firebase';

import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';

export const deleteImageFromStorage = async (url: string): Promise<void> => {
    try {
        const storageRef = ref(storage, url);
        await deleteObject(storageRef);
    } catch (error: unknown) {
        // Ignore "object not found" errors, as the file might already be gone
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'storage/object-not-found') {
            return;
        }
        console.error('Error deleting image from storage:', error);
        throw error;
    }
}


/**
 * Recursively deletes all files and subfolders at a given path.
 * This is crucial for cleaning up all assets associated with a video (covers, A/B variants, etc.)
 * without relying on stored URLs.
 */
export const deleteFolder = async (path: string): Promise<void> => {
    const listRef = ref(storage, path);
    try {
        const res = await listAll(listRef);

        // Recursively delete subfolders
        const folderPromises = res.prefixes.map((folderRef) => deleteFolder(folderRef.fullPath));
        await Promise.all(folderPromises);

        // Delete files in this folder
        const filePromises = res.items.map((itemRef) => deleteObject(itemRef));
        await Promise.all(filePromises);
    } catch (error: unknown) {
        // Ignore "object not found" as it means the folder/file is already gone
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'storage/object-not-found') {
            return;
        }
        console.error(`Error deleting folder ${path}:`, error);
        // We do NOT throw here to allow partial cleanup to proceed if possible, 
        // essentially "best effort" deletion for cleanup tasks.
    }
};


export const uploadImageToStorage = async (file: Blob, path: string): Promise<string> => {
    const storageRef = ref(storage, path);
    const metadata = {
        cacheControl: 'public,max-age=31536000', // Cache for 1 year
    };
    const snapshot = await uploadBytes(storageRef, file, metadata);
    return getDownloadURL(snapshot.ref);
};

export const uploadBase64ToStorage = async (base64String: string, userId: string): Promise<string> => {
    if (!base64String.startsWith('data:image')) return base64String;

    const blob = dataURLtoBlob(base64String);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const path = `covers/${userId}/legacy_${timestamp}_${randomId}.jpg`;

    return uploadImageToStorage(blob, path);
};

export const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};

// ============================================================================
// CHAT ATTACHMENT STORAGE
// ============================================================================

/**
 * Upload a chat attachment (image, audio, or video) to Firebase Storage.
 *
 * Storage path: users/{userId}/channels/{channelId}/chatAttachments/{conversationId}/{timestamp}_{filename}
 */
export const uploadChatAttachment = async (
    userId: string,
    channelId: string,
    conversationId: string,
    file: File
): Promise<{ storagePath: string; downloadUrl: string }> => {
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `users/${userId}/channels/${channelId}/chatAttachments/${conversationId}/${timestamp}_${safeFilename}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file, {
        contentType: file.type,
        cacheControl: 'public,max-age=31536000',
        customMetadata: {
            originalFilename: file.name,
            uploadedAt: new Date().toISOString(),
        },
    });

    const downloadUrl = await getDownloadURL(storageRef);
    return { storagePath, downloadUrl };
};

/**
 * Upload a chat attachment to a staging area (no conversationId required).
 * Used for eager upload — files upload immediately when attached.
 *
 * Storage path: users/{userId}/channels/{channelId}/chatAttachments/staging/{uuid}_{filename}
 */
export const uploadStagingAttachment = async (
    userId: string,
    channelId: string,
    fileId: string,
    file: File
): Promise<{ storagePath: string; downloadUrl: string }> => {
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `users/${userId}/channels/${channelId}/chatAttachments/staging/${fileId}_${safeFilename}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file, {
        contentType: file.type,
        cacheControl: 'public,max-age=31536000',
        customMetadata: {
            originalFilename: file.name,
            uploadedAt: new Date().toISOString(),
        },
    });

    const downloadUrl = await getDownloadURL(storageRef);
    return { storagePath, downloadUrl };
};

/**
 * Delete a staging attachment from Firebase Storage.
 * Used when user removes a file from the input area before sending.
 */
export const deleteStagingAttachment = async (storagePath: string): Promise<void> => {
    try {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'storage/object-not-found') {
            return;
        }
        console.error('Error deleting staging attachment:', error);
    }
};

// ============================================================================
// CSV SNAPSHOT STORAGE (Hybrid Approach)
// ============================================================================

/**
 * BUSINESS LOGIC: CSV File Storage Management
 * 
 * Storage Structure:
 * gs://bucket/users/{userId}/channels/{channelId}/videos/{videoId}/snapshots/{snapshotId}.csv
 * 
 * Benefits:
 * - No Firestore document size limits (1MB)
 * - Cheaper storage costs
 * - Original CSV files preserved
 * - Scalable to thousands of snapshots
 */

/**
 * Upload a CSV file to Cloud Storage.
 * 
 * @param userId - User ID
 * @param channelId - Channel ID
 * @param videoId - Video ID
 * @param snapshotId - Unique snapshot ID (e.g., "snap_1704672000000_v1")
 * @param file - CSV file to upload
 * @returns Storage path and download URL
 */
export const uploadCsvSnapshot = async (
    userId: string,
    channelId: string,
    videoId: string,
    snapshotId: string,
    file: File
): Promise<{ storagePath: string; downloadUrl: string }> => {
    try {
        // Construct storage path
        const storagePath = `users/${userId}/channels/${channelId}/videos/${videoId}/snapshots/${snapshotId}.csv`;
        const storageRef = ref(storage, storagePath);

        // Upload file with metadata
        await uploadBytes(storageRef, file, {
            contentType: 'text/csv',
            customMetadata: {
                snapshotId,
                uploadedAt: new Date().toISOString()
            }
        });

        // Get download URL
        const downloadUrl = await getDownloadURL(storageRef);

        return { storagePath, downloadUrl };
    } catch (error) {
        console.error('Error uploading CSV to Storage:', error);
        throw error;
    }
};

/**
 * Download a CSV file from Cloud Storage.
 * 
 * @param storagePath - Full storage path (e.g., "users/.../snap_v1.csv")
 * @returns CSV file as Blob
 */
// Helper to timeout a promise
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(errorMessage));
        }, timeoutMs);
    });

    return Promise.race([
        promise.then((res) => {
            clearTimeout(timeoutId);
            return res;
        }),
        timeoutPromise
    ]);
};

/**
 * Download a CSV file from Cloud Storage.
 * 
 * @param storagePath - Full storage path (e.g., "users/.../snap_v1.csv")
 * @returns CSV file as Blob
 */
export const downloadCsvSnapshot = async (storagePath: string): Promise<Blob> => {
    try {
        const storageRef = ref(storage, storagePath);

        // Add 15s timeout for getting URL
        const downloadUrl = await withTimeout(
            getDownloadURL(storageRef),
            15000,
            'Timeout getting download URL'
        );

        // Fetch the file with 30s timeout
        // No cache-busting: snapshot CSVs are immutable, browser cache is safe
        const fetchPromise = fetch(downloadUrl).then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to download CSV: ${response.statusText}`);
            }
            return response.blob();
        });

        return await withTimeout(
            fetchPromise,
            30000,
            'Timeout downloading CSV file'
        );
    } catch (error) {
        console.error('Error downloading CSV from Storage:', error);
        throw error;
    }
};

/**
 * Delete a CSV file from Cloud Storage.
 * 
 * @param storagePath - Full storage path
 */
export const deleteCsvSnapshot = async (storagePath: string): Promise<void> => {
    try {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
    } catch (error: unknown) {
        // Ignore "object not found" errors
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'storage/object-not-found') {
            return;
        }
        console.error('Error deleting CSV from Storage:', error);
        throw error;
    }
}


/**
 * Get download URL for a CSV file without downloading it.
 * 
 * @param storagePath - Full storage path
 * @returns Download URL
 */
export const getCsvDownloadUrl = async (storagePath: string): Promise<string> => {
    try {
        const storageRef = ref(storage, storagePath);
        return await getDownloadURL(storageRef);
    } catch (error) {
        console.error('Error getting download URL:', error);
        throw error;
    }
};


// ============================================================================
// AUDIO TRACK STORAGE
// ============================================================================

/**
 * Upload an audio file (vocal or instrumental variant) for a track.
 *
 * Storage path: users/{userId}/channels/{channelId}/tracks/{trackId}/{variant}.{ext}
 */
export const uploadTrackAudio = async (
    userId: string,
    channelId: string,
    trackId: string,
    variant: 'vocal' | 'instrumental',
    file: File
): Promise<{ storagePath: string; downloadUrl: string }> => {
    const ext = file.name.split('.').pop() || 'mp3';
    const storagePath = `users/${userId}/channels/${channelId}/tracks/${trackId}/${variant}.${ext}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file, {
        contentType: file.type || 'audio/mpeg',
        cacheControl: 'public,max-age=31536000',
        customMetadata: {
            originalFilename: file.name,
            variant,
            uploadedAt: new Date().toISOString(),
        },
    });

    const downloadUrl = await getDownloadURL(storageRef);
    // Append cache-busting param — Firebase Storage returns the same URL on re-upload,
    // so browsers/workbox serve stale cached files without this.
    const cacheBustedUrl = `${downloadUrl}&v=${Date.now()}`;
    return { storagePath, downloadUrl: cacheBustedUrl };
};

/**
 * Refresh a download URL from a storage path.
 * Used when stored download URL has an expired/revoked token (403).
 */
export const refreshAudioUrl = async (storagePath: string): Promise<string> => {
    const storageRef = ref(storage, storagePath);
    const freshUrl = await getDownloadURL(storageRef);
    return `${freshUrl}&v=${Date.now()}`;
};

/**
 * Delete an audio file for a track variant.
 */
export const deleteTrackAudio = async (storagePath: string): Promise<void> => {
    try {
        const storageRef = ref(storage, storagePath);
        await deleteObject(storageRef);
    } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'storage/object-not-found') {
            return;
        }
        console.error('Error deleting track audio:', error);
        throw error;
    }
};

/**
 * Upload cover art for a track.
 *
 * Storage path: users/{userId}/channels/{channelId}/tracks/{trackId}/cover.{ext}
 */
export const uploadTrackCover = async (
    userId: string,
    channelId: string,
    trackId: string,
    file: File
): Promise<{ storagePath: string; downloadUrl: string }> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const storagePath = `users/${userId}/channels/${channelId}/tracks/${trackId}/cover.${ext}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file, {
        contentType: file.type || 'image/jpeg',
        cacheControl: 'public,max-age=31536000',
    });

    const downloadUrl = await getDownloadURL(storageRef);
    const cacheBustedUrl = `${downloadUrl}&v=${Date.now()}`;
    return { storagePath, downloadUrl: cacheBustedUrl };
};

/**
 * Delete all storage files for a track (audio files + cover).
 */
export const deleteTrackFolder = async (
    userId: string,
    channelId: string,
    trackId: string
): Promise<void> => {
    const path = `users/${userId}/channels/${channelId}/tracks/${trackId}`;
    await deleteFolder(path);
};

// ============================================================================
// GALLERY IMAGE STORAGE
// ============================================================================

/**
 * Upload a gallery image (original only).
 * Firebase Resize Images Extension will auto-generate the thumbnail.
 * 
 * Storage path: users/{userId}/channels/{channelId}/videos/{videoId}/gallery/{timestamp}_{filename}
 * Thumbnail will be: users/{userId}/channels/{channelId}/videos/{videoId}/gallery/{timestamp}_{filename}_1280x720.webp
 * 
 * @returns Original file URL, storage path, and expected thumbnail URL
 */
export const uploadGalleryImage = async (
    userId: string,
    channelId: string,
    videoId: string,
    file: File
): Promise<{
    storagePath: string;
    originalUrl: string;
    thumbnailPath: string;
    filename: string;
    fileSize: number;
}> => {
    try {
        // Create unique filename with timestamp
        const timestamp = Date.now();
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageFilename = `${timestamp}_${safeFilename}`;

        // Construct storage path
        const storagePath = `users/${userId}/channels/${channelId}/videos/${videoId}/gallery/${storageFilename}`;
        const storageRef = ref(storage, storagePath);

        // Upload original file with cache headers
        const metadata = {
            cacheControl: 'public,max-age=31536000', // Cache for 1 year
            contentType: file.type,
            customMetadata: {
                originalFilename: file.name,
                uploadedAt: new Date().toISOString()
            }
        };

        await uploadBytes(storageRef, file, metadata);
        const originalUrl = await getDownloadURL(storageRef);

        // Construct expected thumbnail path (Firebase Extension naming convention)
        // Extension adds _1280x720.webp to the filename (before extension)
        const filenameParts = storageFilename.split('.');
        const nameWithoutExt = filenameParts.slice(0, -1).join('.');
        const thumbnailFilename = `${nameWithoutExt}_1280x720.webp`;
        const thumbnailPath = `users/${userId}/channels/${channelId}/videos/${videoId}/gallery/${thumbnailFilename}`;

        return {
            storagePath,
            originalUrl,
            thumbnailPath,
            filename: file.name,
            fileSize: file.size
        };
    } catch (error) {
        console.error('Error uploading gallery image:', error);
        throw error;
    }
};

/**
 * Wait for thumbnail to be generated by Firebase Extension.
 * Polls Storage until thumbnail exists or timeout.
 * 
 * @param thumbnailPath - Expected thumbnail path in Storage
 * @param maxWaitMs - Maximum wait time (default 15 seconds)
 * @returns Download URL of the thumbnail
 */
export const waitForThumbnail = async (
    thumbnailPath: string,
    maxWaitMs: number = 15000
): Promise<string> => {
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every 1 second

    // Extract folder path and filename from thumbnailPath
    const pathParts = thumbnailPath.split('/');
    const filename = pathParts.pop();
    const folderPath = pathParts.join('/');

    if (!filename || !folderPath) {
        throw new Error(`Invalid thumbnail path: ${thumbnailPath}`);
    }

    const folderRef = ref(storage, folderPath);

    while (Date.now() - startTime < maxWaitMs) {
        try {
            // Use listAll to check for file existence without triggering 404s
            const res = await listAll(folderRef);
            const foundItem = res.items.find(item => item.name === filename);

            if (foundItem) {
                // File exists! Get the download URL
                return await getDownloadURL(foundItem);
            }

            // Not found yet, wait and retry
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        } catch (error) {
            console.error('Error polling for thumbnail:', error);
            // If listAll fails, we might want to stop or retry. 
            // For now, retry unless it's a permission error?
            // Simple retry with delay.
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
    }

    throw new Error(`Thumbnail generation timed out after ${maxWaitMs}ms`);
};

/**
 * Delete gallery image (original + thumbnail).
 * 
 * @param storagePath - Path to the original file
 */
export const deleteGalleryImage = async (storagePath: string): Promise<void> => {
    try {
        // Delete original
        const originalRef = ref(storage, storagePath);
        await deleteObject(originalRef).catch((e: unknown) => {
            if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code !== 'storage/object-not-found') throw e;
        });

        // Construct and delete thumbnail path
        const pathParts = storagePath.split('.');
        const nameWithoutExt = pathParts.slice(0, -1).join('.');
        const thumbnailPath = `${nameWithoutExt}_1280x720.webp`;

        const thumbnailRef = ref(storage, thumbnailPath);
        await deleteObject(thumbnailRef).catch((e: unknown) => {
            if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code !== 'storage/object-not-found') throw e;
        });
    } catch (error) {
        console.error('Error deleting gallery image:', error);
        throw error;
    }
};

/**
 * Trigger browser download for a file.
 * 
 * @param url - Download URL
 * @param filename - Filename for the download
 */
export const triggerFileDownload = async (url: string, filename: string): Promise<void> => {
    try {
        const response = await fetch(url);
        const blob = await response.blob();

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
};

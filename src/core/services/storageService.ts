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
        const fetchPromise = fetch(downloadUrl + (downloadUrl.includes('?') ? '&' : '?') + `t=${Date.now()}`).then(async (response) => {
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


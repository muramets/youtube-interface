import { storage } from '../../config/firebase';

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

export const deleteImageFromStorage = async (url: string): Promise<void> => {
    try {
        const storageRef = ref(storage, url);
        await deleteObject(storageRef);
    } catch (error: any) {
        // Ignore "object not found" errors, as the file might already be gone
        if (error.code !== 'storage/object-not-found') {
            console.error('Error deleting image from storage:', error);
            throw error;
        }
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

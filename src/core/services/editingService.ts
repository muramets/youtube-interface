import { setDocument, getDocument, deleteDocument } from './firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../config/firebase';
import { serverTimestamp } from 'firebase/firestore';
import type { EditingSession } from '../types/editingSession';

// ─── Firestore Paths ───────────────────────────────────────────────────
function getEditingPath(userId: string, channelId: string, videoId: string): string {
    return `users/${userId}/channels/${channelId}/videos/${videoId}/editing`;
}

const DOC_ID = 'session';

// ─── Storage Path ──────────────────────────────────────────────────────
function getImageStoragePath(
    userId: string,
    channelId: string,
    videoId: string,
    ext: string,
): string {
    return `users/${userId}/channels/${channelId}/videos/${videoId}/editing/image.${ext}`;
}

// ─── Service ───────────────────────────────────────────────────────────
export const EditingService = {
    /** Save (create or update) editing session for a video. */
    async saveSession(
        userId: string,
        channelId: string,
        videoId: string,
        session: Omit<EditingSession, 'updatedAt'>,
    ): Promise<void> {
        const path = getEditingPath(userId, channelId, videoId);
        await setDocument(path, DOC_ID, {
            ...session,
            updatedAt: serverTimestamp(),
        } as EditingSession, true);
    },

    /** Load editing session for a video. Returns null if none exists. */
    async loadSession(
        userId: string,
        channelId: string,
        videoId: string,
    ): Promise<EditingSession | null> {
        const path = `${getEditingPath(userId, channelId, videoId)}/${DOC_ID}`;
        return getDocument<EditingSession>(path);
    },

    /** Delete editing session for a video. */
    async deleteSession(
        userId: string,
        channelId: string,
        videoId: string,
    ): Promise<void> {
        const path = getEditingPath(userId, channelId, videoId);
        await deleteDocument(path, DOC_ID);
    },

    /**
     * Upload a custom editing image to Firebase Storage.
     * Returns storagePath + downloadUrl.
     */
    async uploadImage(
        userId: string,
        channelId: string,
        videoId: string,
        file: File,
    ): Promise<{ storagePath: string; downloadUrl: string }> {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const storagePath = getImageStoragePath(userId, channelId, videoId, ext);
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        return { storagePath, downloadUrl };
    },

    /** Delete a custom editing image from Firebase Storage. */
    async deleteImage(storagePath: string): Promise<void> {
        try {
            const storageRef = ref(storage, storagePath);
            await deleteObject(storageRef);
        } catch (err: unknown) {
            // storage/object-not-found is OK — already deleted
            if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'storage/object-not-found') return;
            throw err;
        }
    },
};

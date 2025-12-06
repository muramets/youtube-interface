
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    writeBatch,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Notification } from '../stores/notificationStore';

export const NotificationService = {
    subscribeToNotifications: (
        userId: string,
        channelId: string,
        onUpdate: (notifications: Notification[]) => void
    ) => {
        const q = query(
            collection(db, 'users', userId, 'channels', channelId, 'notifications'),
            orderBy('timestamp', 'desc')
        );

        return onSnapshot(q, (snapshot) => {
            const notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                // Convert Firestore Timestamp to number for the store
                timestamp: (doc.data().timestamp as Timestamp)?.toMillis() || Date.now()
            })) as Notification[];

            onUpdate(notifications);
        });
    },

    addNotification: async (
        userId: string,
        channelId: string,
        notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>
    ) => {
        const ref = collection(db, 'users', userId, 'channels', channelId, 'notifications');

        if (notification.internalId) {
            // Idempotent write: Use internalId as the document ID
            // This prevents duplicates if the client retries or race conditions occur
            const docRef = doc(ref, notification.internalId);

            // Use setDoc with merge: true to avoid overwriting existing fields like 'isRead' if we don't want to?
            // Actually, if we are re-notifying, maybe we WANT to un-read it? 
            // The scheduler logic says: "If check-in is due, notify." 
            // If it's already there and read, should we make it unread?
            // Usually, yes, a new reminder should be seen.
            // BUT, the scheduler checks `alreadyNotified` which checks existence.
            // If it exists (even if read), we skip.
            // So we only hit this if `alreadyNotified` was false (e.g. race condition).
            // In that case, we probably want to ensure it exists.

            // However, if we overwrite, we might reset `isRead` to false. 
            // If the user *just* read it, and we overwrite, it becomes unread.
            // Given the race condition (seconds), unread is fine.

            // Using setDoc with explicit ID
            await import('firebase/firestore').then(({ setDoc }) =>
                setDoc(docRef, {
                    ...notification,
                    id: notification.internalId, // Ensure ID matches
                    isRead: false,
                    timestamp: serverTimestamp()
                })
            );
        } else {
            // Fallback for standard notifications
            await addDoc(ref, {
                ...notification,
                isRead: false,
                timestamp: serverTimestamp()
            });
        }
    },

    markAsRead: async (userId: string, channelId: string, notificationId: string) => {
        const ref = doc(db, 'users', userId, 'channels', channelId, 'notifications', notificationId);
        await updateDoc(ref, { isRead: true });
    },

    markAllAsRead: async (userId: string, channelId: string, notificationIds: string[]) => {
        const batch = writeBatch(db);
        notificationIds.forEach(id => {
            const ref = doc(db, 'users', userId, 'channels', channelId, 'notifications', id);
            batch.update(ref, { isRead: true });
        });
        await batch.commit();
    },

    removeNotification: async (userId: string, channelId: string, notificationId: string) => {
        const ref = doc(db, 'users', userId, 'channels', channelId, 'notifications', notificationId);
        await deleteDoc(ref);
    },

    removeNotifications: async (userId: string, channelId: string, notificationIds: string[]) => {
        const batch = writeBatch(db);
        notificationIds.forEach(id => {
            const ref = doc(db, 'users', userId, 'channels', channelId, 'notifications', id);
            batch.delete(ref);
        });
        await batch.commit();
    },

    clearAll: async (userId: string, channelId: string, notificationIds: string[]) => {
        const batch = writeBatch(db);
        notificationIds.forEach(id => {
            const ref = doc(db, 'users', userId, 'channels', channelId, 'notifications', id);
            batch.delete(ref);
        });
        await batch.commit();
    }
};

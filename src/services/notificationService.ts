
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
        await addDoc(ref, {
            ...notification,
            isRead: false,
            timestamp: serverTimestamp()
        });
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

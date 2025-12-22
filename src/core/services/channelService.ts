import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    getDocs,
    onSnapshot
} from 'firebase/firestore';
import { db } from '../../config/firebase';

export interface CustomLanguage {
    code: string;
    name: string;
    flag: string;
}

export interface Channel {
    id: string;
    name: string;
    handle?: string; // Added handle to interface as it was in store but not in context
    avatar?: string;
    createdAt: number;
    customLanguages?: CustomLanguage[];
    /** Niches marked as targets for this channel (max 2), used as reminders */
    targetNicheIds?: string[];
}

export const ChannelService = {
    getUserChannels: async (userId: string): Promise<Channel[]> => {
        const channelsRef = collection(db, `users/${userId}/channels`);
        const snapshot = await getDocs(channelsRef);
        const loadedChannels: Channel[] = [];
        snapshot.forEach((doc) => {
            loadedChannels.push({ id: doc.id, ...doc.data() } as Channel);
        });
        loadedChannels.sort((a, b) => a.createdAt - b.createdAt);
        return loadedChannels;
    },

    subscribeToChannels: (userId: string, callback: (channels: Channel[]) => void) => {
        const channelsRef = collection(db, `users/${userId}/channels`);
        return onSnapshot(channelsRef, (snapshot) => {
            const loadedChannels: Channel[] = [];
            snapshot.forEach((doc) => {
                loadedChannels.push({ id: doc.id, ...doc.data() } as Channel);
            });
            loadedChannels.sort((a, b) => a.createdAt - b.createdAt);
            callback(loadedChannels);
        });
    },

    createChannel: async (userId: string, channelData: { name: string; handle?: string; avatarUrl?: string }) => {
        const newChannelRef = doc(collection(db, `users/${userId}/channels`));
        const newChannel: Channel = {
            id: newChannelRef.id,
            name: channelData.name,
            handle: channelData.handle,
            avatar: channelData.avatarUrl,
            createdAt: Date.now()
        };
        await setDoc(newChannelRef, newChannel);
        return newChannel;
    },

    updateChannel: async (userId: string, channelId: string, updates: Partial<Channel>) => {
        const channelRef = doc(db, `users/${userId}/channels/${channelId}`);
        await setDoc(channelRef, updates, { merge: true });
    },

    deleteChannel: async (userId: string, channelId: string) => {
        // 1. Delete Subcollections (Videos, Playlists, Settings)
        const subcollections = ['videos', 'playlists', 'settings'];
        for (const sub of subcollections) {
            const subRef = collection(db, `users/${userId}/channels/${channelId}/${sub}`);
            const snapshot = await getDocs(subRef);
            const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
        }

        // 2. Delete Channel Document
        const channelRef = doc(db, `users/${userId}/channels/${channelId}`);
        await deleteDoc(channelRef);
    }
};

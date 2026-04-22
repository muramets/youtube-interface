import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    getDocs,
    onSnapshot,
    writeBatch
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
    avatar?: string;
    createdAt: number;
    customLanguages?: CustomLanguage[];
    /** Niches marked as targets for this channel (max 2), used as reminders */
    targetNicheIds?: string[];
    /** Cached names of target niches for display across user channels */
    targetNicheNames?: string[];
    /** User-defined position in the channel list. Lower = shown first. Absent for channels that have never been reordered. */
    order?: number;
}

/**
 * Sort channels by user-defined `order` when present, falling back to `createdAt`
 * so channels that have never been reordered keep their original positions.
 * Channels with `order` always come before those without.
 */
const compareChannels = (a: Channel, b: Channel): number => {
    const aHasOrder = typeof a.order === 'number';
    const bHasOrder = typeof b.order === 'number';
    if (aHasOrder && bHasOrder) return a.order! - b.order!;
    if (aHasOrder) return -1;
    if (bHasOrder) return 1;
    return a.createdAt - b.createdAt;
};

export const ChannelService = {
    getUserChannels: async (userId: string): Promise<Channel[]> => {
        const channelsRef = collection(db, `users/${userId}/channels`);
        const snapshot = await getDocs(channelsRef);
        const loadedChannels: Channel[] = [];
        snapshot.forEach((doc) => {
            loadedChannels.push({ id: doc.id, ...doc.data() } as Channel);
        });
        loadedChannels.sort(compareChannels);
        return loadedChannels;
    },

    subscribeToChannels: (userId: string, callback: (channels: Channel[]) => void) => {
        const channelsRef = collection(db, `users/${userId}/channels`);
        return onSnapshot(channelsRef, (snapshot) => {
            const loadedChannels: Channel[] = [];
            snapshot.forEach((doc) => {
                loadedChannels.push({ id: doc.id, ...doc.data() } as Channel);
            });
            loadedChannels.sort(compareChannels);
            callback(loadedChannels);
        });
    },

    createChannel: async (userId: string, channelData: { name: string; avatarUrl?: string }) => {
        const newChannelRef = doc(collection(db, `users/${userId}/channels`));
        const newChannel: Channel = {
            id: newChannelRef.id,
            name: channelData.name,
            createdAt: Date.now(),
            ...(channelData.avatarUrl && { avatar: channelData.avatarUrl })
        };
        await setDoc(newChannelRef, newChannel);
        return newChannel;
    },

    updateChannel: async (userId: string, channelId: string, updates: Partial<Channel>) => {
        const channelRef = doc(db, `users/${userId}/channels/${channelId}`);
        await setDoc(channelRef, updates, { merge: true });
    },

    /**
     * Persist a new channel order. Writes `order` on every channel in one atomic batch
     * so subsequent snapshots can sort by `order` deterministically.
     */
    reorderChannels: async (userId: string, orderedChannelIds: string[]) => {
        const batch = writeBatch(db);
        orderedChannelIds.forEach((channelId, index) => {
            const channelRef = doc(db, `users/${userId}/channels/${channelId}`);
            batch.set(channelRef, { order: index }, { merge: true });
        });
        await batch.commit();
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

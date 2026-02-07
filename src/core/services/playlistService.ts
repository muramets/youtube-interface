import {
    setDocument,
    deleteDocument,
    subscribeToCollection,
    updateDocument,
    fetchCollection
} from './firestore';
import { orderBy, arrayRemove, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

export interface Playlist {
    id: string;
    name: string;
    coverImage?: string;
    videoIds: string[];
    createdAt: number;
    updatedAt?: number;
    group?: string;
    order?: number;
}

const getPlaylistsPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/playlists`;

export const PlaylistService = {
    fetchPlaylists: async (userId: string, channelId: string) => {
        return fetchCollection<Playlist>(getPlaylistsPath(userId, channelId), [orderBy('createdAt')]);
    },

    subscribeToPlaylists: (
        userId: string,
        channelId: string,
        callback: (playlists: Playlist[]) => void
    ) => {
        return subscribeToCollection<Playlist>(
            getPlaylistsPath(userId, channelId),
            callback,
            [orderBy('createdAt')]
        );
    },

    createPlaylist: async (
        userId: string,
        channelId: string,
        playlist: Playlist
    ) => {
        await setDocument(
            getPlaylistsPath(userId, channelId),
            playlist.id,
            playlist
        );
    },

    updatePlaylist: async (
        userId: string,
        channelId: string,
        playlistId: string,
        updates: Partial<Playlist>
    ) => {
        await updateDocument(
            getPlaylistsPath(userId, channelId),
            playlistId,
            updates
        );
    },

    deletePlaylist: async (
        userId: string,
        channelId: string,
        playlistId: string
    ) => {
        await deleteDocument(
            getPlaylistsPath(userId, channelId),
            playlistId
        );
    },

    addVideosToPlaylist: async (
        userId: string,
        channelId: string,
        playlistId: string,
        videoIds: string[]
    ) => {
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);

        // Fetch current playlist to prepend videos
        const snapshot = await getDoc(playlistRef);

        if (snapshot.exists()) {
            const playlist = snapshot.data() as Playlist;
            const currentVideoIds = playlist.videoIds || [];

            // Filter out duplicates (videos already in playlist)
            const newVideoIds = videoIds.filter(id => !currentVideoIds.includes(id));

            if (newVideoIds.length > 0) {
                // Prepend new videos: new ones at the beginning
                const updatedVideoIds = [...newVideoIds, ...currentVideoIds];

                await updateDoc(playlistRef, {
                    videoIds: updatedVideoIds,
                    updatedAt: Date.now()
                });
            }
        }
    },

    removeVideosFromPlaylist: async (
        userId: string,
        channelId: string,
        playlistId: string,
        videoIds: string[]
    ) => {
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        await updateDoc(playlistRef, {
            videoIds: arrayRemove(...videoIds),
            updatedAt: Date.now()
        });
    },

    // --- Playlist Settings (Group Order) ---

    fetchPlaylistSettings: async (userId: string, channelId: string): Promise<PlaylistSettings> => {
        const settingsRef = doc(db, `users/${userId}/channels/${channelId}/settings`, 'playlists');
        const snapshot = await getDoc(settingsRef);
        if (snapshot.exists()) {
            return snapshot.data() as PlaylistSettings;
        }
        return { groupOrder: [] };
    },

    updatePlaylistSettings: async (
        userId: string,
        channelId: string,
        settings: Partial<PlaylistSettings>
    ) => {
        const settingsRef = doc(db, `users/${userId}/channels/${channelId}/settings`, 'playlists');
        await updateDoc(settingsRef, settings).catch(async () => {
            // Document might not exist, create it
            const { setDoc } = await import('firebase/firestore');
            await setDoc(settingsRef, { groupOrder: [], ...settings });
        });
    },

    reorderPlaylistsInGroup: async (
        userId: string,
        channelId: string,
        orderedIds: string[]
    ) => {
        // Update order field for each playlist in the group
        const batch = await import('firebase/firestore').then(m => m.writeBatch(db));
        orderedIds.forEach((id, index) => {
            const playlistRef = doc(db, getPlaylistsPath(userId, channelId), id);
            batch.update(playlistRef, { order: index });
        });
        await batch.commit();
    },

    /**
     * Batch update order values for multiple playlists at once.
     * Used when switching from sorted→manual mode to persist
     * the visual baseline for ALL groups, not just the one being dragged.
     */
    batchNormalizeOrders: async (
        userId: string,
        channelId: string,
        orderUpdates: { id: string; order: number }[]
    ) => {
        const batch = await import('firebase/firestore').then(m => m.writeBatch(db));
        orderUpdates.forEach(({ id, order }) => {
            const playlistRef = doc(db, getPlaylistsPath(userId, channelId), id);
            batch.update(playlistRef, { order });
        });
        await batch.commit();
    },

    movePlaylistToGroup: async (
        userId: string,
        channelId: string,
        playlistId: string,
        newGroup: string,
        orderedIds: string[]
    ) => {
        // Update the playlist's group field and reorder all playlists in the target group
        const batch = await import('firebase/firestore').then(m => m.writeBatch(db));

        // Update group for the moved playlist
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        batch.update(playlistRef, {
            group: newGroup === 'Ungrouped' ? null : newGroup
        });

        // Reorder all playlists in target group
        orderedIds.forEach((id, index) => {
            const ref = doc(db, getPlaylistsPath(userId, channelId), id);
            batch.update(ref, { order: index });
        });

        await batch.commit();
    },

    renameGroup: async (
        userId: string,
        channelId: string,
        oldName: string,
        newName: string
    ) => {
        const { getDocs, query, where, writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(db);
        const playlistsPath = getPlaylistsPath(userId, channelId);

        // 1. Get all playlists in the old group
        // Note: We need to import collection from firebase/firestore to use with query, 
        // but we already have fetchCollection helper. Better to use raw firestore for batch prep.
        const { collection } = await import('firebase/firestore');
        const q = query(collection(db, playlistsPath), where('group', '==', oldName));
        const querySnapshot = await getDocs(q);

        // 2. Queue updates for each playlist
        querySnapshot.forEach((docSnap) => {
            batch.update(docSnap.ref, { group: newName });
        });

        // 3. Update group order in settings
        const settingsRef = doc(db, `users/${userId}/channels/${channelId}/settings`, 'playlists');
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
            const settings = settingsSnap.data() as PlaylistSettings;
            const currentOrder = settings.groupOrder || [];
            const newOrder = currentOrder.map(g => g === oldName ? newName : g);
            batch.update(settingsRef, { groupOrder: newOrder });
        }

        // 4. Commit all changes atomically
        await batch.commit();
    },

};

export interface PlaylistSettings {
    groupOrder: string[];
}

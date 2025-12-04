import {
    setDocument,
    deleteDocument,
    subscribeToCollection,
    updateDocument,
    fetchCollection
} from './firestore';
import { orderBy, arrayUnion, arrayRemove, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface Playlist {
    id: string;
    name: string;
    coverImage?: string;
    videoIds: string[];
    createdAt: number;
    updatedAt?: number;
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
            { ...updates, updatedAt: Date.now() }
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

    addVideoToPlaylist: async (
        userId: string,
        channelId: string,
        playlistId: string,
        videoId: string
    ) => {
        // We need to fetch the playlist first to get current videoIds
        // Or use arrayUnion if we were using updateDoc directly, but our abstraction might not support it easily.
        // Let's use a transaction or just fetch-update for now as we don't have arrayUnion exposed in firestore.ts wrapper yet?
        // Actually firestore.ts exports updateDocument which uses updateDoc.
        // We can import arrayUnion from firebase/firestore.

        // But to keep it consistent with the service pattern, let's just use updateDocument with arrayUnion if possible,
        // or just fetch and update.
        // Let's import arrayUnion and arrayRemove.

        // Wait, I need to import them at the top.
        // For now, I'll just do a read-modify-write or assume I can modify the file to add imports.
        // I'll add imports in a separate step or just use the existing updateDocument and hope it works with arrayUnion if I pass it?
        // No, updateDocument takes Partial<T>.

        // Let's just implement it here using firestore imports directly for these specific operations
        // or update firestore.ts.
        // Let's update this file to import arrayUnion/arrayRemove.

        // Actually, I can't easily add imports with replace_file_content if I'm targeting the end.
        // I'll just do a separate replace for imports.

        // For now, let's write the methods assuming imports exist.
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        await updateDoc(playlistRef, {
            videoIds: arrayUnion(videoId),
            updatedAt: Date.now()
        });
    },

    removeVideoFromPlaylist: async (
        userId: string,
        channelId: string,
        playlistId: string,
        videoId: string
    ) => {
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        await updateDoc(playlistRef, {
            videoIds: arrayRemove(videoId),
            updatedAt: Date.now()
        });
    }
};

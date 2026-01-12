import {
    setDocument,
    deleteDocument,
    subscribeToCollection,
    updateDocument,
    fetchCollection
} from './firestore';
import { orderBy, arrayUnion, arrayRemove, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

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

    addVideosToPlaylist: async (
        userId: string,
        channelId: string,
        playlistId: string,
        videoIds: string[]
    ) => {
        const playlistRef = doc(db, getPlaylistsPath(userId, channelId), playlistId);
        await updateDoc(playlistRef, {
            videoIds: arrayUnion(...videoIds),
            updatedAt: Date.now()
        });
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


};

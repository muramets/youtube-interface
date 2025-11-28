import {
    setDocument,
    deleteDocument,
    subscribeToCollection,
    updateDocument
} from './firestore';
import { orderBy } from 'firebase/firestore';

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
    }
};

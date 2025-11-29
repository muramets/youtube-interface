import { create } from 'zustand';
import { PlaylistService, type Playlist } from '../services/playlistService';

interface PlaylistsState {
    playlists: Playlist[];
    isLoading: boolean;

    // Actions
    setPlaylists: (playlists: Playlist[]) => void;
    subscribeToPlaylists: (userId: string, channelId: string) => () => void;

    createPlaylist: (userId: string, channelId: string, name: string, videoIds?: string[]) => Promise<string>;
    updatePlaylist: (userId: string, channelId: string, playlistId: string, updates: Partial<Playlist>) => Promise<void>;
    deletePlaylist: (userId: string, channelId: string, playlistId: string) => Promise<void>;
    addVideoToPlaylist: (userId: string, channelId: string, playlistId: string, videoId: string) => Promise<void>;
    removeVideoFromPlaylist: (userId: string, channelId: string, playlistId: string, videoId: string) => Promise<void>;
    reorderPlaylists: (userId: string, channelId: string, newOrder: string[]) => Promise<void>;
    reorderPlaylistVideos: (userId: string, channelId: string, playlistId: string, newVideoIds: string[]) => Promise<void>;
}

export const usePlaylistsStore = create<PlaylistsState>((set) => ({
    playlists: [],
    isLoading: true,

    setPlaylists: (playlists) => set({ playlists }),

    subscribeToPlaylists: (userId, channelId) => {
        set({ isLoading: true });
        return PlaylistService.subscribeToPlaylists(userId, channelId, (data) => {
            set({ playlists: data, isLoading: false });
        });
    },

    createPlaylist: async (userId, channelId, name, videoIds = []) => {
        const id = `playlist-${Date.now()}`;
        const newPlaylist: Playlist = {
            id,
            name,
            videoIds,
            createdAt: Date.now()
        };
        await PlaylistService.createPlaylist(userId, channelId, newPlaylist);
        return id;
    },

    updatePlaylist: async (userId, channelId, playlistId, updates) => {
        await PlaylistService.updatePlaylist(userId, channelId, playlistId, updates);
    },

    deletePlaylist: async (userId, channelId, playlistId) => {
        await PlaylistService.deletePlaylist(userId, channelId, playlistId);
    },

    addVideoToPlaylist: async (userId, channelId, playlistId, videoId) => {
        await PlaylistService.addVideoToPlaylist(userId, channelId, playlistId, videoId);
    },

    removeVideoFromPlaylist: async (userId, channelId, playlistId, videoId) => {
        await PlaylistService.removeVideoFromPlaylist(userId, channelId, playlistId, videoId);
    },

    reorderPlaylists: async (userId, channelId, newOrder) => {
        // This updates the order in settings
        const { SettingsService } = await import('../services/settingsService');
        await SettingsService.updatePlaylistOrder(userId, channelId, newOrder);
    },

    reorderPlaylistVideos: async (userId, channelId, playlistId, newVideoIds) => {
        await PlaylistService.updatePlaylist(userId, channelId, playlistId, { videoIds: newVideoIds });
    }
}));

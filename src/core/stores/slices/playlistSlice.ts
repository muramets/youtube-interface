// =============================================================================
// PLAYLIST SLICE — Playlists CRUD, ordering, track management
// =============================================================================

import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MusicPlaylist } from '../../types/musicPlaylist';
import { MusicPlaylistService } from '../../services/musicPlaylistService';
import type { MusicState } from '../musicStore';

export interface PlaylistSlice {
    // State
    musicPlaylists: MusicPlaylist[];
    sharedPlaylists: MusicPlaylist[];
    activePlaylistId: string | null;
    playlistGroupOrder: string[];

    // Actions
    subscribePlaylists: (userId: string, channelId: string) => () => void;
    loadPlaylistSettings: (userId: string, channelId: string) => Promise<void>;
    setActivePlaylist: (id: string | null) => void;
    createPlaylist: (userId: string, channelId: string, name: string, group?: string, trackIds?: string[]) => Promise<MusicPlaylist>;
    updatePlaylist: (userId: string, channelId: string, playlistId: string, updates: Partial<Pick<MusicPlaylist, 'name' | 'group' | 'color' | 'order'>>) => Promise<void>;
    deletePlaylist: (userId: string, channelId: string, playlistId: string) => Promise<void>;
    addTracksToPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[]) => Promise<void>;
    removeTracksFromPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[]) => Promise<void>;
    reorderPlaylistTracks: (userId: string, channelId: string, playlistId: string, orderedTrackIds: string[]) => Promise<void>;
}

export const createPlaylistSlice: StateCreator<MusicState, [], [], PlaylistSlice> = (set) => ({
    // Initial state
    musicPlaylists: [],
    sharedPlaylists: [],
    activePlaylistId: null,
    playlistGroupOrder: [],

    // Actions
    subscribePlaylists: (userId, channelId) => {
        return MusicPlaylistService.subscribeToPlaylists(userId, channelId, (playlists) => {
            set({ musicPlaylists: playlists });
        });
    },

    loadPlaylistSettings: async (userId, channelId) => {
        try {
            const settings = await MusicPlaylistService.fetchSettings(userId, channelId);
            set({ playlistGroupOrder: settings.groupOrder });
        } catch (error) {
            console.error('[MusicStore] Failed to load playlist settings:', error);
        }
    },

    setActivePlaylist: (id) => set({ activePlaylistId: id }),

    createPlaylist: async (userId, channelId, name, group, trackIds) => {
        const now = Date.now();
        const playlist: MusicPlaylist = {
            id: uuidv4(),
            name,
            trackIds: trackIds || [],
            group: group || null,
            order: 0,
            createdAt: now,
            updatedAt: now,
        };
        set((state) => ({ musicPlaylists: [...state.musicPlaylists, playlist] }));
        await MusicPlaylistService.createPlaylist(userId, channelId, playlist);
        return playlist;
    },

    updatePlaylist: async (userId, channelId, playlistId, updates) => {
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) =>
                p.id === playlistId ? { ...p, ...updates, updatedAt: Date.now() } : p
            ),
        }));
        await MusicPlaylistService.updatePlaylist(userId, channelId, playlistId, {
            ...updates,
            updatedAt: Date.now(),
        });
    },

    deletePlaylist: async (userId, channelId, playlistId) => {
        set((state) => ({
            musicPlaylists: state.musicPlaylists.filter((p) => p.id !== playlistId),
            activePlaylistId: state.activePlaylistId === playlistId ? null : state.activePlaylistId,
        }));
        await MusicPlaylistService.deletePlaylist(userId, channelId, playlistId);
    },

    addTracksToPlaylist: async (userId, channelId, playlistId, trackIds) => {
        const now = Date.now();
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) => {
                if (p.id !== playlistId) return p;
                const newIds = trackIds.filter(id => !p.trackIds.includes(id));
                const addedAt = { ...(p.trackAddedAt || {}) };
                for (const id of newIds) addedAt[id] = now;
                return { ...p, trackIds: [...p.trackIds, ...newIds], trackAddedAt: addedAt };
            }),
        }));
        await MusicPlaylistService.addTracksToPlaylist(userId, channelId, playlistId, trackIds);
    },

    removeTracksFromPlaylist: async (userId, channelId, playlistId, trackIds) => {
        const removeSet = new Set(trackIds);
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) => {
                if (p.id !== playlistId) return p;
                const addedAt = p.trackAddedAt
                    ? Object.fromEntries(
                        Object.entries(p.trackAddedAt).filter(([id]) => !removeSet.has(id))
                    )
                    : undefined;
                return {
                    ...p,
                    trackIds: p.trackIds.filter(id => !removeSet.has(id)),
                    ...(addedAt !== undefined && { trackAddedAt: addedAt }),
                };
            }),
        }));
        await MusicPlaylistService.removeTracksFromPlaylist(userId, channelId, playlistId, trackIds);
    },

    reorderPlaylistTracks: async (userId, channelId, playlistId, orderedTrackIds) => {
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) =>
                p.id === playlistId
                    ? { ...p, trackIds: orderedTrackIds }
                    : p
            ),
        }));
        await MusicPlaylistService.reorderPlaylistTracks(userId, channelId, playlistId, orderedTrackIds);
    },
});

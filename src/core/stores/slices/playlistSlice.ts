// =============================================================================
// PLAYLIST SLICE — Playlists CRUD, ordering, track management
// =============================================================================

import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MusicPlaylist, TrackSource } from '../../types/musicPlaylist';
import type { SharedLibraryEntry } from '../../types/musicSharing';
import { MusicPlaylistService } from '../../services/musicPlaylistService';
import type { MusicState } from '../musicStore';

export interface PlaylistSlice {
    // State
    musicPlaylists: MusicPlaylist[];
    sharedPlaylists: MusicPlaylist[];
    activePlaylistId: string | null;
    playlistGroupOrder: string[];
    /** Show merged tracks from all libraries in playlist view */
    playlistAllSources: boolean;
    /** True while the first Firestore snapshot hasn't arrived yet (mirrors Trends isLoadingChannels) */
    isPlaylistsLoading: boolean;

    // Per-view memory: library view vs subview (playlist/liked)
    /** Remembered library source when user leaves the main library view */
    libraryViewSource: SharedLibraryEntry | null;
    /** Remembered library source when user leaves a subview */
    subviewSource: SharedLibraryEntry | null;
    /** Remembered All toggle when user leaves a subview */
    subviewAllSources: boolean;

    // Actions
    subscribePlaylists: (userId: string, channelId: string) => () => void;
    loadPlaylistSettings: (userId: string, channelId: string) => Promise<void>;
    setActivePlaylist: (id: string | null) => void;
    setPlaylistAllSources: (value: boolean) => void;
    createPlaylist: (userId: string, channelId: string, name: string, group?: string, trackIds?: string[], trackSources?: Record<string, TrackSource>) => Promise<MusicPlaylist>;
    updatePlaylist: (userId: string, channelId: string, playlistId: string, updates: Partial<Pick<MusicPlaylist, 'name' | 'group' | 'color' | 'order'>>) => Promise<void>;
    deletePlaylist: (userId: string, channelId: string, playlistId: string) => Promise<void>;
    addTracksToPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[], sources?: Record<string, TrackSource>) => Promise<void>;
    removeTracksFromPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[]) => Promise<void>;
    reorderPlaylistTracks: (userId: string, channelId: string, playlistId: string, orderedTrackIds: string[]) => Promise<void>;
}

export const createPlaylistSlice: StateCreator<MusicState, [], [], PlaylistSlice> = (set, get) => ({
    // Initial state
    musicPlaylists: [],
    sharedPlaylists: [],
    activePlaylistId: null,
    playlistGroupOrder: [],
    playlistAllSources: false,
    isPlaylistsLoading: true,
    libraryViewSource: null,
    subviewSource: null,
    subviewAllSources: true,

    // Actions
    subscribePlaylists: (userId, channelId) => {
        // Mark loading before the subscription is set up.
        // Will be cleared when the first Firestore snapshot arrives.
        set({ isPlaylistsLoading: true });
        let initialSnapshotDelivered = false;
        return MusicPlaylistService.subscribeToPlaylists(userId, channelId, (playlists) => {
            if (!initialSnapshotDelivered) {
                initialSnapshotDelivered = true;
                set({ musicPlaylists: playlists, isPlaylistsLoading: false });
            } else {
                set({ musicPlaylists: playlists });
            }
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

    setActivePlaylist: (id) => {
        const s = get();
        const wasLibrary = s.activePlaylistId === null;
        const willBeLibrary = id === null;

        if (wasLibrary && !willBeLibrary) {
            // Library → subview: save library state, restore subview state
            set({
                activePlaylistId: id,
                libraryViewSource: s.activeLibrarySource,
                activeLibrarySource: s.subviewSource,
                playlistAllSources: s.subviewAllSources,
            });
        } else if (!wasLibrary && willBeLibrary) {
            // Subview → library: save subview state, restore library state
            set({
                activePlaylistId: id,
                subviewSource: s.activeLibrarySource,
                subviewAllSources: s.playlistAllSources,
                activeLibrarySource: s.libraryViewSource,
                playlistAllSources: false,
            });
        } else {
            // Subview → subview (playlist switch): no swap needed
            set({ activePlaylistId: id });
        }
    },

    setPlaylistAllSources: (value) => set({ playlistAllSources: value }),

    createPlaylist: async (userId, channelId, name, group, trackIds, trackSources) => {
        const now = Date.now();
        const initialIds = trackIds || [];
        // Populate trackAddedAt for seeded tracks so all entries are consistent
        const initialAddedAt = initialIds.length > 0
            ? Object.fromEntries(initialIds.map(id => [id, now]))
            : undefined;
        const playlist: MusicPlaylist = {
            id: uuidv4(),
            name,
            trackIds: initialIds,
            ...(initialAddedAt && { trackAddedAt: initialAddedAt }),
            ...(trackSources && Object.keys(trackSources).length > 0 && { trackSources }),
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
        const updatedAt = Date.now();
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) =>
                p.id === playlistId ? { ...p, ...updates, updatedAt } : p
            ),
        }));
        await MusicPlaylistService.updatePlaylist(userId, channelId, playlistId, {
            ...updates,
            updatedAt,
        });
    },

    deletePlaylist: async (userId, channelId, playlistId) => {
        set((state) => ({
            musicPlaylists: state.musicPlaylists.filter((p) => p.id !== playlistId),
            activePlaylistId: state.activePlaylistId === playlistId ? null : state.activePlaylistId,
        }));
        await MusicPlaylistService.deletePlaylist(userId, channelId, playlistId);
    },

    addTracksToPlaylist: async (userId, channelId, playlistId, trackIds, sources) => {
        const now = Date.now();
        // Compute new IDs from current state synchronously via get() — no mutation needed
        const currentPlaylist = get().musicPlaylists.find(p => p.id === playlistId);
        const newIds = currentPlaylist
            ? trackIds.filter(id => !currentPlaylist.trackIds.includes(id))
            : [...trackIds];
        if (newIds.length === 0) return;

        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) => {
                if (p.id !== playlistId) return p;
                const addedAt = { ...(p.trackAddedAt || {}) };
                for (const id of newIds) addedAt[id] = now;
                const updatedSources = { ...(p.trackSources || {}) };
                if (sources) {
                    for (const id of newIds) {
                        if (sources[id]) updatedSources[id] = sources[id];
                    }
                }
                return { ...p, trackIds: [...p.trackIds, ...newIds], trackAddedAt: addedAt, trackSources: updatedSources };
            }),
        }));
        await MusicPlaylistService.addTracksToPlaylist(userId, channelId, playlistId, newIds, sources);
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
                const sources = p.trackSources
                    ? Object.fromEntries(
                        Object.entries(p.trackSources).filter(([id]) => !removeSet.has(id))
                    )
                    : undefined;
                return {
                    ...p,
                    trackIds: p.trackIds.filter(id => !removeSet.has(id)),
                    ...(addedAt !== undefined && { trackAddedAt: addedAt }),
                    ...(sources !== undefined && { trackSources: sources }),
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

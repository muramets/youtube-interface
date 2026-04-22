// =============================================================================
// PLAYLIST SLICE — Playlists CRUD, ordering, track management
// =============================================================================

import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { MusicPlaylist, TrackSource } from '../../../types/music/musicPlaylist';
import type { SharedLibraryEntry } from '../../../types/music/musicSharing';
import { MusicPlaylistService } from '../../../services/music/musicPlaylistService';
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

    // Actions — mutations resolve owner from the playlist itself (stamped at
    // subscription time). Callers pass only the playlistId; the slice looks
    // up own vs shared collection, updates the correct array optimistically,
    // and writes to the owner's Firestore path.
    subscribePlaylists: (userId: string, channelId: string) => () => void;
    loadPlaylistSettings: (userId: string, channelId: string) => Promise<void>;
    setActivePlaylist: (id: string | null) => void;
    setPlaylistAllSources: (value: boolean) => void;
    /** Create a new playlist in a specific library — caller decides target
     *  (own vs shared). `createPlaylist` keeps explicit userId/channelId for
     *  this reason; all other mutations resolve owner from the playlist. */
    createPlaylist: (userId: string, channelId: string, name: string, group?: string, trackIds?: string[], trackSources?: Record<string, TrackSource>) => Promise<MusicPlaylist>;
    updatePlaylist: (playlistId: string, updates: Partial<Pick<MusicPlaylist, 'name' | 'group' | 'color' | 'order'>>) => Promise<void>;
    deletePlaylist: (playlistId: string) => Promise<void>;
    addTracksToPlaylist: (playlistId: string, trackIds: string[], sources?: Record<string, TrackSource>) => Promise<void>;
    removeTracksFromPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
    reorderPlaylistTracks: (playlistId: string, orderedTrackIds: string[]) => Promise<void>;
}

// ── Playlist lookup helper ───────────────────────────────────────────────
// Searches own first, then shared. Returns the playlist and which collection
// it lives in so mutations update the correct array and write to owner.
type PlaylistLocation = 'own' | 'shared';
function findPlaylistWithLocation(
    playlistId: string,
    own: MusicPlaylist[],
    shared: MusicPlaylist[],
): { playlist: MusicPlaylist; location: PlaylistLocation } | null {
    const ownMatch = own.find((p) => p.id === playlistId);
    if (ownMatch) return { playlist: ownMatch, location: 'own' };
    const sharedMatch = shared.find((p) => p.id === playlistId);
    if (sharedMatch) return { playlist: sharedMatch, location: 'shared' };
    return null;
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
            ownerUserId: userId,
            ownerChannelId: channelId,
            name,
            trackIds: initialIds,
            ...(initialAddedAt && { trackAddedAt: initialAddedAt }),
            ...(trackSources && Object.keys(trackSources).length > 0 && { trackSources }),
            group: group || null,
            order: 0,
            createdAt: now,
            updatedAt: now,
        };
        // Optimistic insert into the correct collection. Firestore snapshot
        // will re-stamp owner on arrival (idempotent).
        set((state) => {
            const isOwn = currentOwnUserIdRef === userId && currentOwnChannelIdRef === channelId;
            return isOwn
                ? { musicPlaylists: [...state.musicPlaylists, playlist] }
                : { sharedPlaylists: [...state.sharedPlaylists, playlist] };
        });
        await MusicPlaylistService.createPlaylist(userId, channelId, playlist);
        return playlist;
    },

    updatePlaylist: async (playlistId, updates) => {
        const { musicPlaylists, sharedPlaylists } = get();
        const found = findPlaylistWithLocation(playlistId, musicPlaylists, sharedPlaylists);
        if (!found) return;
        const { playlist, location } = found;
        const updatedAt = Date.now();

        if (location === 'own') {
            set((state) => ({
                musicPlaylists: state.musicPlaylists.map((p) =>
                    p.id === playlistId ? { ...p, ...updates, updatedAt } : p
                ),
            }));
        } else {
            set((state) => ({
                sharedPlaylists: state.sharedPlaylists.map((p) =>
                    p.id === playlistId ? { ...p, ...updates, updatedAt } : p
                ),
            }));
        }
        await MusicPlaylistService.updatePlaylist(playlist.ownerUserId, playlist.ownerChannelId, playlistId, {
            ...updates,
            updatedAt,
        });
    },

    deletePlaylist: async (playlistId) => {
        const { musicPlaylists, sharedPlaylists } = get();
        const found = findPlaylistWithLocation(playlistId, musicPlaylists, sharedPlaylists);
        if (!found) return;
        const { playlist, location } = found;

        if (location === 'own') {
            set((state) => ({
                musicPlaylists: state.musicPlaylists.filter((p) => p.id !== playlistId),
                activePlaylistId: state.activePlaylistId === playlistId ? null : state.activePlaylistId,
            }));
        } else {
            set((state) => ({
                sharedPlaylists: state.sharedPlaylists.filter((p) => p.id !== playlistId),
                activePlaylistId: state.activePlaylistId === playlistId ? null : state.activePlaylistId,
            }));
        }
        await MusicPlaylistService.deletePlaylist(playlist.ownerUserId, playlist.ownerChannelId, playlistId);
    },

    addTracksToPlaylist: async (playlistId, trackIds, sources) => {
        const now = Date.now();
        const { musicPlaylists, sharedPlaylists } = get();
        const found = findPlaylistWithLocation(playlistId, musicPlaylists, sharedPlaylists);
        if (!found) return;
        const { playlist, location } = found;

        const newIds = trackIds.filter((id) => !playlist.trackIds.includes(id));
        if (newIds.length === 0) return;

        const applyAdd = (p: MusicPlaylist): MusicPlaylist => {
            const addedAt = { ...(p.trackAddedAt || {}) };
            for (const id of newIds) addedAt[id] = now;
            const updatedSources = { ...(p.trackSources || {}) };
            if (sources) {
                for (const id of newIds) {
                    if (sources[id]) updatedSources[id] = sources[id];
                }
            }
            return { ...p, trackIds: [...p.trackIds, ...newIds], trackAddedAt: addedAt, trackSources: updatedSources };
        };

        if (location === 'own') {
            set((state) => ({
                musicPlaylists: state.musicPlaylists.map((p) => (p.id === playlistId ? applyAdd(p) : p)),
            }));
        } else {
            set((state) => ({
                sharedPlaylists: state.sharedPlaylists.map((p) => (p.id === playlistId ? applyAdd(p) : p)),
            }));
        }
        await MusicPlaylistService.addTracksToPlaylist(playlist.ownerUserId, playlist.ownerChannelId, playlistId, newIds, sources);
    },

    removeTracksFromPlaylist: async (playlistId, trackIds) => {
        const { musicPlaylists, sharedPlaylists } = get();
        const found = findPlaylistWithLocation(playlistId, musicPlaylists, sharedPlaylists);
        if (!found) return;
        const { playlist, location } = found;

        const removeSet = new Set(trackIds);
        const applyRemove = (p: MusicPlaylist): MusicPlaylist => {
            const addedAt = p.trackAddedAt
                ? Object.fromEntries(Object.entries(p.trackAddedAt).filter(([id]) => !removeSet.has(id)))
                : undefined;
            const sources = p.trackSources
                ? Object.fromEntries(Object.entries(p.trackSources).filter(([id]) => !removeSet.has(id)))
                : undefined;
            return {
                ...p,
                trackIds: p.trackIds.filter((id) => !removeSet.has(id)),
                ...(addedAt !== undefined && { trackAddedAt: addedAt }),
                ...(sources !== undefined && { trackSources: sources }),
            };
        };

        if (location === 'own') {
            set((state) => ({
                musicPlaylists: state.musicPlaylists.map((p) => (p.id === playlistId ? applyRemove(p) : p)),
            }));
        } else {
            set((state) => ({
                sharedPlaylists: state.sharedPlaylists.map((p) => (p.id === playlistId ? applyRemove(p) : p)),
            }));
        }
        await MusicPlaylistService.removeTracksFromPlaylist(playlist.ownerUserId, playlist.ownerChannelId, playlistId, trackIds);
    },

    reorderPlaylistTracks: async (playlistId, orderedTrackIds) => {
        const { musicPlaylists, sharedPlaylists } = get();
        const found = findPlaylistWithLocation(playlistId, musicPlaylists, sharedPlaylists);
        if (!found) return;
        const { playlist, location } = found;

        if (location === 'own') {
            set((state) => ({
                musicPlaylists: state.musicPlaylists.map((p) =>
                    p.id === playlistId ? { ...p, trackIds: orderedTrackIds } : p
                ),
            }));
        } else {
            set((state) => ({
                sharedPlaylists: state.sharedPlaylists.map((p) =>
                    p.id === playlistId ? { ...p, trackIds: orderedTrackIds } : p
                ),
            }));
        }
        await MusicPlaylistService.reorderPlaylistTracks(playlist.ownerUserId, playlist.ownerChannelId, playlistId, orderedTrackIds);
    },
});

// ── Own-identity refs (module-level) ─────────────────────────────────────
// Shared with librarySlice via musicStore — subscribe() there is the single
// place where the current user/channel identity is known. Needed by
// createPlaylist to decide whether the new playlist should land in the own
// or shared collection optimistically.
let currentOwnUserIdRef: string | null = null;
let currentOwnChannelIdRef: string | null = null;

export function _setOwnIdentityForPlaylistSlice(userId: string | null, channelId: string | null): void {
    currentOwnUserIdRef = userId;
    currentOwnChannelIdRef = channelId;
}

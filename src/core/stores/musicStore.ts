// =============================================================================
// MUSIC LIBRARY: Zustand Store
// =============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Track, MusicSettings, MusicGenre, MusicTag } from '../types/track';
import type { MusicPlaylist } from '../types/musicPlaylist';
import type { MusicShareGrant, SharedLibraryEntry } from '../types/musicSharing';
import { TrackService } from '../services/trackService';
import { MusicPlaylistService } from '../services/musicPlaylistService';
import { MusicSharingService } from '../services/musicSharingService';
import { DEFAULT_GENRES, DEFAULT_TAGS } from '../types/track';

interface MusicState {
    // Track data
    tracks: Track[];
    isLoading: boolean;

    // Selection & playback
    selectedTrackId: string | null;
    playingTrackId: string | null;
    playingVariant: 'vocal' | 'instrumental';
    isPlaying: boolean;
    repeatMode: 'off' | 'all' | 'one';
    currentTime: number;
    duration: number;
    /** Pending seek position in absolute seconds (set by setPlayingTrack, consumed by AudioPlayer on load) */
    pendingSeekSeconds: number | null;
    /** Trim boundaries (in seconds) for editing-timeline playback; 0 = no trim */
    playingTrimStart: number;
    playingTrimEnd: number;
    /** External volume override (0–1). When non-null, AudioPlayer uses this instead of its own slider.
     *  Set by the editing timeline to apply track.volume × masterVolume during preview. */
    playbackVolume: number | null;
    /** Who initiated the current playback — explicit mode flag */
    playbackSource: 'library' | 'timeline' | 'browser-preview' | null;
    /** Monotonic counter — incremented by AudioPlayer when a track finishes.
     *  Subscribers (e.g. useTimelineAutoAdvance) react to changes. */
    trackEndedSignal: number;
    /** AudioPlayer registers this callback so TrackCard can request seeks */
    seekTo: ((position: number) => void) | null;

    // Playback queue (visual order, flattened with groups)
    playbackQueue: string[];

    // Filters
    searchQuery: string;
    genreFilter: string | null;
    tagFilters: string[];
    bpmFilter: [number, number] | null;

    // Music settings (genres & tags management)
    genres: MusicGenre[];
    tags: MusicTag[];
    categoryOrder: string[];
    featuredCategories: string[];
    sortableCategories: string[];
    isSettingsLoaded: boolean;

    // Music playlists
    musicPlaylists: MusicPlaylist[];

    // Sharing
    sharedLibraries: SharedLibraryEntry[];     // libraries shared TO current channel
    activeLibrarySource: SharedLibraryEntry | null; // null = own library
    sharedTracks: Track[];                          // tracks from shared libraries
    sharedPlaylists: MusicPlaylist[];                // playlists from shared libraries
    sharedTags: MusicTag[];                          // tags from shared library owners
    sharedCategoryOrder: string[];                    // category order from shared library owners
    sharedFeaturedCategories: string[];               // featured categories from shared library owners
    sharingGrants: MusicShareGrant[];          // grants FROM current channel (admin)
    activePlaylistId: string | null; // null = all tracks, 'liked' = liked filter
    playlistGroupOrder: string[];

    // Actions: Subscription
    subscribe: (userId: string, channelId: string) => () => void;
    loadSettings: (userId: string, channelId: string) => Promise<void>;
    saveSettings: (userId: string, channelId: string, settings: MusicSettings) => Promise<void>;

    // Actions: Playlists
    subscribePlaylists: (userId: string, channelId: string) => () => void;
    loadPlaylistSettings: (userId: string, channelId: string) => Promise<void>;
    setActivePlaylist: (id: string | null) => void;
    createPlaylist: (userId: string, channelId: string, name: string, group?: string, trackIds?: string[]) => Promise<MusicPlaylist>;
    updatePlaylist: (userId: string, channelId: string, playlistId: string, updates: Partial<Pick<MusicPlaylist, 'name' | 'group' | 'color' | 'order'>>) => Promise<void>;
    deletePlaylist: (userId: string, channelId: string, playlistId: string) => Promise<void>;
    addTracksToPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[]) => Promise<void>;
    removeTracksFromPlaylist: (userId: string, channelId: string, playlistId: string, trackIds: string[]) => Promise<void>;
    reorderPlaylistTracks: (userId: string, channelId: string, playlistId: string, orderedTrackIds: string[]) => Promise<void>;

    // Actions: Sharing
    loadSharedLibraries: (userId: string, channelId: string) => Promise<void>;
    subscribeSharedLibraryTracks: () => () => void;
    setActiveLibrarySource: (source: SharedLibraryEntry | null) => void;
    loadSharingGrants: (userId: string, channelId: string) => Promise<void>;

    // Actions: Selection & Playback
    setSelectedTrackId: (id: string | null) => void;
    setPlayingTrack: (id: string | null, variant?: 'vocal' | 'instrumental', seekPosition?: number, trimStart?: number, trimEnd?: number) => void;
    setIsPlaying: (isPlaying: boolean) => void;
    toggleVariant: () => void;
    cycleRepeatMode: () => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    registerSeek: (fn: ((position: number) => void) | null) => void;
    setPlaybackQueue: (queue: string[]) => void;
    setPlaybackVolume: (vol: number | null) => void;
    setPlaybackSource: (source: 'library' | 'timeline' | 'browser-preview' | null) => void;
    signalTrackEnded: () => void;

    // Actions: Filters
    setSearchQuery: (query: string) => void;
    setGenreFilter: (genre: string | null) => void;
    toggleTagFilter: (tagId: string) => void;
    setBpmFilter: (range: [number, number] | null) => void;
    clearFilters: () => void;

    // Actions: Settings mutations
    setGenres: (genres: MusicGenre[]) => void;
    setTags: (tags: MusicTag[]) => void;
    toggleLike: (userId: string, channelId: string, trackId: string) => void;

    // Actions: Version grouping
    linkAsVersion: (userId: string, channelId: string, sourceTrackId: string, targetTrackId: string) => Promise<void>;
    unlinkFromGroup: (userId: string, channelId: string, trackId: string) => Promise<void>;
    reorderGroupTracks: (userId: string, channelId: string, groupId: string, orderedIds: string[]) => Promise<void>;

    // DnD visibility
    draggingTrackId: string | null;
    setDraggingTrackId: (id: string | null) => void;
}

export const useMusicStore = create<MusicState>((set) => ({
    // Initial state
    tracks: [],
    isLoading: true,
    selectedTrackId: null,
    playingTrackId: null,
    playingVariant: 'vocal',
    isPlaying: false,
    repeatMode: 'off',
    currentTime: 0,
    duration: 0,
    pendingSeekSeconds: null,
    playingTrimStart: 0,
    playingTrimEnd: 0,
    playbackVolume: null,
    playbackSource: null,
    trackEndedSignal: 0,
    seekTo: null,
    playbackQueue: [],
    searchQuery: '',
    genreFilter: null,
    tagFilters: [],
    bpmFilter: null,
    genres: DEFAULT_GENRES,
    tags: DEFAULT_TAGS,
    categoryOrder: [],
    featuredCategories: [],
    sortableCategories: [],
    isSettingsLoaded: false,
    musicPlaylists: [],
    activePlaylistId: null,
    playlistGroupOrder: [],
    sharedLibraries: [],
    activeLibrarySource: null,
    sharedTracks: [],
    sharedPlaylists: [],
    sharedTags: [],
    sharedCategoryOrder: [],
    sharedFeaturedCategories: [],
    sharingGrants: [],
    draggingTrackId: null,
    setDraggingTrackId: (id) => set({ draggingTrackId: id }),

    // Subscribe to real-time track updates
    subscribe: (userId, channelId) => {
        set({ isLoading: true });
        const unsubscribe = TrackService.subscribeToTracks(userId, channelId, (tracks) => {
            set({ tracks, isLoading: false });
        });
        return unsubscribe;
    },

    // Load music settings (genres & tags)
    loadSettings: async (userId, channelId) => {
        try {
            const settings = await TrackService.getMusicSettings(userId, channelId);
            set({
                genres: settings.genres,
                tags: settings.tags,
                categoryOrder: settings.categoryOrder || [],
                featuredCategories: settings.featuredCategories || [],
                sortableCategories: settings.sortableCategories || [],
                isSettingsLoaded: true,
            });
        } catch (error) {
            console.error('[MusicStore] Failed to load settings:', error);
        }
    },

    // Save music settings (optimistic: update store immediately, rollback on error)
    saveSettings: async (userId, channelId, settings) => {
        const state = useMusicStore.getState();
        const prev = { genres: state.genres, tags: state.tags, categoryOrder: state.categoryOrder, featuredCategories: state.featuredCategories, sortableCategories: state.sortableCategories };
        // Optimistic update
        set({ genres: settings.genres, tags: settings.tags, categoryOrder: settings.categoryOrder || prev.categoryOrder, featuredCategories: settings.featuredCategories || prev.featuredCategories, sortableCategories: settings.sortableCategories || prev.sortableCategories });
        try {
            await TrackService.saveMusicSettings(userId, channelId, settings);
        } catch (error) {
            // Rollback on failure
            set({ genres: prev.genres, tags: prev.tags, categoryOrder: prev.categoryOrder, featuredCategories: prev.featuredCategories, sortableCategories: prev.sortableCategories });
            console.error('[MusicStore] Failed to save settings:', error);
            throw error;
        }
    },

    // Selection & Playback
    setSelectedTrackId: (id) => set({ selectedTrackId: id }),

    setPlayingTrack: (id, variant, seekPosition, trimStart, trimEnd) => set({
        playingTrackId: id,
        playingVariant: variant || 'vocal',
        isPlaying: id !== null,
        selectedTrackId: null,
        pendingSeekSeconds: seekPosition ?? null,
        playingTrimStart: trimStart ?? 0,
        playingTrimEnd: trimEnd ?? 0,
        playbackVolume: id === null ? null : useMusicStore.getState().playbackVolume,
        playbackSource: id === null ? null : useMusicStore.getState().playbackSource,
        currentTime: 0,
        duration: 0,
    }),

    setIsPlaying: (isPlaying) => set({ isPlaying }),

    toggleVariant: () => set((state) => ({
        playingVariant: state.playingVariant === 'vocal' ? 'instrumental' : 'vocal',
    })),

    cycleRepeatMode: () => set((state) => ({
        repeatMode: state.repeatMode === 'off' ? 'all' : state.repeatMode === 'all' ? 'one' : 'off',
    })),

    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration }),
    registerSeek: (fn) => set({ seekTo: fn }),
    setPlaybackQueue: (queue) => set({ playbackQueue: queue }),
    setPlaybackVolume: (vol) => set({ playbackVolume: vol }),
    setPlaybackSource: (source) => set({ playbackSource: source }),
    signalTrackEnded: () => set((s) => ({ trackEndedSignal: s.trackEndedSignal + 1 })),

    // Filters
    setSearchQuery: (query) => set({ searchQuery: query }),

    setGenreFilter: (genre) => set((state) => ({
        genreFilter: state.genreFilter === genre ? null : genre,
    })),

    toggleTagFilter: (tagId) => set((state) => {
        const exists = state.tagFilters.includes(tagId);
        return {
            tagFilters: exists
                ? state.tagFilters.filter((t) => t !== tagId)
                : [...state.tagFilters, tagId],
        };
    }),

    setBpmFilter: (range) => set({ bpmFilter: range }),

    clearFilters: () => set({
        searchQuery: '',
        genreFilter: null,
        tagFilters: [],
        bpmFilter: null,
    }),

    // Settings mutations (local only — call saveSettings to persist)
    setGenres: (genres) => set({ genres }),
    setTags: (tags) => set({ tags }),
    toggleLike: (userId, channelId, trackId) => {
        const track = useMusicStore.getState().tracks.find((t) => t.id === trackId);
        const newLiked = !track?.liked;
        // Optimistic update
        set((state) => ({
            tracks: state.tracks.map((t) =>
                t.id === trackId ? { ...t, liked: newLiked } : t
            ),
        }));
        // Persist to Firestore
        TrackService.updateTrack(userId, channelId, trackId, { liked: newLiked }).catch((err) => {
            console.error('[MusicStore] Failed to persist like:', err);
        });
    },

    // Version grouping
    linkAsVersion: async (userId, channelId, sourceTrackId, targetTrackId) => {
        const { tracks } = useMusicStore.getState();
        const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
        const targetTrack = tracks.find((t) => t.id === targetTrackId);
        if (!sourceTrack || !targetTrack) return;

        // Determine groupId: reuse existing from either track, or generate new
        const groupId = sourceTrack.groupId || targetTrack.groupId || uuidv4();

        // Collect all track IDs that need this groupId
        const idsToLink = new Set<string>([targetTrackId, sourceTrackId]);
        // If either track is already in a group, include all members
        for (const t of tracks) {
            if (t.groupId && (t.groupId === sourceTrack.groupId || t.groupId === targetTrack.groupId)) {
                idsToLink.add(t.id);
            }
        }

        // Build update map: set groupId and assign groupOrder to tracks that lack it
        const allLinked = tracks.filter(t => idsToLink.has(t.id));
        let nextOrder = allLinked.reduce((max, t) => Math.max(max, t.groupOrder ?? -1), -1) + 1;

        const updateMap = new Map<string, { groupId: string; groupOrder?: number }>();
        for (const t of allLinked) {
            if (t.groupOrder !== undefined) {
                updateMap.set(t.id, { groupId });
            } else {
                updateMap.set(t.id, { groupId, groupOrder: nextOrder++ });
            }
        }

        // Optimistic update
        set((state) => ({
            tracks: state.tracks.map((t) => {
                const upd = updateMap.get(t.id);
                return upd ? { ...t, ...upd } : t;
            }),
        }));

        try {
            await TrackService.batchUpdateTracks(
                userId, channelId,
                [...updateMap.entries()].map(([trackId, data]) => ({ trackId, data }))
            );
        } catch (err) {
            console.error('[MusicStore] Failed to link tracks:', err);
        }
    },

    unlinkFromGroup: async (userId, channelId, trackId) => {
        const { tracks } = useMusicStore.getState();
        const track = tracks.find((t) => t.id === trackId);
        if (!track?.groupId) return;

        const groupId = track.groupId;
        const remaining = tracks.filter((t) => t.groupId === groupId && t.id !== trackId);

        // Optimistic update: remove groupId from target
        // If only 1 remains, also clear its groupId
        set((state) => ({
            tracks: state.tracks.map((t) => {
                if (t.id === trackId) return { ...t, groupId: undefined };
                if (remaining.length === 1 && t.id === remaining[0].id) return { ...t, groupId: undefined };
                return t;
            }),
        }));

        try {
            await TrackService.unlinkFromGroup(userId, channelId, trackId, tracks);
        } catch (err) {
            console.error('[MusicStore] Failed to unlink track:', err);
        }
    },

    reorderGroupTracks: async (userId, channelId, groupId, orderedIds) => {
        // Optimistic update: set groupOrder based on position in orderedIds
        set((state) => ({
            tracks: state.tracks.map((t) => {
                if (t.groupId !== groupId) return t;
                const idx = orderedIds.indexOf(t.id);
                return idx >= 0 ? { ...t, groupOrder: idx } : t;
            }),
        }));

        // Persist atomically — single batch commit → single snapshot
        try {
            await TrackService.batchUpdateTracks(
                userId,
                channelId,
                orderedIds.map((id, idx) => ({ trackId: id, data: { groupOrder: idx } })),
                { quiet: true }
            );
        } catch (err) {
            console.error('[MusicStore] Failed to reorder group tracks:', err);
        }
    },

    // Sharing
    loadSharedLibraries: async (userId, channelId) => {
        try {
            const libraries = await MusicSharingService.getSharedLibraries(userId, channelId);
            set({ sharedLibraries: libraries });
        } catch (error) {
            console.error('[MusicStore] Failed to load shared libraries:', error);
        }
    },

    setActiveLibrarySource: (source) => set({ activeLibrarySource: source }),

    subscribeSharedLibraryTracks: () => {
        const { sharedLibraries } = useMusicStore.getState();
        if (sharedLibraries.length === 0) {
            set({ sharedTracks: [], sharedPlaylists: [], sharedTags: [], sharedCategoryOrder: [], sharedFeaturedCategories: [] });
            return () => { };
        }

        const unsubs: (() => void)[] = [];
        const trackBuckets: Record<number, Track[]> = {};
        const playlistBuckets: Record<number, MusicPlaylist[]> = {};
        const tagBuckets: Record<number, MusicTag[]> = {};

        sharedLibraries.forEach((lib, i) => {
            trackBuckets[i] = [];
            playlistBuckets[i] = [];
            tagBuckets[i] = [];

            // Load owner's settings for tag/category resolution
            TrackService.getMusicSettings(lib.ownerUserId, lib.ownerChannelId)
                .then((settings) => {
                    tagBuckets[i] = settings.tags || [];
                    const allSharedTags = Object.values(tagBuckets).flat();
                    // Merge category orders from all shared libraries (deduped, preserving order)
                    const ownCats = new Set(useMusicStore.getState().categoryOrder);
                    const mergedCatOrder = Object.values(tagBuckets)
                        .flatMap((tags) => [...new Set(tags.map((t) => t.category).filter((c): c is string => !!c))]);
                    const sharedCatOrder = [...new Set(mergedCatOrder)].filter((c) => !ownCats.has(c));
                    const sharedFeatured = (settings.featuredCategories || []).filter((c: string) => !ownCats.has(c));
                    set({ sharedTags: allSharedTags, sharedCategoryOrder: sharedCatOrder, sharedFeaturedCategories: sharedFeatured });
                })
                .catch((err) => console.error('[MusicStore] Failed to load shared settings:', err));

            unsubs.push(
                TrackService.subscribeToTracks(lib.ownerUserId, lib.ownerChannelId, (t) => {
                    trackBuckets[i] = t;
                    set({ sharedTracks: Object.values(trackBuckets).flat() });
                }),
            );
            unsubs.push(
                MusicPlaylistService.subscribeToPlaylists(lib.ownerUserId, lib.ownerChannelId, (p) => {
                    playlistBuckets[i] = p;
                    set({ sharedPlaylists: Object.values(playlistBuckets).flat() });
                }),
            );
        });

        return () => unsubs.forEach((u) => u());
    },

    loadSharingGrants: async (userId, channelId) => {
        try {
            const grants = await MusicSharingService.getShareGrants(userId, channelId);
            set({ sharingGrants: grants });
        } catch (error) {
            console.error('[MusicStore] Failed to load sharing grants:', error);
        }
    },

    // Playlists
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
        // Optimistic update
        set((state) => ({ musicPlaylists: [...state.musicPlaylists, playlist] }));
        await MusicPlaylistService.createPlaylist(userId, channelId, playlist);
        return playlist;
    },

    updatePlaylist: async (userId, channelId, playlistId, updates) => {
        // Optimistic update
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
        // Optimistic update
        set((state) => ({
            musicPlaylists: state.musicPlaylists.filter((p) => p.id !== playlistId),
            activePlaylistId: state.activePlaylistId === playlistId ? null : state.activePlaylistId,
        }));
        await MusicPlaylistService.deletePlaylist(userId, channelId, playlistId);
    },

    addTracksToPlaylist: async (userId, channelId, playlistId, trackIds) => {
        const now = Date.now();
        // Optimistic update
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
        // Optimistic update
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) => {
                if (p.id !== playlistId) return p;
                // Clean up trackAddedAt to avoid orphan keys
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
        // Optimistic update
        set((state) => ({
            musicPlaylists: state.musicPlaylists.map((p) =>
                p.id === playlistId
                    ? { ...p, trackIds: orderedTrackIds }
                    : p
            ),
        }));
        await MusicPlaylistService.reorderPlaylistTracks(userId, channelId, playlistId, orderedTrackIds);
    },
}));

// ── Memoized selectors: own + shared (deduped by id) ───────────────
// Cache last inputs to avoid creating new arrays on every store access.
// Same pattern as reselect: recompute only when input references change.

let _cachedAllTracks: Track[] = [];
let _lastOwnTracks: Track[] = [];
let _lastSharedTracks: Track[] = [];

/** Merged own + shared tracks — use as `useMusicStore(selectAllTracks)` */
export const selectAllTracks = (s: MusicState): Track[] => {
    if (s.tracks === _lastOwnTracks && s.sharedTracks === _lastSharedTracks) {
        return _cachedAllTracks;
    }
    _lastOwnTracks = s.tracks;
    _lastSharedTracks = s.sharedTracks;

    if (s.sharedTracks.length === 0) {
        _cachedAllTracks = s.tracks;
    } else {
        const ownIds = new Set(s.tracks.map((t) => t.id));
        _cachedAllTracks = [...s.tracks, ...s.sharedTracks.filter((t) => !ownIds.has(t.id))];
    }
    return _cachedAllTracks;
};

let _cachedAllPlaylists: MusicPlaylist[] = [];
let _lastOwnPlaylists: MusicPlaylist[] = [];
let _lastSharedPlaylists: MusicPlaylist[] = [];

/** Merged own + shared playlists — use as `useMusicStore(selectAllPlaylists)` */
export const selectAllPlaylists = (s: MusicState): MusicPlaylist[] => {
    if (s.musicPlaylists === _lastOwnPlaylists && s.sharedPlaylists === _lastSharedPlaylists) {
        return _cachedAllPlaylists;
    }
    _lastOwnPlaylists = s.musicPlaylists;
    _lastSharedPlaylists = s.sharedPlaylists;

    if (s.sharedPlaylists.length === 0) {
        _cachedAllPlaylists = s.musicPlaylists;
    } else {
        const ownIds = new Set(s.musicPlaylists.map((p) => p.id));
        _cachedAllPlaylists = [...s.musicPlaylists, ...s.sharedPlaylists.filter((p) => !ownIds.has(p.id))];
    }
    return _cachedAllPlaylists;
};

let _cachedAllTags: MusicTag[] = [];
let _lastOwnTags: MusicTag[] = [];
let _lastSharedTags: MusicTag[] = [];

/** Merged own + shared tags (deduped by id) — use as `useMusicStore(selectAllTags)` */
export const selectAllTags = (s: MusicState): MusicTag[] => {
    if (s.tags === _lastOwnTags && s.sharedTags === _lastSharedTags) {
        return _cachedAllTags;
    }
    _lastOwnTags = s.tags;
    _lastSharedTags = s.sharedTags;

    if (s.sharedTags.length === 0) {
        _cachedAllTags = s.tags;
    } else {
        const ownIds = new Set(s.tags.map((t) => t.id));
        _cachedAllTags = [...s.tags, ...s.sharedTags.filter((t) => !ownIds.has(t.id))];
    }
    return _cachedAllTags;
};

let _cachedAllCategoryOrder: string[] = [];
let _lastOwnCatOrder: string[] = [];
let _lastSharedCatOrder: string[] = [];

/** Merged own + shared category order (deduped) — use as `useMusicStore(selectAllCategoryOrder)` */
export const selectAllCategoryOrder = (s: MusicState): string[] => {
    if (s.categoryOrder === _lastOwnCatOrder && s.sharedCategoryOrder === _lastSharedCatOrder) {
        return _cachedAllCategoryOrder;
    }
    _lastOwnCatOrder = s.categoryOrder;
    _lastSharedCatOrder = s.sharedCategoryOrder;

    if (s.sharedCategoryOrder.length === 0) {
        _cachedAllCategoryOrder = s.categoryOrder;
    } else {
        const ownSet = new Set(s.categoryOrder);
        _cachedAllCategoryOrder = [...s.categoryOrder, ...s.sharedCategoryOrder.filter((c) => !ownSet.has(c))];
    }
    return _cachedAllCategoryOrder;
};

let _cachedAllFeaturedCategories: string[] = [];
let _lastOwnFeatured: string[] = [];
let _lastSharedFeatured: string[] = [];

/** Merged own + shared featured categories (deduped) — use as `useMusicStore(selectAllFeaturedCategories)` */
export const selectAllFeaturedCategories = (s: MusicState): string[] => {
    if (s.featuredCategories === _lastOwnFeatured && s.sharedFeaturedCategories === _lastSharedFeatured) {
        return _cachedAllFeaturedCategories;
    }
    _lastOwnFeatured = s.featuredCategories;
    _lastSharedFeatured = s.sharedFeaturedCategories;

    if (s.sharedFeaturedCategories.length === 0) {
        _cachedAllFeaturedCategories = s.featuredCategories;
    } else {
        const ownSet = new Set(s.featuredCategories);
        _cachedAllFeaturedCategories = [...s.featuredCategories, ...s.sharedFeaturedCategories.filter((c) => !ownSet.has(c))];
    }
    return _cachedAllFeaturedCategories;
};

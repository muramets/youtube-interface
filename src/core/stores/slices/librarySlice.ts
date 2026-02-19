// =============================================================================
// LIBRARY SLICE — Tracks, settings, sharing, filters, version grouping
// =============================================================================

import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Track, MusicGenre, MusicTag, MusicSettings } from '../../types/track';
import type { SharedLibraryEntry, MusicShareGrant } from '../../types/musicSharing';
import type { MusicPlaylist } from '../../types/musicPlaylist';
import { TrackService } from '../../services/trackService';
import { MusicPlaylistService } from '../../services/musicPlaylistService';
import { MusicSharingService } from '../../services/musicSharingService';
import { DEFAULT_GENRES, DEFAULT_TAGS } from '../../types/track';
import type { MusicState } from '../musicStore';

export interface LibrarySlice {
    // Track data
    tracks: Track[];
    isLoading: boolean;

    // Filters
    searchQuery: string;
    genreFilter: string | null;
    tagFilters: string[];
    bpmFilter: [number, number] | null;

    // Music settings
    genres: MusicGenre[];
    tags: MusicTag[];
    categoryOrder: string[];
    featuredCategories: string[];
    sortableCategories: string[];
    isSettingsLoaded: boolean;

    // Sharing
    sharedLibraries: SharedLibraryEntry[];
    activeLibrarySource: SharedLibraryEntry | null;
    sharedTracks: Track[];
    sharedGenres: MusicGenre[];
    sharedTags: MusicTag[];
    sharedCategoryOrder: string[];
    sharedFeaturedCategories: string[];
    sharingGrants: MusicShareGrant[];

    // DnD visibility
    draggingTrackId: string | null;

    // Actions: Subscription
    subscribe: (userId: string, channelId: string) => () => void;
    loadSettings: (userId: string, channelId: string) => Promise<void>;
    saveSettings: (userId: string, channelId: string, settings: MusicSettings) => Promise<void>;

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

    // Actions: Sharing
    loadSharedLibraries: (userId: string, channelId: string) => Promise<void>;
    subscribeSharedLibraryTracks: () => () => void;
    setActiveLibrarySource: (source: SharedLibraryEntry | null) => void;
    loadSharingGrants: (userId: string, channelId: string) => Promise<void>;

    // DnD
    setDraggingTrackId: (id: string | null) => void;
}

export const createLibrarySlice: StateCreator<MusicState, [], [], LibrarySlice> = (set, get) => ({
    // Initial state
    tracks: [],
    isLoading: true,
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
    sharedLibraries: [],
    activeLibrarySource: null,
    sharedTracks: [],
    sharedGenres: [],
    sharedTags: [],
    sharedCategoryOrder: [],
    sharedFeaturedCategories: [],
    sharingGrants: [],
    draggingTrackId: null,

    // ── Subscription ────────────────────────────────────────────────────────
    subscribe: (userId, channelId) => {
        set({ isLoading: true });
        const unsubscribe = TrackService.subscribeToTracks(userId, channelId, (tracks) => {
            set({ tracks, isLoading: false });
        });
        return unsubscribe;
    },

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

    saveSettings: async (userId, channelId, settings) => {
        const state = get();
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

    // ── Filters ─────────────────────────────────────────────────────────────
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

    // ── Settings mutations ──────────────────────────────────────────────────
    setGenres: (genres) => set({ genres }),
    setTags: (tags) => set({ tags }),

    toggleLike: (userId, channelId, trackId) => {
        const track = get().tracks.find((t) => t.id === trackId);
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

    // ── Version grouping ────────────────────────────────────────────────────
    linkAsVersion: async (userId, channelId, sourceTrackId, targetTrackId) => {
        const { tracks } = get();
        const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
        const targetTrack = tracks.find((t) => t.id === targetTrackId);
        if (!sourceTrack || !targetTrack) return;

        const groupId = sourceTrack.groupId || targetTrack.groupId || uuidv4();
        const idsToLink = new Set<string>([targetTrackId, sourceTrackId]);
        for (const t of tracks) {
            if (t.groupId && (t.groupId === sourceTrack.groupId || t.groupId === targetTrack.groupId)) {
                idsToLink.add(t.id);
            }
        }

        const allLinked = tracks.filter(t => idsToLink.has(t.id));
        const existingMembers = allLinked.filter(t => t.id !== sourceTrackId);
        let nextOrder = existingMembers.reduce((max, t) => Math.max(max, t.groupOrder ?? -1), -1) + 1;

        const updateMap = new Map<string, { groupId: string; groupOrder?: number }>();
        for (const t of existingMembers) {
            if (t.groupOrder !== undefined) {
                updateMap.set(t.id, { groupId });
            } else {
                updateMap.set(t.id, { groupId, groupOrder: nextOrder++ });
            }
        }
        updateMap.set(sourceTrackId, { groupId, groupOrder: nextOrder });

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
        const { tracks } = get();
        const track = tracks.find((t) => t.id === trackId);
        if (!track?.groupId) return;

        const groupId = track.groupId;
        const remaining = tracks.filter((t) => t.groupId === groupId && t.id !== trackId);

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
        set((state) => ({
            tracks: state.tracks.map((t) => {
                if (t.groupId !== groupId) return t;
                const idx = orderedIds.indexOf(t.id);
                return idx >= 0 ? { ...t, groupOrder: idx } : t;
            }),
        }));

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

    // ── Sharing ─────────────────────────────────────────────────────────────
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
        const { sharedLibraries } = get();
        if (sharedLibraries.length === 0) {
            set({ sharedTracks: [], sharedPlaylists: [], sharedGenres: [], sharedTags: [], sharedCategoryOrder: [], sharedFeaturedCategories: [] });
            return () => { };
        }

        const unsubs: (() => void)[] = [];
        const trackBuckets: Record<number, Track[]> = {};
        const playlistBuckets: Record<number, MusicPlaylist[]> = {};
        const tagBuckets: Record<number, MusicTag[]> = {};
        const genreBuckets: Record<number, MusicGenre[]> = {};

        sharedLibraries.forEach((lib, i) => {
            trackBuckets[i] = [];
            playlistBuckets[i] = [];
            tagBuckets[i] = [];
            genreBuckets[i] = [];

            // Load owner's settings for genre/tag/category resolution
            TrackService.getMusicSettings(lib.ownerUserId, lib.ownerChannelId)
                .then((settings) => {
                    tagBuckets[i] = settings.tags || [];
                    genreBuckets[i] = settings.genres || [];
                    const allSharedTags = Object.values(tagBuckets).flat();
                    const allSharedGenres = Object.values(genreBuckets).flat();
                    const ownCats = new Set(get().categoryOrder);
                    const mergedCatOrder = Object.values(tagBuckets)
                        .flatMap((tags) => [...new Set(tags.map((t) => t.category).filter((c): c is string => !!c))]);
                    const sharedCatOrder = [...new Set(mergedCatOrder)].filter((c) => !ownCats.has(c));
                    const sharedFeatured = (settings.featuredCategories || []).filter((c: string) => !ownCats.has(c));
                    set({ sharedGenres: allSharedGenres, sharedTags: allSharedTags, sharedCategoryOrder: sharedCatOrder, sharedFeaturedCategories: sharedFeatured });
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

    // DnD
    setDraggingTrackId: (id) => set({ draggingTrackId: id }),
});

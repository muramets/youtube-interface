// =============================================================================
// LIBRARY SLICE — Tracks, settings, sharing, filters, version grouping
// =============================================================================

import type { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Track, MusicGenre, MusicTag, MusicSettings } from '../../types/track';
import type { SharedLibraryEntry, MusicShareGrant } from '../../types/musicSharing';
import type { MusicPlaylist } from '../../types/musicPlaylist';
import { TrackService } from '../../services/trackService';
import { preloadImages } from '../../services/imagePreloaderService';
import { MusicPlaylistService } from '../../services/musicPlaylistService';
import { MusicSharingService } from '../../services/musicSharingService';
import { DEFAULT_GENRES, DEFAULT_TAGS } from '../../types/track';
import type { MusicState } from '../musicStore';

export interface LibrarySlice {
    // Track data
    tracks: Track[];
    isLoading: boolean;
    /** True while the first shared-library track snapshot hasn't arrived yet.
     *  Mirrors isLoading but for shared subscriptions — used to show skeleton
     *  when the user is viewing a shared library during initial/channel-switch load. */
    isSharedTracksLoading: boolean;

    // Filters (searchQuery kept here; genre/tag/bpm live in filterStore)
    searchQuery: string;

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

    // Actions: Settings mutations
    setGenres: (genres: MusicGenre[]) => void;
    setTags: (tags: MusicTag[]) => void;
    toggleLike: (userId: string, channelId: string, trackId: string) => void;

    // Actions: Version grouping
    linkAsVersion: (userId: string, channelId: string, sourceTrackId: string, targetTrackId: string) => Promise<void>;
    /**
     * Atomic version of linkAsVersion that also positions the new track in one Firestore batch.
     * insertIdx follows the TrackGroupCard convention: index within child tracks (excluding the
     * display track), so the actual array position is insertIdx + 1. Pass -1 to append at end.
     * Replaces the previous two-step linkAsVersion + reorderGroupTracks pattern.
     */
    linkAsVersionAndReorder: (userId: string, channelId: string, sourceTrackId: string, targetTrackId: string, insertIdx: number) => Promise<void>;
    /**
     * Move a single grouped track from its current group to another group.
     * Unlike linkAsVersion (which merges entire groups), this removes the track
     * from its source group (dissolving it if ≤1 member remains) and inserts it
     * into the target group at insertIdx. Atomic: one optimistic update + one batch.
     */
    moveTrackToGroup: (userId: string, channelId: string, sourceTrackId: string, targetRepTrackId: string, insertIdx: number) => Promise<void>;
    /**
     * Moves a grouped track to pair with a standalone (ungrouped) track.
     * Dissolves the source group if ≤1 track remains after removal.
     * Creates a new group: [standaloneTarget (order 0), source (order 1)].
     * Atomic: one optimistic update + one Firestore batch.
     */
    relinkGroupMember: (userId: string, channelId: string, sourceTrackId: string, standaloneTargetId: string) => Promise<void>;
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

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Populates both the optimistic-state map and the Firestore-write map with entries
 * to dissolve the source group when only one track would remain after removal.
 *
 * Convention: `null` = Firestore field removal (clears the stored value),
 *             `undefined` = React state absence (never serialised).
 */
function markGroupDissolution(
    srcGroupId: string,
    sourceTrackId: string,
    allTracks: Track[],
    optimistic: Map<string, Partial<Track>>,
    firestore: Map<string, Record<string, unknown>>,
): void {
    const remaining = allTracks
        .filter((t) => t.groupId === srcGroupId && t.id !== sourceTrackId)
        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
    if (remaining.length === 1) {
        optimistic.set(remaining[0].id, { groupId: undefined, groupOrder: undefined });
        firestore.set(remaining[0].id, { groupId: null, groupOrder: null });
    }
    // 2+ remaining: preserve existing groupId/groupOrder — caller normalises order if needed.
    // 0 remaining: source was the sole member, nothing to dissolve.
}

// ─────────────────────────────────────────────────────────────────────────────

export const createLibrarySlice: StateCreator<MusicState, [], [], LibrarySlice> = (set, get) => ({
    // Initial state
    tracks: [],
    isLoading: true,
    isSharedTracksLoading: false,
    searchQuery: '',
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
        let isFirstSnapshot = true;

        const unsubscribe = TrackService.subscribeToTracks(userId, channelId, (tracks) => {
            if (isFirstSnapshot) {
                isFirstSnapshot = false;
                // Stash data immediately so other selectors can access tracks,
                // but keep isLoading true until cover images are preloaded.
                set({ tracks });

                // Preload the first 8 visible covers while the skeleton is still
                // shown. imagePreloaderService owns the DOM concern (new Image());
                // this slice only coordinates when loading ends.
                const urls = tracks
                    .slice(0, 8)
                    .map((t) => t.coverUrl)
                    .filter((u): u is string => !!u);

                const clearLoading = () => set({ isLoading: false });

                preloadImages(urls, { timeout: 700 }).then(clearLoading);
            } else {
                // Subsequent snapshots (user adds/edits a track — no loading state needed)
                set({ tracks });
            }
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

    // Atomic variant: links sourceTrack into the group AND positions it in one
    // Firestore batch, eliminating the intermediate snapshot between the two
    // separate linkAsVersion + reorderGroupTracks writes.
    linkAsVersionAndReorder: async (userId, channelId, sourceTrackId, targetTrackId, insertIdx) => {
        const { tracks } = get();
        const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
        const targetTrack = tracks.find((t) => t.id === targetTrackId);
        if (!sourceTrack || !targetTrack) return;

        // Determine which tracks will be in the resulting group.
        const groupId = sourceTrack.groupId || targetTrack.groupId || uuidv4();
        const memberIds = new Set<string>([targetTrackId, sourceTrackId]);
        for (const t of tracks) {
            if (t.groupId && (t.groupId === sourceTrack.groupId || t.groupId === targetTrack.groupId)) {
                memberIds.add(t.id);
            }
        }

        // Sort existing members by their current groupOrder (same convention as TrackGroupCard.sorted).
        const existingMembers = tracks
            .filter((t) => memberIds.has(t.id) && t.id !== sourceTrackId)
            .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

        // Build the final ordered array.
        // insertIdx is the child-relative position (TrackGroupCard convention):
        //   insertIdx + 1 = actual position in the full array (after the display track at index 0).
        const orderedFinal = [...existingMembers];
        if (insertIdx >= 0) {
            const pos = Math.min(insertIdx + 1, orderedFinal.length);
            orderedFinal.splice(pos, 0, sourceTrack);
        } else {
            orderedFinal.push(sourceTrack); // append at end
        }

        // Build a flat updateMap: every member gets its final groupId + groupOrder.
        const updateMap = new Map<string, { groupId: string; groupOrder: number }>();
        orderedFinal.forEach((t, idx) => {
            updateMap.set(t.id, { groupId, groupOrder: idx });
        });

        // Single optimistic update — one React render, no intermediate state.
        set((state) => ({
            tracks: state.tracks.map((t) => {
                const upd = updateMap.get(t.id);
                return upd ? { ...t, ...upd } : t;
            }),
        }));

        // Single atomic Firestore batch — one snapshot trigger, no swapping.
        try {
            await TrackService.batchUpdateTracks(
                userId, channelId,
                [...updateMap.entries()].map(([trackId, data]) => ({ trackId, data }))
            );
        } catch (err) {
            console.error('[MusicStore] Failed to atomically link and reorder tracks:', err);
        }
    },

    // Moves one grouped track into a different existing group.
    // Unlike linkAsVersion (which merges all tracks from both groups), this:
    //   1. Removes sourceTrack from its source group (dissolves if ≤1 remain)
    //   2. Inserts it into the target group at insertIdx position
    //   3. Writes everything atomically in one Firestore batch.
    moveTrackToGroup: async (userId, channelId, sourceTrackId, targetRepTrackId, insertIdx) => {
        const { tracks } = get();
        const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
        const targetTrack = tracks.find((t) => t.id === targetRepTrackId);
        if (!sourceTrack || !targetTrack) return;

        const srcGroupId = sourceTrack.groupId;
        const tgtGroupId = targetTrack.groupId;
        if (!tgtGroupId) return; // target must be in a group
        if (srcGroupId === tgtGroupId) return; // same group — no-op

        const optimistic = new Map<string, Partial<Track>>();
        const firestoreData = new Map<string, Record<string, unknown>>();

        // ── Source group ────────────────────────────────────────────────────
        if (srcGroupId) {
            const remaining = tracks
                .filter((t) => t.groupId === srcGroupId && t.id !== sourceTrackId)
                .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

            if (remaining.length === 1) {
                // Single survivor — dissolve the group
                markGroupDissolution(srcGroupId, sourceTrackId, tracks, optimistic, firestoreData);
            } else if (remaining.length >= 2) {
                // Normalise groupOrders so they remain contiguous after removal.
                // Skipping this would leave numeric gaps (e.g. orders 1, 2 after
                // removing order 0), which is harmless for display but poor data hygiene.
                remaining.forEach((t, idx) => {
                    if ((t.groupOrder ?? -1) !== idx) {
                        optimistic.set(t.id, { groupId: t.groupId, groupOrder: idx });
                        firestoreData.set(t.id, { groupId: t.groupId, groupOrder: idx });
                    }
                });
            }
        }

        // ── Target group ────────────────────────────────────────────────────
        const targetMembers = tracks
            .filter((t) => t.groupId === tgtGroupId)
            .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

        const orderedFinal = [...targetMembers];
        if (insertIdx >= 0) {
            const pos = Math.min(insertIdx + 1, orderedFinal.length);
            orderedFinal.splice(pos, 0, sourceTrack);
        } else {
            orderedFinal.push(sourceTrack); // append at end
        }

        orderedFinal.forEach((t, idx) => {
            optimistic.set(t.id, { groupId: tgtGroupId, groupOrder: idx });
            firestoreData.set(t.id, { groupId: tgtGroupId, groupOrder: idx });
        });

        // ── Single optimistic update ────────────────────────────────────
        set((state) => ({
            tracks: state.tracks.map((t) => {
                const upd = optimistic.get(t.id);
                return upd !== undefined ? { ...t, ...upd } : t;
            }),
        }));

        // ── Single atomic Firestore batch ────────────────────────────────────
        try {
            await TrackService.batchUpdateTracks(
                userId, channelId,
                [...firestoreData.entries()].map(([trackId, data]) => ({
                    trackId,
                    data: data as Partial<Track>,
                }))
            );
        } catch (err) {
            console.error('[MusicStore] Failed to move track between groups:', err);
        }
    },

    // Pairs a grouped track with a standalone (ungrouped) track.
    // Correctly dissolves the source group if ≤1 track remains, and
    // creates a brand-new group rather than re-using the source groupId
    // (which linkAsVersion would do, incorrectly merging all of B into A).
    relinkGroupMember: async (userId, channelId, sourceTrackId, standaloneTargetId) => {
        const { tracks } = get();
        const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
        const targetTrack = tracks.find((t) => t.id === standaloneTargetId);
        if (!sourceTrack || !targetTrack) return;
        if (targetTrack.groupId) return; // target must be standalone; use moveTrackToGroup otherwise

        const srcGroupId = sourceTrack.groupId;
        const newGroupId = uuidv4();

        const optimistic = new Map<string, Partial<Track>>();
        const firestoreData = new Map<string, Record<string, unknown>>();

        if (srcGroupId) {
            markGroupDissolution(srcGroupId, sourceTrackId, tracks, optimistic, firestoreData);
        }

        // New group: standalone target at order 0, moved track at order 1.
        optimistic.set(standaloneTargetId, { groupId: newGroupId, groupOrder: 0 });
        firestoreData.set(standaloneTargetId, { groupId: newGroupId, groupOrder: 0 });
        optimistic.set(sourceTrackId, { groupId: newGroupId, groupOrder: 1 });
        firestoreData.set(sourceTrackId, { groupId: newGroupId, groupOrder: 1 });

        set((state) => ({
            tracks: state.tracks.map((t) => {
                const upd = optimistic.get(t.id);
                return upd !== undefined ? { ...t, ...upd } : t;
            }),
        }));

        try {
            await TrackService.batchUpdateTracks(
                userId, channelId,
                [...firestoreData.entries()].map(([trackId, data]) => ({
                    trackId,
                    data: data as Partial<Track>,
                }))
            );
        } catch (err) {
            console.error('[MusicStore] Failed to relink group member:', err);
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
            // Only clear shared data AFTER Firestore confirms there are no shared libraries.
            // Do NOT clear eagerly (e.g. during transient empty state on channel switch).
            if (libraries.length === 0) {
                set({ sharedTracks: [], sharedPlaylists: [], sharedGenres: [], sharedTags: [], sharedCategoryOrder: [], sharedFeaturedCategories: [] });
            }
            // Validate activeLibrarySource against the new channel's libraries.
            // If the current source is no longer accessible, clear it.
            const currentSource = get().activeLibrarySource;
            if (currentSource && !libraries.some(lib => lib.ownerChannelId === currentSource.ownerChannelId)) {
                set({ activeLibrarySource: null });
                localStorage.removeItem('music_active_library_channel_id');
            }
            // Restore last active library from localStorage (safe — only match known libraries)
            try {
                const savedChannelId = localStorage.getItem('music_active_library_channel_id');
                if (savedChannelId) {
                    const match = libraries.find(lib => lib.ownerChannelId === savedChannelId);
                    if (match) set({ activeLibrarySource: match });
                }
            } catch { /* storage unavailable — fail silently */ }
        } catch (error) {
            console.error('[MusicStore] Failed to load shared libraries:', error);
        }
    },

    setActiveLibrarySource: (source) => {
        set({ activeLibrarySource: source });
        // Persist across reloads: store ownerChannelId so we can restore on next session.
        try {
            if (source) {
                localStorage.setItem('music_active_library_channel_id', source.ownerChannelId);
            } else {
                localStorage.removeItem('music_active_library_channel_id');
            }
        } catch { /* storage unavailable — fail silently */ }
    },

    subscribeSharedLibraryTracks: () => {
        const { sharedLibraries } = get();
        if (sharedLibraries.length === 0) {
            // No shared libraries — clear loading flag and bail.
            // Don't clear sharedTracks here: this fires during a transient empty state
            // (e.g. channel switch before loadSharedLibraries completes). Clearing is
            // handled by loadSharedLibraries once Firestore confirms zero libraries.
            set({ isSharedTracksLoading: false });
            return () => { };
        }

        // Mark loading BEFORE subscribing so the UI shows skeleton immediately.
        // Will be cleared when the first track snapshot from any library arrives.
        set({ isSharedTracksLoading: true });
        let firstSnapshotReceived = false;

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
                    const mergedCatOrder = Object.values(tagBuckets)
                        .flatMap((tags) => [...new Set(tags.map((t) => t.category).filter((c): c is string => !!c))]);
                    // Store the full shared values (not deduped against own).
                    // Dedup for the merged view happens in selectAllFeaturedCategories (musicStore.ts).
                    const sharedCatOrder = [...new Set(mergedCatOrder)];
                    const sharedFeatured = settings.featuredCategories || [];
                    set({ sharedGenres: allSharedGenres, sharedTags: allSharedTags, sharedCategoryOrder: sharedCatOrder, sharedFeaturedCategories: sharedFeatured });
                })
                .catch((err) => console.error('[MusicStore] Failed to load shared settings:', err));

            unsubs.push(
                TrackService.subscribeToTracks(lib.ownerUserId, lib.ownerChannelId, (t) => {
                    trackBuckets[i] = t;
                    if (!firstSnapshotReceived) {
                        // First delivery from any library — clear skeleton
                        firstSnapshotReceived = true;
                        set({ sharedTracks: Object.values(trackBuckets).flat(), isSharedTracksLoading: false });
                    } else {
                        set({ sharedTracks: Object.values(trackBuckets).flat() });
                    }
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

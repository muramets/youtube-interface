// =============================================================================
// useMusicPageData — Store selectors, subscriptions, derived state, and
// business logic for the Music page.
//
// Extracted from MusicPage.tsx to keep the page component focused on rendering.
// All effects (track subscriptions, URL sync) live here so the page stays clean.
// =============================================================================
const DEFAULT_PLAYLIST_SORT_BY = 'default';
const DEFAULT_PLAYLIST_SORT_ASC = true;

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import type { SharePermissions } from '../../../core/types/musicSharing';
import { DEFAULT_SHARE_PERMISSIONS, OWNER_PERMISSIONS } from '../../../core/types/musicSharing';
import {
    useMusicStore,
    selectAllTags, selectAllGenres,
    selectAllCategoryOrder, selectAllFeaturedCategories,
} from '../../../core/stores/musicStore';
import { useFilterStore } from '../../../core/stores/filterStore';
import { useTrackDisplay } from './useTrackDisplay';
import { TrackService } from '../../../core/services/trackService';
import { deleteTrackFolder } from '../../../core/services/storageService';
import type { TrackSource } from '../../../core/types/musicPlaylist';

export function useMusicPageData() {
    // ── Auth / channel ──────────────────────────────────────────────────────
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    // ── Music store: reactive state — single subscription, shallow equality ──
    // One compound selector instead of 22 individual subscriptions.
    // useShallow does a field-by-field shallow comparison so the component only
    // re-renders when one of the listed values actually changes.
    const {
        ownTracks, sharedTracks, isLoading, isSharedTracksLoading, isSettingsLoaded,
        selectedTrackId, playingTrackId,
        ownGenres, sharedGenres, ownTags, sharedTags,
        categoryOrder, featuredCategories, sharedCategoryOrder, sharedFeaturedCategories,
        sortableCategories, ownPlaylists, sharedPlaylists,
        activePlaylistId, sharedLibraries, activeLibrarySource, playlistAllSources,
    } = useMusicStore(
        useShallow(s => ({
            ownTracks: s.tracks,
            sharedTracks: s.sharedTracks,
            isLoading: s.isLoading,
            isSharedTracksLoading: s.isSharedTracksLoading,
            isSettingsLoaded: s.isSettingsLoaded,
            selectedTrackId: s.selectedTrackId,
            playingTrackId: s.playingTrackId,
            ownGenres: s.genres,
            sharedGenres: s.sharedGenres,
            ownTags: s.tags,
            sharedTags: s.sharedTags,
            categoryOrder: s.categoryOrder,
            featuredCategories: s.featuredCategories,
            sharedCategoryOrder: s.sharedCategoryOrder,
            sharedFeaturedCategories: s.sharedFeaturedCategories,
            sortableCategories: s.sortableCategories,
            ownPlaylists: s.musicPlaylists,
            sharedPlaylists: s.sharedPlaylists,
            activePlaylistId: s.activePlaylistId,
            sharedLibraries: s.sharedLibraries,
            activeLibrarySource: s.activeLibrarySource,
            playlistAllSources: s.playlistAllSources,
        }))
    );

    // ── Music store: stable actions — getState() avoids any subscription ────
    // Actions in Zustand are created once and never reassigned, so their
    // references are permanently stable. No subscription needed.
    const {
        subscribe, loadSettings, setSelectedTrackId, setActivePlaylist,
        setActiveLibrarySource, subscribeSharedLibraries, setPlaylistAllSources,
        subscribeSharedLibraryTracks, reorderPlaylistTracks,
    } = useMusicStore.getState();

    // ── Filter store: reactive state — single shallow subscription ──────────
    const { musicSortBy: librarySortBy, musicSortAsc: librarySortAsc, genreFilters, tagFilters, bpmFilter, playlistMusicSorts } = useFilterStore(
        useShallow(s => ({
            musicSortBy: s.musicSortBy,
            musicSortAsc: s.musicSortAsc,
            genreFilters: s.musicGenreFilters,
            tagFilters: s.musicTagFilters,
            bpmFilter: s.musicBpmFilter,
            playlistMusicSorts: s.playlistMusicSorts,
        }))
    );

    // ── Filter store: stable actions ────────────────────────────────────────
    const {
        setMusicSortBy: setLibrarySortBy, setMusicSortAsc: setLibrarySortAsc,
        toggleMusicGenreFilter, toggleMusicTagFilter, setMusicBpmFilter, clearMusicFilters,
        setPlaylistMusicSort,
    } = useFilterStore.getState();

    // ── Loading state ───────────────────────────────────────────────────────
    const showSkeleton = isLoading || !isSettingsLoaded || (!!activeLibrarySource && isSharedTracksLoading);

    // ── Loading timeout — show an error after 10s instead of eternal skeleton ─
    // Firestore can silently fail (bad network, offline, permission error) leaving
    // isLoading stuck at true. After LOAD_TIMEOUT ms we surface an error so the
    // user knows something went wrong and can retry.
    const LOAD_TIMEOUT_MS = 10_000;
    const [isLoadTimedOut, setIsLoadTimedOut] = useState(false);
    useEffect(() => {
        if (!showSkeleton) {
            setIsLoadTimedOut(false); // reset if loading eventually succeeds
            return;
        }
        const id = setTimeout(() => setIsLoadTimedOut(true), LOAD_TIMEOUT_MS);
        return () => clearTimeout(id);
    }, [showSkeleton]);

    // ── URL → playlist sync ─────────────────────────────────────────────────
    // "Latest ref" pattern: ref is updated in useLayoutEffect (synchronous,
    // fires before any useEffect) so it always reflects the committed value
    // by the time the navigation effect reads it — safe for concurrent React.
    const activeLibrarySourceRef = useRef(activeLibrarySource);
    useLayoutEffect(() => {
        activeLibrarySourceRef.current = activeLibrarySource;
    });

    // useMatch is the typed, router-aware alternative to manual string parsing.
    // If the route shape changes in App.tsx, TypeScript won't catch it here —
    // but at least the parsing logic is centralised in one place (App.tsx).
    const likedMatch = useMatch('/music/liked');
    const playlistMatch = useMatch('/music/playlist/:playlistId');

    useEffect(() => {
        // Derive target playlist ID from the current route.
        const targetId = likedMatch
            ? 'liked'
            : playlistMatch?.params.playlistId ?? null;

        // Use getState() (not reactive) so this effect only fires on URL changes.
        // The sidebar handler calls setActivePlaylist synchronously before navigate(),
        // so getState().activePlaylistId is already correct by the time this runs.
        const currentId = useMusicStore.getState().activePlaylistId;
        if (targetId === currentId) return;

        setActivePlaylist(targetId);
    }, [likedMatch, playlistMatch, setActivePlaylist]);

    // ── Subscriptions ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubscribe = subscribe(userId, channelId);
        loadSettings(userId, channelId);
        return unsubscribe;
    }, [userId, channelId, subscribe, loadSettings]);

    useEffect(() => {
        if (!userId || !channelId) return;
        return subscribeSharedLibraries(userId, channelId);
    }, [userId, channelId, subscribeSharedLibraries]);

    // Derive a stable primitive key from the set of shared library IDs.
    // sharedLibraries is an array — its reference changes on every Firestore
    // snapshot even when the content is identical. Using the array directly
    // as a useEffect dep would cause spurious re-subscriptions (and a brief
    // isSharedTracksLoading flash) on every snapshot. A joined string of
    // sorted IDs changes ONLY when the actual library list changes.
    const sharedLibraryKey = useMemo(
        () => sharedLibraries.map(l => l.ownerChannelId).sort().join(','),
        [sharedLibraries]
    );

    useEffect(() => {
        const unsub = subscribeSharedLibraryTracks();
        return unsub;
    }, [sharedLibraryKey, subscribeSharedLibraryTracks]);

    // ── Derived: read-only state ────────────────────────────────────────────
    // In "All" playlist mode, own tracks are editable; per-track read-only is
    // handled at TrackCard level. Exception: shared playlists are always read-only.
    const sharedPlaylistIds = useMemo(
        () => new Set(sharedPlaylists.map(p => p.id)),
        [sharedPlaylists]
    );
    // ── Grantee permissions ─────────────────────────────────────────────────
    // Replaces the old binary `isReadOnly`. Each consumer checks the specific
    // permission it needs. Own library = full permissions. Shared = per-grant.
    const isSharedView = !playlistAllSources && activeLibrarySource !== null;
    const isSharedPlaylist = !!activePlaylistId && sharedPlaylistIds.has(activePlaylistId);
    const granteePermissions = useMemo<SharePermissions>(() => {
        if (!isSharedView && !isSharedPlaylist) return OWNER_PERMISSIONS;
        return activeLibrarySource?.permissions ?? DEFAULT_SHARE_PERMISSIONS;
    }, [isSharedView, isSharedPlaylist, activeLibrarySource]);

    // Stable object identity — prevents unnecessary re-renders in memoized children.
    const trackSource = useMemo<TrackSource | undefined>(
        () => activeLibrarySource
            ? { ownerUserId: activeLibrarySource.ownerUserId, ownerChannelId: activeLibrarySource.ownerChannelId }
            : undefined,
        [activeLibrarySource]
    );

    // Effective credentials for mutation operations on tracks.
    // When viewing a shared library, mutations must target the owner's Firestore collection.
    const trackOwnerUserId = activeLibrarySource?.ownerUserId ?? userId;
    const trackOwnerChannelId = activeLibrarySource?.ownerChannelId ?? channelId;

    // ── Derived: view-layer source switching ────────────────────────────────
    const tracks = useMemo(() => {
        if (activePlaylistId && playlistAllSources) {
            const ownIds = new Set(ownTracks.map(t => t.id));
            return [...ownTracks, ...sharedTracks.filter(t => !ownIds.has(t.id))];
        }
        return activeLibrarySource ? sharedTracks : ownTracks;
    }, [activePlaylistId, playlistAllSources, activeLibrarySource, ownTracks, sharedTracks]);

    // ── Merged selectors for mixed-mode (All playlist) ────────────────────
    const mergedTags = useMusicStore(selectAllTags);
    const mergedGenres = useMusicStore(selectAllGenres);
    const mergedCategoryOrder = useMusicStore(selectAllCategoryOrder);
    const mergedFeaturedCategories = useMusicStore(selectAllFeaturedCategories);

    // ── Context-aware metadata: shared > mixed > own ─────────────────────
    const genres = useMemo(() => {
        if (activeLibrarySource) return sharedGenres;
        if (playlistAllSources) return mergedGenres;
        return ownGenres;
    }, [activeLibrarySource, playlistAllSources, sharedGenres, mergedGenres, ownGenres]);

    const tags = useMemo(() => {
        if (activeLibrarySource) return sharedTags;
        if (playlistAllSources) return mergedTags;
        return ownTags;
    }, [activeLibrarySource, playlistAllSources, sharedTags, mergedTags, ownTags]);

    const resolvedCategoryOrder = useMemo(() => {
        if (activeLibrarySource) return sharedCategoryOrder;
        if (playlistAllSources) return mergedCategoryOrder;
        return categoryOrder;
    }, [activeLibrarySource, playlistAllSources, sharedCategoryOrder, mergedCategoryOrder, categoryOrder]);

    const resolvedFeaturedCategories = useMemo(() => {
        if (activeLibrarySource) return sharedFeaturedCategories;
        if (playlistAllSources) return mergedFeaturedCategories;
        return featuredCategories;
    }, [activeLibrarySource, playlistAllSources, sharedFeaturedCategories, mergedFeaturedCategories, featuredCategories]);
    // Always merge playlists — active playlist may belong to either source.
    const allPlaylists = useMemo(
        () => [...ownPlaylists, ...sharedPlaylists],
        [ownPlaylists, sharedPlaylists]
    );

    // trackId → channelName for shared tracks displayed in "All" playlist mode.
    const sourceNameMap = useMemo<Record<string, string>>(() => {
        if (!activePlaylistId || !playlistAllSources) return {};
        const playlist = allPlaylists.find(p => p.id === activePlaylistId);
        if (!playlist?.trackSources) return {};
        const channelNameById = new Map(sharedLibraries.map(lib => [lib.ownerChannelId, lib.ownerChannelName]));
        const map: Record<string, string> = {};
        for (const [trackId, src] of Object.entries(playlist.trackSources)) {
            const name = channelNameById.get(src.ownerChannelId);
            if (name) map[trackId] = name;
        }
        return map;
    }, [activePlaylistId, playlistAllSources, allPlaylists, sharedLibraries]);

    // ── Filter / sort / group / queue ───────────────────────────────────────
    // queueContextId identifies this view so the queue isn't overwritten when
    // the user navigates away while a track is playing.
    const queueContextId = activeLibrarySource
        ? `shared:${activeLibrarySource.ownerChannelId}`
        : activePlaylistId
            ? `playlist:${activePlaylistId}`
            : 'library';

    // ── Resolved sort: per-playlist override or library default ─────────
    const playlistSort = activePlaylistId ? playlistMusicSorts[activePlaylistId] : undefined;

    const musicSortBy = playlistSort?.sortBy ?? (activePlaylistId ? DEFAULT_PLAYLIST_SORT_BY : librarySortBy);
    const musicSortAsc = playlistSort?.sortAsc ?? (activePlaylistId ? DEFAULT_PLAYLIST_SORT_ASC : librarySortAsc);

    // Context-aware sort setters: route to playlist-specific or library-level
    const setMusicSortBy = useCallback((sort: string) => {
        if (activePlaylistId) {
            const current = useFilterStore.getState().playlistMusicSorts[activePlaylistId];
            // If current is undefined, fallback to the default playlist sortAsc, NOT the library one
            const currentSortAsc = current?.sortAsc ?? DEFAULT_PLAYLIST_SORT_ASC;
            setPlaylistMusicSort(activePlaylistId, sort, currentSortAsc);
        } else {
            setLibrarySortBy(sort);
        }
    }, [activePlaylistId, setPlaylistMusicSort, setLibrarySortBy]);

    const setMusicSortAsc = useCallback((asc: boolean) => {
        if (activePlaylistId) {
            const current = useFilterStore.getState().playlistMusicSorts[activePlaylistId];
            // If current is undefined, fallback to the default playlist sortBy, NOT the library one
            const currentSortBy = current?.sortBy ?? DEFAULT_PLAYLIST_SORT_BY;
            setPlaylistMusicSort(activePlaylistId, currentSortBy, asc);
        } else {
            setLibrarySortAsc(asc);
        }
    }, [activePlaylistId, setPlaylistMusicSort, setLibrarySortAsc]);

    const { filteredTracks, displayItems, toggleGroup, bpmRange, hasActiveFilters, hasLikedTracks } =
        useTrackDisplay({ tracks, tags, musicPlaylists: allPlaylists, activePlaylistId, queueContextId, sortBy: musicSortBy, sortAsc: musicSortAsc });

    // ── Business logic ──────────────────────────────────────────────────────
    const handleDeleteTrack = useCallback(async (trackId: string) => {
        // Use owner credentials when deleting a shared track
        const effectiveUserId = activeLibrarySource ? activeLibrarySource.ownerUserId : userId;
        const effectiveChannelId = activeLibrarySource ? activeLibrarySource.ownerChannelId : channelId;
        if (!effectiveUserId || !effectiveChannelId) return;

        const track = tracks.find(t => t.id === trackId);
        const remainingSibling = track?.groupId
            ? tracks.filter(t => t.groupId === track.groupId && t.id !== trackId)
            : [];
        const shouldDissolve = remainingSibling.length === 1;

        // Optimistic update: remove track + dissolve group immediately
        useMusicStore.setState((state) => ({
            tracks: state.tracks
                .filter(t => t.id !== trackId)
                .map(t => shouldDissolve && t.id === remainingSibling[0].id
                    ? { ...t, groupId: undefined }
                    : t
                ),
        }));

        try {
            if (shouldDissolve) {
                await TrackService.updateTrack(effectiveUserId, effectiveChannelId, remainingSibling[0].id, { groupId: undefined });
            }
            await deleteTrackFolder(effectiveUserId, effectiveChannelId, trackId);
            await TrackService.deleteTrack(effectiveUserId, effectiveChannelId, trackId);
        } catch (error) {
            // Rollback: restore the deleted track and its group membership
            useMusicStore.setState({ tracks });
            console.error('[Music] Failed to delete track:', error);
        }
    }, [userId, channelId, tracks, activeLibrarySource]);

    // ── Return ──────────────────────────────────────────────────────────────
    return {
        // IDs
        userId,
        channelId,
        trackOwnerUserId,
        trackOwnerChannelId,
        // Loading
        showSkeleton,
        playingTrackId,
        // Track data
        tracks,
        genres,
        tags,
        allPlaylists,
        sourceNameMap,
        filteredTracks,
        displayItems,
        bpmRange,
        // Playlist / library state
        activePlaylistId,
        playlistAllSources,
        granteePermissions,
        isSharedView,
        trackSource,
        sharedPlaylistIds,
        activeLibrarySource,
        sharedLibraries,
        // Selection
        selectedTrackId,
        // Filters
        genreFilters,
        tagFilters,
        bpmFilter,
        musicSortBy,
        musicSortAsc,
        sortableCategories,
        hasActiveFilters,
        hasLikedTracks,
        // Category settings (context-resolved)
        categoryOrder: resolvedCategoryOrder,
        featuredCategories: resolvedFeaturedCategories,
        // Actions
        setSelectedTrackId,
        setActiveLibrarySource,
        setPlaylistAllSources,
        setMusicSortBy,
        setMusicSortAsc,
        toggleMusicGenreFilter,
        toggleMusicTagFilter,
        setMusicBpmFilter,
        clearMusicFilters,
        reorderPlaylistTracks,
        handleDeleteTrack,
        toggleGroup,
        isLoadTimedOut,
    };
}

// =============================================================================
// useMusicPageData — Store selectors, subscriptions, derived state, and
// business logic for the Music page.
//
// Extracted from MusicPage.tsx to keep the page component focused on rendering.
// All effects (track subscriptions, URL sync) live here so the page stays clean.
// =============================================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useMusicStore } from '../../../core/stores/musicStore';
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
        setActiveLibrarySource, loadSharedLibraries, setPlaylistAllSources,
        subscribeSharedLibraryTracks, reorderPlaylistTracks,
    } = useMusicStore.getState();

    // ── Filter store: reactive state — single shallow subscription ──────────
    const { musicSortBy, musicSortAsc, genreFilters, tagFilters, bpmFilter } = useFilterStore(
        useShallow(s => ({
            musicSortBy: s.musicSortBy,
            musicSortAsc: s.musicSortAsc,
            genreFilters: s.musicGenreFilters,
            tagFilters: s.musicTagFilters,
            bpmFilter: s.musicBpmFilter,
        }))
    );

    // ── Filter store: stable actions ────────────────────────────────────────
    const {
        setMusicSortBy, setMusicSortAsc,
        toggleMusicGenreFilter, toggleMusicTagFilter, setMusicBpmFilter, clearMusicFilters,
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
        if (likedMatch) {
            setActivePlaylist('liked');
            setPlaylistAllSources(true);
        } else if (playlistMatch) {
            const id = playlistMatch.params.playlistId;
            if (id) {
                setActivePlaylist(id);
                // Sidebar sets activeLibrarySource synchronously before navigate(),
                // so the ref already reflects the new value by the time this fires.
                if (!activeLibrarySourceRef.current) {
                    setPlaylistAllSources(true);
                }
            }
        } else {
            setActivePlaylist(null);
            setPlaylistAllSources(false);
        }
    }, [likedMatch, playlistMatch, setActivePlaylist, setPlaylistAllSources]);

    // ── Subscriptions ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubscribe = subscribe(userId, channelId);
        loadSettings(userId, channelId);
        return unsubscribe;
    }, [userId, channelId, subscribe, loadSettings]);

    useEffect(() => {
        if (!userId || !channelId) return;
        loadSharedLibraries(userId, channelId);
    }, [userId, channelId, loadSharedLibraries]);

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
    const isReadOnly = (!playlistAllSources && activeLibrarySource !== null)
        || (!!activePlaylistId && sharedPlaylistIds.has(activePlaylistId));

    // Stable object identity — prevents unnecessary re-renders in memoized children.
    const trackSource = useMemo<TrackSource | undefined>(
        () => activeLibrarySource
            ? { ownerUserId: activeLibrarySource.ownerUserId, ownerChannelId: activeLibrarySource.ownerChannelId }
            : undefined,
        [activeLibrarySource]
    );

    // ── Derived: view-layer source switching ────────────────────────────────
    const tracks = useMemo(() => {
        if (activePlaylistId && playlistAllSources) {
            const ownIds = new Set(ownTracks.map(t => t.id));
            return [...ownTracks, ...sharedTracks.filter(t => !ownIds.has(t.id))];
        }
        return activeLibrarySource ? sharedTracks : ownTracks;
    }, [activePlaylistId, playlistAllSources, activeLibrarySource, ownTracks, sharedTracks]);

    const genres = useMemo(
        () => activeLibrarySource ? sharedGenres : ownGenres,
        [activeLibrarySource, sharedGenres, ownGenres]
    );
    const tags = useMemo(
        () => activeLibrarySource ? sharedTags : ownTags,
        [activeLibrarySource, sharedTags, ownTags]
    );
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
    const { filteredTracks, displayItems, bpmRange, hasActiveFilters, hasLikedTracks } =
        useTrackDisplay({ tracks, tags, musicPlaylists: allPlaylists, activePlaylistId });

    // ── Business logic ──────────────────────────────────────────────────────
    const handleDeleteTrack = useCallback(async (trackId: string) => {
        if (!userId || !channelId) return;
        try {
            // Auto-cleanup: if this was in a 2-member group, dissolve the group.
            const track = tracks.find(t => t.id === trackId);
            if (track?.groupId) {
                const remaining = tracks.filter(t => t.groupId === track.groupId && t.id !== trackId);
                if (remaining.length === 1) {
                    await TrackService.updateTrack(userId, channelId, remaining[0].id, { groupId: undefined });
                }
            }
            await deleteTrackFolder(userId, channelId, trackId);
            await TrackService.deleteTrack(userId, channelId, trackId);
        } catch (error) {
            console.error('[Music] Failed to delete track:', error);
        }
    }, [userId, channelId, tracks]);

    // ── Return ──────────────────────────────────────────────────────────────
    return {
        // IDs
        userId,
        channelId,
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
        isReadOnly,
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
        // Category settings
        categoryOrder,
        featuredCategories,
        sharedCategoryOrder,
        sharedFeaturedCategories,
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
        isLoadTimedOut,
    };
}

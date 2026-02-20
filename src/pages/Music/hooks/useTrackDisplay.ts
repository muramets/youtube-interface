// =============================================================================
// useTrackDisplay — Filter, sort, group, and queue-build logic
// =============================================================================
//
// Pure data transformation: takes tracks + filter/sort config → produces
// filteredTracks, displayItems (with version grouping), and playback queue.
// No JSX — testable in isolation.
// =============================================================================

import { useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useFilterStore } from '../../../core/stores/filterStore';
import { sortByGroupOrder } from '../../../core/utils/trackUtils';
import type { Track, MusicTag } from '../../../core/types/track';
import type { MusicPlaylist } from '../../../core/types/musicPlaylist';

// ── DisplayItem type (also consumed by PlaylistSortableList) ────────────────
export type DisplayItem =
    | { type: 'single'; track: Track }
    | { type: 'group'; groupId: string; tracks: Track[] }
    | { type: 'sibling'; track: Track; siblingColor: string; siblingPosition: 'first' | 'middle' | 'last' };

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic HSL color from a string hash */
function groupIdToColor(gid: string): string {
    let hash = 0;
    for (let i = 0; i < gid.length; i++) {
        hash = gid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = ((hash % 360) + 360) % 360;
    return `hsl(${hue}, 65%, 55%)`;
}

// ── Hook ────────────────────────────────────────────────────────────────────
interface UseTrackDisplayParams {
    tracks: Track[];
    tags: MusicTag[];
    musicPlaylists: MusicPlaylist[];
    activePlaylistId: string | null;
}

interface UseTrackDisplayResult {
    filteredTracks: Track[];
    displayItems: DisplayItem[];
    bpmRange: { min: number; max: number };
    hasActiveFilters: boolean;
    hasLikedTracks: boolean;
}

export function useTrackDisplay({
    tracks,
    tags,
    musicPlaylists,
    activePlaylistId,
}: UseTrackDisplayParams): UseTrackDisplayResult {
    // ── Store selectors ──────────────────────────────────────────────────
    const searchQuery = useMusicStore((s) => s.searchQuery);

    const { musicSortBy, musicSortAsc,
        musicGenreFilters: genreFilters,
        musicTagFilters: tagFilters,
        musicBpmFilter: bpmFilter,
    } = useFilterStore(
        useShallow((s) => ({
            musicSortBy: s.musicSortBy,
            musicSortAsc: s.musicSortAsc,
            musicGenreFilters: s.musicGenreFilters,
            musicTagFilters: s.musicTagFilters,
            musicBpmFilter: s.musicBpmFilter,
        }))
    );

    // ── Filtered & sorted tracks ─────────────────────────────────────────
    const filteredTracks = useMemo(() => {
        let result = [...tracks];

        // Playlist / Liked pre-filter
        if (activePlaylistId === 'liked') {
            result = result.filter(t => t.liked);
        } else if (activePlaylistId) {
            const playlist = musicPlaylists.find(p => p.id === activePlaylistId);
            if (playlist) {
                const trackIdSet = new Set(playlist.trackIds);
                result = result.filter(t => trackIdSet.has(t.id));
            }
        }

        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    t.artist?.toLowerCase().includes(q) ||
                    t.tags.some((tag) => tag.toLowerCase().includes(q))
            );
        }

        // Genre filter (multi-select: track must match at least one selected genre)
        if (genreFilters.length > 0) {
            result = result.filter((t) => genreFilters.includes(t.genre ?? ''));
        }

        // Tag filters (track.tags and tagFilters are both ID-based)
        if (tagFilters.length > 0) {
            result = result.filter((t) =>
                tagFilters.every((tagId) => t.tags.includes(tagId))
            );
        }

        // BPM filter
        if (bpmFilter) {
            result = result.filter((t) => {
                if (t.bpm == null) return false;
                return t.bpm >= bpmFilter[0] && t.bpm <= bpmFilter[1];
            });
        }

        // Sort
        if (musicSortBy.startsWith('tag:')) {
            const categoryName = musicSortBy.slice(4);
            const categoryTags = tags.filter(t => (t.category || 'Uncategorized') === categoryName);
            result.sort((a, b) => {
                let idxA = Infinity;
                let idxB = Infinity;
                for (let i = 0; i < categoryTags.length; i++) {
                    if (a.tags.includes(categoryTags[i].id) && i < idxA) idxA = i;
                    if (b.tags.includes(categoryTags[i].id) && i < idxB) idxB = i;
                }
                const dir = musicSortAsc ? 1 : -1;
                if (idxA !== idxB) return (idxA - idxB) * dir;
                return b.createdAt - a.createdAt;
            });
        } else if (musicSortBy === 'liked') {
            result.sort((a, b) => {
                const aLiked = a.liked ? 1 : 0;
                const bLiked = b.liked ? 1 : 0;
                if (aLiked !== bLiked) {
                    return musicSortAsc ? bLiked - aLiked : aLiked - bLiked;
                }
                return b.createdAt - a.createdAt;
            });
        } else if (musicSortBy === 'playlistOrder' && activePlaylistId && activePlaylistId !== 'liked') {
            const playlist = musicPlaylists.find(p => p.id === activePlaylistId);
            if (playlist) {
                result.sort((a, b) => playlist.trackIds.indexOf(a.id) - playlist.trackIds.indexOf(b.id));
            }
        } else if (activePlaylistId && activePlaylistId !== 'liked') {
            const playlist = musicPlaylists.find(p => p.id === activePlaylistId);
            if (playlist) {
                const addedAt = playlist.trackAddedAt || {};
                const dir = musicSortAsc ? 1 : -1;
                result.sort((a, b) => {
                    const timeA = addedAt[a.id] ?? playlist.trackIds.indexOf(a.id);
                    const timeB = addedAt[b.id] ?? playlist.trackIds.indexOf(b.id);
                    return (timeA - timeB) * dir;
                });
            }
        } else {
            const dir = musicSortAsc ? 1 : -1;
            result.sort((a, b) => (a.createdAt - b.createdAt) * dir);
        }

        return result;
    }, [tracks, searchQuery, genreFilters, tagFilters, bpmFilter, activePlaylistId, musicPlaylists, musicSortBy, musicSortAsc, tags]);

    // ── BPM range from all tracks ────────────────────────────────────────
    const bpmRange = useMemo(() => {
        const bpms = tracks.map(t => t.bpm).filter((b): b is number => b != null);
        if (bpms.length === 0) return { min: 60, max: 180 };
        return { min: Math.min(...bpms), max: Math.max(...bpms) };
    }, [tracks]);

    const hasActiveFilters = !!(searchQuery || genreFilters.length > 0 || tagFilters.length > 0 || bpmFilter);
    const hasLikedTracks = useMemo(() => tracks.some(t => t.liked), [tracks]);

    // ── Version grouping → displayItems ──────────────────────────────────
    const displayItems: DisplayItem[] = useMemo(() => {
        const items: DisplayItem[] = [];
        const seenGroupIds = new Set<string>();

        for (const track of filteredTracks) {
            if (track.groupId) {
                if (seenGroupIds.has(track.groupId)) continue;
                seenGroupIds.add(track.groupId);
                const groupTracks = filteredTracks.filter((t) => t.groupId === track.groupId);
                if (groupTracks.length >= 2) {
                    const allGroupTracks = tracks.filter((t) => t.groupId === track.groupId);
                    const parentTrack = [...allGroupTracks].sort(sortByGroupOrder)[0];
                    const parentInPlaylist = groupTracks.some((t) => t.id === parentTrack?.id);

                    if (parentInPlaylist || !activePlaylistId) {
                        items.push({ type: 'group', groupId: track.groupId, tracks: groupTracks });
                    } else {
                        const color = groupIdToColor(track.groupId);
                        for (let i = 0; i < groupTracks.length; i++) {
                            const position: 'first' | 'middle' | 'last' =
                                i === 0 ? 'first' : i === groupTracks.length - 1 ? 'last' : 'middle';
                            items.push({ type: 'sibling', track: groupTracks[i], siblingColor: color, siblingPosition: position });
                        }
                    }
                } else {
                    items.push({ type: 'single', track: groupTracks[0] });
                }
            } else {
                items.push({ type: 'single', track });
            }
        }
        return items;
    }, [filteredTracks, tracks, activePlaylistId]);

    // ── Playback queue: flattened visual order ───────────────────────────
    const setPlaybackQueue = useMusicStore((s) => s.setPlaybackQueue);
    const playingTrackIdForQueue = useMusicStore((s) => s.playingTrackId);

    useEffect(() => {
        const queue: string[] = [];
        for (const item of displayItems) {
            if (item.type === 'single' || item.type === 'sibling') {
                queue.push(item.track.id);
            } else {
                const sorted = [...item.tracks].sort(sortByGroupOrder);
                for (const t of sorted) {
                    queue.push(t.id);
                }
            }
        }

        // If a track is playing and it's not in the new queue (user switched
        // to a different library view), keep the existing queue so next/prev
        // still work within the original playback context.
        if (playingTrackIdForQueue && !queue.includes(playingTrackIdForQueue)) {
            return;
        }

        setPlaybackQueue(queue);
    }, [displayItems, setPlaybackQueue, playingTrackIdForQueue]);

    // ── Virtualizer cache invalidation ───────────────────────────────────
    // Moved here so consumers get displayItems.length changes tracked.
    // The virtualizer.measure() call stays in MusicPage (it needs the
    // virtualizer instance), but the count tracking ref is co-located here.

    return {
        filteredTracks,
        displayItems,
        bpmRange,
        hasActiveFilters,
        hasLikedTracks,
    };
}

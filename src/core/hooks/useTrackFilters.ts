// =============================================================================
// useTrackFilters: Shared filter logic for track browsing
// =============================================================================
// Used by MusicPage and TrackBrowser independently.
// Each instance manages its own filter selections (useState),
// but reads shared metadata (genres, tags, categories) from musicStore.
// =============================================================================

import { useState, useMemo, useCallback } from 'react';
import { useMusicStore } from '../stores/musicStore';
import type { Track, MusicGenre, MusicTag } from '../types/track';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TrackFilterState {
    genreFilter: string | null;
    tagFilters: string[];
    bpmFilter: [number, number] | null;
}

export interface TrackFilterActions {
    setGenreFilter: (genre: string | null) => void;
    toggleTagFilter: (tagId: string) => void;
    setBpmFilter: (range: [number, number] | null) => void;
    clearFilters: () => void;
}

export interface TrackFilterMeta {
    genres: MusicGenre[];
    tags: MusicTag[];
    categoryOrder: string[];
    featuredCategories: string[];
    bpmRange: { min: number; max: number };
    hasActiveFilters: boolean;
}

export interface UseTrackFiltersReturn extends TrackFilterState, TrackFilterActions, TrackFilterMeta {
    filteredTracks: Track[];
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------

/**
 * Independent filter state + shared filtering pipeline.
 *
 * @param tracks    - Source tracks to filter
 * @param searchQuery - Text search query (title, artist, tags)
 */
export function useTrackFilters(
    tracks: Track[],
    searchQuery: string,
): UseTrackFiltersReturn {
    // ── Independent filter state (per-instance) ──────────────────────────
    const [genreFilter, setGenreFilter] = useState<string | null>(null);
    const [tagFilters, setTagFilters] = useState<string[]>([]);
    const [bpmFilter, setBpmFilter] = useState<[number, number] | null>(null);

    // ── Shared metadata (read-only from musicStore) ──────────────────────
    const genres = useMusicStore((s) => s.genres);
    const tags = useMusicStore((s) => s.tags);
    const categoryOrder = useMusicStore((s) => s.categoryOrder);
    const featuredCategories = useMusicStore((s) => s.featuredCategories);

    // ── Actions ──────────────────────────────────────────────────────────
    const toggleTagFilter = useCallback((tagId: string) => {
        setTagFilters((prev) =>
            prev.includes(tagId)
                ? prev.filter((t) => t !== tagId)
                : [...prev, tagId]
        );
    }, []);

    const clearFilters = useCallback(() => {
        setGenreFilter(null);
        setTagFilters([]);
        setBpmFilter(null);
    }, []);

    // ── Derived values ───────────────────────────────────────────────────
    const hasActiveFilters = !!(searchQuery || genreFilter || tagFilters.length > 0 || bpmFilter);

    const bpmRange = useMemo(() => {
        const bpms = tracks.map((t) => t.bpm).filter((b): b is number => b != null);
        if (bpms.length === 0) return { min: 60, max: 180 };
        return { min: Math.min(...bpms), max: Math.max(...bpms) };
    }, [tracks]);

    // ── Filter pipeline: search → genre → tags → BPM ────────────────────
    const filteredTracks = useMemo(() => {
        let result = tracks;

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

        // Genre
        if (genreFilter) {
            result = result.filter((t) => t.genre === genreFilter);
        }

        // Tags (AND logic — all selected tags must be present)
        if (tagFilters.length > 0) {
            result = result.filter((t) =>
                tagFilters.every((tagId) => t.tags.includes(tagId))
            );
        }

        // BPM range
        if (bpmFilter) {
            result = result.filter((t) => {
                if (t.bpm == null) return false;
                return t.bpm >= bpmFilter[0] && t.bpm <= bpmFilter[1];
            });
        }

        return result;
    }, [tracks, searchQuery, genreFilter, tagFilters, bpmFilter]);

    return {
        // State
        genreFilter,
        tagFilters,
        bpmFilter,
        // Actions
        setGenreFilter,
        toggleTagFilter,
        setBpmFilter,
        clearFilters,
        // Meta
        genres,
        tags,
        categoryOrder,
        featuredCategories,
        bpmRange,
        hasActiveFilters,
        // Filtered result
        filteredTracks,
    };
}

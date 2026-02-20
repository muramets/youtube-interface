// =============================================================================
// TRACK UTILITIES: Shared helpers for track-related logic
// =============================================================================

import type { Track } from '../types/track';

/**
 * Default accent color used when a track has no genre or the genre has
 * no assigned color.  Indigo-500 from the design system palette.
 */
export const DEFAULT_ACCENT_COLOR = '#6366F1';

/**
 * Returns the best available variant for a track.
 * Prefers vocal when present, falls back to instrumental.
 */
export function getDefaultVariant(track: Track): 'vocal' | 'instrumental' {
    return track.vocalUrl ? 'vocal' : 'instrumental';
}

/**
 * Comparator for sorting version-grouped tracks.
 * Primary key: groupOrder (explicit position set by user).
 * Secondary key: createdAt descending (newest first, as a stable tiebreaker).
 */
export function sortByGroupOrder(a: Track, b: Track): number {
    if (a.groupOrder !== undefined && b.groupOrder !== undefined) {
        return a.groupOrder - b.groupOrder;
    }
    return b.createdAt - a.createdAt;
}


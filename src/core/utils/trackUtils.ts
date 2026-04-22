// =============================================================================
// TRACK UTILITIES: Shared helpers for track-related logic
// =============================================================================

import type { Track } from '../types/music/track';
import type { SharedLibraryEntry, SharePermissions } from '../types/music/musicSharing';
import { DEFAULT_SHARE_PERMISSIONS, OWNER_PERMISSIONS } from '../types/music/musicSharing';

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

/**
 * Resolve the effective permissions for a track given the current viewer.
 *
 * Rule hierarchy (first match wins):
 *   1. Same user across channels → OWNER_PERMISSIONS. Multi-channel access to
 *      your own library must always feel seamless — if you own it, you can edit
 *      it, regardless of which of your channels you're currently viewing from.
 *   2. Different user with a share grant → grant's permissions.
 *   3. Different user, no grant → DEFAULT_SHARE_PERMISSIONS (all-false).
 */
export function resolveTrackPermissions(
    track: Pick<Track, 'ownerUserId' | 'ownerChannelId'>,
    currentUserId: string,
    sharedLibraries: SharedLibraryEntry[],
): SharePermissions {
    if (track.ownerUserId === currentUserId) return OWNER_PERMISSIONS;
    const grant = sharedLibraries.find(
        (lib) =>
            lib.ownerUserId === track.ownerUserId &&
            lib.ownerChannelId === track.ownerChannelId,
    );
    return grant?.permissions ?? DEFAULT_SHARE_PERMISSIONS;
}


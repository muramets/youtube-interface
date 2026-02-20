// =============================================================================
// MUSIC PAGE LAYOUT CONSTANTS
// Shared between MusicPage (virtualizer estimateSize) and any component that
// needs to reason about row heights (e.g. TrackGroupCard, PlaylistSortableList).
//
// IMPORTANT: if TrackCard or TrackGroupCard DOM structure changes, update here.
// Both constants are verified by debug logs during development:
//   TRACK_ROW_HEIGHT: py-4 (32px) + h-14 cover (56px) = 88px
//   GROUP_ROW_OVERHEAD: confirmed via logs (360=4×88+8, 272=3×88+8, 184=2×88+8)
// =============================================================================

/** Height of a single TrackCard row in the virtualizer, in px. */
export const TRACK_ROW_HEIGHT = 88;

/**
 * Additional px added to the group card height beyond N×TRACK_ROW_HEIGHT.
 * Accounts for the group container's internal padding/border.
 * Formula: expandedGroupHeight = tracks.length × TRACK_ROW_HEIGHT + GROUP_ROW_OVERHEAD
 *
 * Used in `estimateSize` so virtualizer.measure() can return correct row
 * positions even before ResizeObserver fires (prevents 270ms stale-render window).
 */
export const GROUP_ROW_OVERHEAD = 8;

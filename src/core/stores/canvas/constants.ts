// =============================================================================
// Canvas Constants — single source of truth for layout & persistence values
// =============================================================================

/** Default node width when not measured */
export const NODE_WIDTH = 240;

/** Default node height fallback when ResizeObserver hasn't measured yet */
export const NODE_HEIGHT_FALLBACK = 180;

/** Gap between stacked child nodes */
export const PLACEMENT_GAP = 14;

/** Estimated height for compact traffic-source nodes */
export const TRAFFIC_NODE_HEIGHT_ESTIMATE = 100;

/** Estimated height for a new sticky note (before ResizeObserver measures) */
export const STICKY_NOTE_HEIGHT_ESTIMATE = 160;

/** Debounce delay for Firestore save (ms) */
export const SAVE_DEBOUNCE_MS = 1500;

/** Default traffic-source node width */
export const TRAFFIC_NODE_WIDTH = 360;

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

/** Estimated height for a new sticky note (matches traffic-source node) */
export const STICKY_NOTE_HEIGHT_ESTIMATE = 100;

/** Debounce delay for Firestore save (ms) */
export const SAVE_DEBOUNCE_MS = 1500;

/** Default image node width */
export const IMAGE_NODE_WIDTH = 400;

/** Default traffic-source node width */
export const TRAFFIC_NODE_WIDTH = 360;

/** Maximum undo history levels per page */
export const MAX_UNDO_LEVELS = 50;

/** Padding inside snapshot frame border */
export const FRAME_PADDING = 12;

/** Height reserved for frame title bar */
export const FRAME_TITLE_HEIGHT = 32;

/** Gap between adjacent snapshot frames */
export const FRAME_GAP = 20;

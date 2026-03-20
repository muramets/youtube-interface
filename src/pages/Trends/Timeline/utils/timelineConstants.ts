export const TOOLTIP_SHOW_DELAY_MS = 500;
export const HOVER_DEBOUNCE_MS = 200;
export const ELEVATION_TIMEOUT_MS = 200;
export const ANIMATION_DURATION_MS = 200;
export const PAN_COOLDOWN_MS = 200;

export const DOT_HIT_BUFFER_PX = 16;
export const MIN_INTERACTION_SIZE_PX = 20;

/** Below this scale — always dots (thumbnails too small to be useful) */
export const LOD_MIN_THUMBNAIL_SCALE = 0.05;
/** Above this scale — always thumbnails (regardless of count) + view labels */
export const LOD_ALWAYS_THUMBNAIL_SCALE = 0.25;
/** Between MIN and ALWAYS — show thumbnails only if visible count ≤ this */
export const LOD_MAX_VISIBLE_THUMBNAILS = 80;
/** Scale at which view count labels appear on thumbnails */
export const LOD_SHOW_LABEL = 0.25;

/**
 * Thumbnail counter-scaling: floor + proportional growth + ceiling.
 *
 * Growth zone (5%–17%): thumbnails grow proportionally with zoom.
 *   Max factor 10 = floor(48px) / (baseSize(96) × minScale(0.05))
 *
 * Ceiling zone (17%+): thumbnails capped at ~1.67× baseSize (160px for top-1%).
 *   Factor decreases as 1.67/scale, keeping visual size constant at ceiling.
 *
 * Natural zone (167%+): factor = 1, thumbnails at natural world size.
 */
export const THUMB_COUNTER_SCALE_MAX = 10;
export const THUMB_COUNTER_SCALE_CEILING = 5 / 3;

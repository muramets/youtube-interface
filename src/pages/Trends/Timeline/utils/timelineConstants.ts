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

/** Thumbnail base sizing (SSOT — imported by trendLayoutUtils, useAxisTicks, useTimelineTransform) */
export const BASE_THUMBNAIL_SIZE = 200;
export const MIN_THUMBNAIL_SIZE = 40;
export const THUMBNAIL_ASPECT_RATIO = 16 / 9;

/** Max dot size from percentile styles (Top 1% = 96px) */
export const DOT_MAX_SIZE = 96;
/** Dot counter-scale ceiling (matches VideoDot.tsx CSS: max(1, 0.20/scale)) */
export const DOT_COUNTER_SCALE_CEILING = 0.20;

/**
 * Computes visual overflow of a thumbnail in screen pixels at a given viewport scale.
 * Counter-scaling makes thumbnails appear larger than their world-space allocation.
 * Returns the half-size that extends beyond the thumbnail's center point.
 */
export function computeThumbScreenOverflow(baseSize: number, scale: number): { x: number; y: number } {
    const cs = Math.min(THUMB_COUNTER_SCALE_MAX, THUMB_COUNTER_SCALE_CEILING / Math.max(0.001, scale));
    return {
        x: (baseSize / 2) * cs * scale,
        y: (baseSize / THUMBNAIL_ASPECT_RATIO / 2) * cs * scale
    };
}

/**
 * LOD-aware overflow: uses thumbnail formula when thumbnails are shown,
 * dot formula when dots are shown. In the transition zone (0.05–0.25),
 * uses videoCount to predict the display mode; defaults to thumbnail (conservative).
 */
export function computeEffectiveOverflow(
    scale: number,
    videoCount?: number
): { x: number; yTop: number; yBottom: number } {
    const definitelyDots = scale < LOD_MIN_THUMBNAIL_SCALE;
    const definitelyThumbs = scale >= LOD_ALWAYS_THUMBNAIL_SCALE;
    const showThumbnails = definitelyThumbs ||
        (!definitelyDots && (videoCount === undefined || videoCount <= LOD_MAX_VISIBLE_THUMBNAILS));

    if (!showThumbnails) {
        // Dot mode: counter-scale = max(1, 0.20 / scale)
        const dotCs = Math.max(1, DOT_COUNTER_SCALE_CEILING / Math.max(0.001, scale));
        const dotHalf = (DOT_MAX_SIZE / 2) * dotCs * scale;
        return { x: dotHalf, yTop: dotHalf, yBottom: dotHalf };
    }

    // Thumbnail mode
    const maxOv = computeThumbScreenOverflow(BASE_THUMBNAIL_SIZE, scale);
    const minOv = computeThumbScreenOverflow(MIN_THUMBNAIL_SIZE, scale);
    return { x: maxOv.x, yTop: maxOv.y, yBottom: minOv.y };
}

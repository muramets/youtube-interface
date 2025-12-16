import type { MonthLayout, TimelineStats } from '../../../../types/trends';

/**
 * Finds the timestamp corresponding to a normalized X position (0-1) in the world.
 */
export const getTimeAtWorldX = (
    normX: number,
    monthLayouts: MonthLayout[],
    stats: TimelineStats
): number => {
    // 1. Clamp
    const clampedX = Math.max(0, Math.min(1, normX));

    // 2. Find Layout
    const layout = monthLayouts.find(l => clampedX >= l.startX && clampedX <= l.endX);

    if (layout) {
        // Interpolate within month
        const localProgress = (clampedX - layout.startX) / layout.width;
        const duration = layout.endTs - layout.startTs;
        return layout.startTs + localProgress * duration;
    }

    // 3. Fallback (Linear global)
    // Only happens if layouts are missing or gaps exist (shouldn't happen with full cover)
    const totalDuration = stats.maxDate - stats.minDate;
    return stats.minDate + clampedX * totalDuration;
};

/**
 * Finds the normalized X position (0-1) for a given timestamp.
 */
export const getWorldXAtTime = (
    timestamp: number,
    monthLayouts: MonthLayout[],
    stats: TimelineStats
): number => {
    // 1. Find Layout
    const layout = monthLayouts.find(l => timestamp >= l.startTs && timestamp <= l.endTs);

    if (layout) {
        // Interpolate within month
        const duration = layout.endTs - layout.startTs;
        const localProgress = (timestamp - layout.startTs) / duration;
        return layout.startX + localProgress * layout.width;
    }

    const totalDuration = stats.maxDate - stats.minDate;
    const globalProgress = (timestamp - stats.minDate) / totalDuration;
    return Math.max(0, Math.min(1, globalProgress));
};

// Transform Types
export interface Transform {
    scale: number;
    offsetX: number;
    offsetY: number;
}

export interface PreservedTransformParams {
    currentTransform: Transform;
    viewportSize: { width: number; height: number };
    headerHeight: number;
    worldDimensions: {
        prevWidth: number;
        currWidth: number;
        prevHeight: number;
        currHeight: number;
    };
    anchor?: {
        time: number;
        yNorm?: number; // Optional vertical anchor
        screenX?: number; // Visual locking point
        screenY?: number;
        monthLayouts: MonthLayout[];
        stats: TimelineStats;
    };
}

/**
 * Calculates a new transform that preserves the relative focal point 
 * when the world dimensions change (re-layout).
 * 
 * Supports two modes:
 * 1. Time Anchoring: keeps a specific timestamp centered (if anchor provided).
 * 2. Relative Ratio: keeps the visual center relative to world center (if no anchor).
 */
export const calculatePreservedTransform = ({
    currentTransform,
    viewportSize,
    headerHeight,
    worldDimensions,
    anchor
}: PreservedTransformParams): Transform => {
    const { prevWidth, currWidth, prevHeight, currHeight } = worldDimensions;
    const { scale, offsetX, offsetY } = currentTransform;

    const wChanged = Math.abs(currWidth - prevWidth) >= 1;
    const hChanged = Math.abs(currHeight - prevHeight) >= 1;

    // Viewport Center (Default anchor point)
    const viewportCenterX = viewportSize.width / 2;
    const availableHeight = viewportSize.height - headerHeight;
    const viewportCenterY = headerHeight + (availableHeight / 2);

    let newOffsetX = offsetX;
    let newOffsetY = offsetY;

    // --- X-AXIS CALCULATION ---
    if (anchor) {
        // Mode 1: Anchor specific timestamp
        const { time, monthLayouts, stats, screenX } = anchor;
        const normX = getWorldXAtTime(time, monthLayouts, stats);
        const targetWorldX = normX * currWidth;

        // Anchor Point: Use provided screenX or default to Center
        const anchorScreenX = screenX ?? viewportCenterX;

        // newOffset = AnchorScreen - (WorldPos * Scale)
        newOffsetX = anchorScreenX - (targetWorldX * scale);

    } else {
        // Mode 2: Preserve Relative Position (Ratio)
        const isValidTransition = prevWidth > 1;
        const widthRatio = (wChanged && isValidTransition) ? currWidth / prevWidth : 1.0;

        const distFromCenter = viewportCenterX - offsetX;
        newOffsetX = viewportCenterX - (distFromCenter * widthRatio);
    }

    // --- Y-AXIS CALCULATION ---
    if (anchor && anchor.yNorm !== undefined) {
        // Anchor to specific Y
        const targetWorldY = anchor.yNorm * currHeight;
        const anchorScreenY = anchor.screenY ?? viewportCenterY;

        newOffsetY = anchorScreenY - (targetWorldY * scale);
    } else {
        // Ratio-based preservation
        const isValidYTransition = prevHeight > 1;
        const heightRatio = (hChanged && isValidYTransition) ? currHeight / prevHeight : 1.0;

        const distFromCenterY = viewportCenterY - offsetY;
        newOffsetY = viewportCenterY - (distFromCenterY * heightRatio);
    }

    return {
        scale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
    };
};

import type { VideoPosition } from '../../../../types/trends';

interface SmartAnchorParams {
    videoPositions: VideoPosition[];
    currentTransform: Transform;
    worldWidth: number;
    worldHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    stats: TimelineStats;
}

/**
 * Finds the "Smart Anchor" time.
 * Logic:
 * 1. Filter videos currently visible in the viewport (both X and Y).
 * 2. Score them based on:
 *    - View Count (Higher is better)
 *    - Distance from Center (Closer is better)
 * 3. Return the timestamp of the winner.
 */
export const findSmartAnchorTime = ({
    videoPositions,
    currentTransform,
    worldWidth,
    worldHeight,
    viewportWidth,
    viewportHeight,
    stats
}: SmartAnchorParams): { time: number; yNorm: number; screenX: number; screenY: number } | null => {
    // Safety
    if (currentTransform.scale <= 0) return null;

    const PAD = 50; // Buffer pixels

    // 1. Filter Visible Candidates (must be visible both horizontally AND vertically)
    const candidates = videoPositions.filter(vp => {
        const videoWorldX = vp.xNorm * worldWidth;
        const videoScreenX = (videoWorldX * currentTransform.scale) + currentTransform.offsetX;

        const videoWorldY = vp.yNorm * worldHeight;
        const videoScreenY = (videoWorldY * currentTransform.scale) + currentTransform.offsetY;

        // Check horizontal visibility
        const visibleX = videoScreenX >= -PAD && videoScreenX <= (viewportWidth + PAD);
        // Check vertical visibility
        const visibleY = videoScreenY >= -PAD && videoScreenY <= (viewportHeight + PAD);

        return visibleX && visibleY;
    });

    if (candidates.length > 0) {
        // 2. Score Visible Candidates
        // Formula: Score = ViewScore * ProximityScore (2D)
        const screenCenterX = viewportWidth / 2;
        const screenCenterY = viewportHeight / 2;

        let bestScore = -1;
        let bestCandidate: VideoPosition | null = null;

        candidates.forEach(vp => {
            const videoWorldX = vp.xNorm * worldWidth;
            const videoScreenX = (videoWorldX * currentTransform.scale) + currentTransform.offsetX;

            const videoWorldY = vp.yNorm * worldHeight;
            const videoScreenY = (videoWorldY * currentTransform.scale) + currentTransform.offsetY;

            // 1. Normalized Views
            const viewScore = (vp.video.viewCount / stats.maxViews);

            // 2. Proximity Score (2D - considers both X and Y distance from center)
            const distX = Math.abs(videoScreenX - screenCenterX);
            const distY = Math.abs(videoScreenY - screenCenterY);

            // Normalize distances by viewport dimensions
            const normDistX = distX / (viewportWidth / 2);  // 0 at center, 1 at edge
            const normDistY = distY / (viewportHeight / 2); // 0 at center, 1 at edge

            // Combined 2D distance (Euclidean, capped at sqrt(2) for corners)
            const dist2D = Math.sqrt(normDistX * normDistX + normDistY * normDistY);

            // Decay: 1 / (1 + k * dist)
            // With k=3: center=1.0, edge(0.5)=0.4, corner(~1.41)=0.19
            const proximityScore = 1 / (1 + 3 * dist2D);

            // Combined Score
            const finalScore = viewScore * proximityScore;

            if (finalScore > bestScore) {
                bestScore = finalScore;
                bestCandidate = vp;
            }
        });

        if (bestCandidate) {
            const v = bestCandidate as VideoPosition;
            const worldX = v.xNorm * worldWidth;
            const screenX = (worldX * currentTransform.scale) + currentTransform.offsetX;
            const worldY = v.yNorm * worldHeight;
            const screenY = (worldY * currentTransform.scale) + currentTransform.offsetY;

            return {
                time: v.video.publishedAtTimestamp,
                yNorm: v.yNorm,
                screenX: screenX,
                screenY: screenY
            };
        }
    }

    // 3. Fallback: No visible videos? Find the CLOSEST video to center globally.
    // This prevents "zooming into empty space" if we are near content but slightly off.

    const screenCenterX = viewportWidth / 2;
    let minDist = Number.MAX_VALUE;
    let closestCandidate: VideoPosition | null = null;

    videoPositions.forEach(vp => {
        const videoWorldX = vp.xNorm * worldWidth;
        const videoScreenX = (videoWorldX * currentTransform.scale) + currentTransform.offsetX;
        const dist = Math.abs(videoScreenX - screenCenterX);

        if (dist < minDist) {
            minDist = dist;
            closestCandidate = vp;
        }
    });

    if (closestCandidate) {
        const v = closestCandidate as VideoPosition;
        const worldX = v.xNorm * worldWidth;
        const screenX = (worldX * currentTransform.scale) + currentTransform.offsetX;
        const worldY = v.yNorm * worldHeight;
        const screenY = (worldY * currentTransform.scale) + currentTransform.offsetY;

        return {
            time: v.video.publishedAtTimestamp,
            yNorm: v.yNorm,
            screenX: screenX,
            screenY: screenY
        };
    }

    return null;
};

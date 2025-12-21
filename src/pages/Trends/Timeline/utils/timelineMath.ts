import type { MonthLayout, TimelineStats } from '../../../../core/types/trends';

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
        xNorm?: number; // Direct X position (preferred over time-based calculation)
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
        // Mode 1: Anchor to specific position
        const { time, monthLayouts, stats, screenX } = anchor;

        // Always recalculate position using day-snap (like useTimelinePositions)
        // This ensures correct anchoring when timeLinearity changes
        const d = new Date(time);
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        const layout = monthLayouts.find(l => l.monthKey === monthKey);

        let normX: number;
        if (layout) {
            const dayOfMonth = d.getDate();
            const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            const dayProgress = (dayOfMonth - 0.5) / daysInMonth;
            normX = layout.startX + dayProgress * layout.width;
        } else {
            normX = getWorldXAtTime(time, monthLayouts, stats);
        }

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

/**
 * Calculates the new transform required to zoom into a specific selection rect.
 * Moves the selection center to the viewport center.
 */
export const calculateSelectionZoomTransform = (
    selectionRect: { x: number; y: number; width: number; height: number },
    viewportSize: { width: number; height: number },
    currentTransform: Transform,
    minScale: number,
    maxScale: number = 10
): Transform => {
    const { width: viewportWidth, height: viewportHeight } = viewportSize;

    // Ignore tiny accidental selections
    if (selectionRect.width < 10 || selectionRect.height < 10) return currentTransform;

    // Center of Selection (Viewport Space)
    const selectionCenterX = selectionRect.x + selectionRect.width / 2;
    const selectionCenterY = selectionRect.y + selectionRect.height / 2;

    // Calculate required scale to fit
    // use max scale to ensure content fits entirely (contain)
    const scaleX = viewportWidth / selectionRect.width;
    const scaleY = viewportHeight / selectionRect.height;

    const zoomFactor = Math.min(scaleX, scaleY);

    // Apply constraints
    let targetScale = currentTransform.scale * zoomFactor;
    targetScale = Math.max(minScale, Math.min(maxScale, targetScale));

    // Convert Selection Center to World Space (using CURRENT transform)
    const worldCenterX = (selectionCenterX - currentTransform.offsetX) / currentTransform.scale;
    const worldCenterY = (selectionCenterY - currentTransform.offsetY) / currentTransform.scale;

    // Calculate New Offset (using NEW target scale)
    // ViewportCenter = WorldCenter * TargetScale + NewOffset
    const newOffsetX = (viewportWidth / 2) - (worldCenterX * targetScale);
    const newOffsetY = (viewportHeight / 2) - (worldCenterY * targetScale);

    return {
        scale: targetScale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
    };
};

import type { VideoPosition } from '../../../../core/types/trends';

interface SmartAnchorParams {
    videoPositions: VideoPosition[];
    currentTransform: Transform;
    worldWidth: number;
    worldHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    stats: TimelineStats;
}


export const findSmartAnchorTime = ({
    videoPositions,
    currentTransform,
    worldWidth,
    worldHeight,
    viewportWidth,
    viewportHeight,
    stats
}: SmartAnchorParams): { time: number; xNorm: number; yNorm: number; screenX: number; screenY: number; videoId: string } | null => {
    // Safety
    if (currentTransform.scale <= 0) return null;

    // 1. Filter Visible Candidates
    const candidates = filterVisibleCandidates(videoPositions, currentTransform, worldWidth, worldHeight, viewportWidth, viewportHeight);

    if (candidates.length > 0) {
        // 2. Score Visible Candidates
        const bestCandidate = findBestVisibleCandidate(candidates, currentTransform, worldWidth, worldHeight, viewportWidth, viewportHeight, stats);

        if (bestCandidate) {
            return convertToAnchor(bestCandidate, currentTransform, worldWidth, worldHeight);
        }
    }

    // 3. Fallback to Closest to Center
    const closestCandidate = findClosestToCenterCandidate(videoPositions, currentTransform, worldWidth, viewportWidth);

    if (closestCandidate) {
        return convertToAnchor(closestCandidate, currentTransform, worldWidth, worldHeight);
    }

    return null;
};

// --- Helpers ---

const filterVisibleCandidates = (
    videoPositions: VideoPosition[],
    currentTransform: Transform,
    worldWidth: number,
    worldHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    pad: number = 50
) => {
    return videoPositions.filter(vp => {
        const videoWorldX = vp.xNorm * worldWidth;
        const videoScreenX = (videoWorldX * currentTransform.scale) + currentTransform.offsetX;

        const videoWorldY = vp.yNorm * worldHeight;
        const videoScreenY = (videoWorldY * currentTransform.scale) + currentTransform.offsetY;

        const visibleX = videoScreenX >= -pad && videoScreenX <= (viewportWidth + pad);
        const visibleY = videoScreenY >= -pad && videoScreenY <= (viewportHeight + pad);

        return visibleX && visibleY;
    });
};

const findBestVisibleCandidate = (
    candidates: VideoPosition[],
    currentTransform: Transform,
    worldWidth: number,
    worldHeight: number,
    viewportWidth: number,
    viewportHeight: number,
    stats: TimelineStats
) => {
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

        // 2. Proximity Score (2D)
        const distX = Math.abs(videoScreenX - screenCenterX);
        const distY = Math.abs(videoScreenY - screenCenterY);

        const normDistX = distX / (viewportWidth / 2);
        const normDistY = distY / (viewportHeight / 2);

        const dist2D = Math.sqrt(normDistX * normDistX + normDistY * normDistY);
        const proximityScore = 1 / (1 + 3 * dist2D);

        const finalScore = viewScore * proximityScore;

        if (finalScore > bestScore) {
            bestScore = finalScore;
            bestCandidate = vp;
        }
    });

    return bestCandidate;
};

const findClosestToCenterCandidate = (
    videoPositions: VideoPosition[],
    currentTransform: Transform,
    worldWidth: number,
    viewportWidth: number
) => {
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

    return closestCandidate;
};

const convertToAnchor = (
    v: VideoPosition,
    currentTransform: Transform,
    worldWidth: number,
    worldHeight: number
) => {
    const worldX = v.xNorm * worldWidth;
    const screenX = (worldX * currentTransform.scale) + currentTransform.offsetX;
    const worldY = v.yNorm * worldHeight;
    const screenY = (worldY * currentTransform.scale) + currentTransform.offsetY;

    return {
        time: v.video.publishedAtTimestamp,
        xNorm: v.xNorm,
        yNorm: v.yNorm,
        screenX: screenX,
        screenY: screenY,
        videoId: v.video.id
    };
};

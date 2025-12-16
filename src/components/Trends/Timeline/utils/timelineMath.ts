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

    // Viewport Center
    const viewportCenterX = viewportSize.width / 2;
    const availableHeight = viewportSize.height - headerHeight;
    const viewportCenterY = headerHeight + (availableHeight / 2);

    let newOffsetX = offsetX;
    let newOffsetY = offsetY;

    // --- X-AXIS CALCULATION ---
    if (anchor) {
        // Mode 1: Center specific timestamp
        const { time, monthLayouts, stats } = anchor;
        const normX = getWorldXAtTime(time, monthLayouts, stats);
        // Note: normX * currWidth = WorldX
        const targetWorldX = normX * currWidth;

        // Center the targetWorldX
        newOffsetX = viewportCenterX - (targetWorldX * scale);
    } else {
        // Mode 2: Preserve Relative Position (Ratio)
        // Only apply ratio if valid transition
        const isValidTransition = prevWidth > 1;
        const widthRatio = (wChanged && isValidTransition) ? currWidth / prevWidth : 1.0;

        const distFromCenter = viewportCenterX - offsetX;
        newOffsetX = viewportCenterX - (distFromCenter * widthRatio);
    }

    // --- Y-AXIS CALCULATION (Always Ratio-based) ---
    // We assume Y-axis always wants relative preservation for now
    const isValidYTransition = prevHeight > 1;
    const heightRatio = (hChanged && isValidYTransition) ? currHeight / prevHeight : 1.0;

    const distFromCenterY = viewportCenterY - offsetY;
    newOffsetY = viewportCenterY - (distFromCenterY * heightRatio);

    return {
        scale,
        offsetX: newOffsetX,
        offsetY: newOffsetY
    };
};

import type { MonthLayout } from '../../../../types/trends';

// Define Stats interface locally if not imported, or use 'any' if types are loose, 
// but better to import. For now, we'll infer from usage or use limited interface.
interface Stats {
    minDate: number;
    maxDate: number;
}

/**
 * Finds the timestamp corresponding to a normalized X position (0-1) in the world.
 */
export const getTimeAtWorldX = (
    normX: number,
    monthLayouts: MonthLayout[],
    stats: Stats
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
    stats: Stats
): number => {
    // 1. Find Layout
    const layout = monthLayouts.find(l => timestamp >= l.startTs && timestamp <= l.endTs);

    if (layout) {
        // Interpolate within month
        const duration = layout.endTs - layout.startTs;
        const localProgress = (timestamp - layout.startTs) / duration;
        return layout.startX + localProgress * layout.width;
    }

    // 2. Fallback (Linear global)
    const totalDuration = stats.maxDate - stats.minDate;
    const globalProgress = (timestamp - stats.minDate) / totalDuration;
    return Math.max(0, Math.min(1, globalProgress));
};

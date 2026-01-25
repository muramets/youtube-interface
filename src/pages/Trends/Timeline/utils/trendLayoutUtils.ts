import type { TimelineStats } from '../../../../core/types/trends';

const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;

/**
 * Calculates the Y pixel position for a given view count.
 * Handles Linear/Log/Sqrt scaling, Vertical Spread, and Dynamic World Height.
 */
export const getTrendYPosition = (
    value: number,
    stats: TimelineStats,
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile',
    verticalSpread: number,
    dynamicWorldHeight: number,
    percentileRank: number = 0.5 // Default rank if needed (Average Line usually ignores percentile mode)
): { y: number; baseSize: number } => {
    const { minViews, maxViews } = stats;

    // Safety check for single value or invalid range
    if (Math.abs(maxViews - minViews) < 0.001 && scalingMode !== 'percentile') {
        // Center vertically
        const yNorm = 0.5;
        const sizeRatio = 0.5;

        const effectiveYNorm = 0.5 + (yNorm - 0.5) * verticalSpread;
        const baseSize = MIN_THUMBNAIL_SIZE + sizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);
        const radius = baseSize / 2;
        const verticalBuffer = 12;
        const availableHeight = dynamicWorldHeight - baseSize - 2 * verticalBuffer;

        return {
            y: radius + verticalBuffer + effectiveYNorm * Math.max(0, availableHeight),
            baseSize
        };
    }

    let yNorm = 0.5;
    let sizeRatio = 0.5;

    switch (scalingMode) {
        case 'linear':
            const rangeLinear = maxViews - minViews || 1;
            yNorm = 1 - (value - minViews) / rangeLinear;
            sizeRatio = (value - minViews) / rangeLinear;
            break;
        case 'log':
            const valLog = Math.log(Math.max(1, value));
            const minLog = Math.log(Math.max(1, minViews));
            const rangeLog = Math.log(Math.max(1, maxViews)) - minLog || 1;
            yNorm = 1 - (valLog - minLog) / rangeLog;
            sizeRatio = (valLog - minLog) / rangeLog;
            break;
        case 'sqrt':
            const valSqrt = Math.sqrt(value);
            const minSqrt = Math.sqrt(minViews);
            const rangeSqrt = Math.sqrt(maxViews) - minSqrt || 1;
            yNorm = 1 - (valSqrt - minSqrt) / rangeSqrt;
            sizeRatio = (valSqrt - minSqrt) / rangeSqrt;
            break;
        case 'percentile':
            yNorm = 1 - percentileRank;
            sizeRatio = percentileRank;
            break;
        default:
            yNorm = 0.5;
            sizeRatio = 0.5;
    }

    // Apply Vertical Spread (Squash)
    const effectiveYNorm = 0.5 + (yNorm - 0.5) * verticalSpread;

    // Calculate Base Size (for collision sizing / radius)
    const baseSize = MIN_THUMBNAIL_SIZE + sizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);
    const radius = baseSize / 2;

    // Vertical Buffer
    const verticalBuffer = 12;

    // Dynamic Y Map
    const availableHeight = dynamicWorldHeight - baseSize - 2 * verticalBuffer;

    // Y is from TOP
    const y = radius + verticalBuffer + effectiveYNorm * Math.max(0, availableHeight);

    return { y, baseSize };
};

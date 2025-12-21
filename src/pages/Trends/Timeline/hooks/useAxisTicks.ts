import { useMemo } from 'react';
import type { Transform } from './useTimelineTransform';

// Constants matching useTimelinePositions
const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;

interface UseAxisTicksProps {
    stats: { minViews: number; maxViews: number };
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    verticalSpread: number;
    dynamicWorldHeight: number;
    transform: Transform;
}

export const useAxisTicks = ({
    stats,
    scalingMode,
    verticalSpread,
    dynamicWorldHeight,
    // transform unused for now
}: UseAxisTicksProps) => {

    // 1. Calculate Tick Size (Matches VideoNode size logic)
    const getTickSize = (value: number) => {
        let sizeRatio = 0;

        if (scalingMode === 'linear') {
            const range = stats.maxViews - stats.minViews || 1;
            sizeRatio = (value - stats.minViews) / range;
        } else if (scalingMode === 'log') {
            const viewRangeLog = Math.log(stats.maxViews) - Math.log(stats.minViews) || 1;
            const viewLog = Math.log(Math.max(1, value));
            const minLog = Math.log(Math.max(1, stats.minViews));
            sizeRatio = (viewLog - minLog) / viewRangeLog;
        } else if (scalingMode === 'sqrt') {
            const viewRangeSqrt = Math.sqrt(stats.maxViews) - Math.sqrt(stats.minViews) || 1;
            const viewSqrt = Math.sqrt(value);
            const minSqrt = Math.sqrt(stats.minViews);
            sizeRatio = (viewSqrt - minSqrt) / viewRangeSqrt;
        } else {
            // Percentile default
            sizeRatio = 0.5;
        }

        // Clamp ratio
        sizeRatio = Math.max(0, Math.min(1, sizeRatio));

        return MIN_THUMBNAIL_SIZE + sizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);
    };

    // 2. Calculate Y Position (Snake Layout)
    const getY = (value: number) => {
        let yNorm = 0;

        if (scalingMode === 'linear') {
            const range = stats.maxViews - stats.minViews || 1;
            yNorm = 1 - (value - stats.minViews) / range;
        } else if (scalingMode === 'log') {
            const viewRangeLog = Math.log(stats.maxViews) - Math.log(stats.minViews) || 1;
            const viewLog = Math.log(Math.max(1, value));
            const minLog = Math.log(Math.max(1, stats.minViews));
            yNorm = 1 - (viewLog - minLog) / viewRangeLog;
        } else if (scalingMode === 'sqrt') {
            const viewRangeSqrt = Math.sqrt(stats.maxViews) - Math.sqrt(stats.minViews) || 1;
            const viewSqrt = Math.sqrt(value);
            const minSqrt = Math.sqrt(stats.minViews);
            yNorm = 1 - (viewSqrt - minSqrt) / viewRangeSqrt;
        } else {
            yNorm = 0.5;
        }

        // Effective Vertical Spread (same logic as useTimelinePositions)
        const spread = verticalSpread !== undefined ? verticalSpread : 1.0;

        // At spread 0: all items are at y=0.5 (center) -> yNorm = 0.5
        // At spread 1: items use full height -> yNorm = rawY
        // Interpolate: y = 0.5 + (rawY - 0.5) * spread
        const effectiveYNorm = 0.5 + (yNorm - 0.5) * spread;

        // SNAKE ALIGNMENT: match the video bubble center
        const tickSize = getTickSize(value);
        const radius = tickSize / 2;

        // y = Radius + yNorm * (WorldHeight - Diameter)
        return radius + effectiveYNorm * (dynamicWorldHeight - tickSize);
    };

    // 3. Generate Ticks (Standard 1-2-5 Grid)
    const ticksWithPriority = useMemo(() => {
        const { minViews, maxViews } = stats;
        if (minViews >= maxViews) return [{ value: minViews, priority: 0 }];

        const result: { value: number; priority: number }[] = [];

        const minLog = Math.floor(Math.log10(Math.max(1, minViews)));
        const maxLog = Math.ceil(Math.log10(Math.max(1, maxViews)));

        // Standard 1-2-5 Steps
        // 1  (1x) -> Priority 0 (Major)
        // 5  (0.5x) -> Priority 1 (Halves)
        // 2  (0.2x) -> Priority 2 (Fifths/Tenths)

        for (let i = minLog - 1; i <= maxLog + 1; i++) {
            const base = Math.pow(10, i);

            // Major (1x)
            const v1 = base * 1;
            if (v1 >= minViews && v1 <= maxViews) result.push({ value: v1, priority: 0 });

            // Halves (5x)
            const v5 = base * 5;
            if (v5 >= minViews && v5 <= maxViews) result.push({ value: v5, priority: 1 });

            // Tenths (2x)
            const v2 = base * 2;
            if (v2 >= minViews && v2 <= maxViews) result.push({ value: v2, priority: 2 });
        }

        return result.sort((a, b) => a.value - b.value);
    }, [stats.minViews, stats.maxViews]);

    return {
        ticksWithPriority,
        getY
    };
};

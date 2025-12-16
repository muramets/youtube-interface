import { useMemo } from 'react';

interface UseAxisTicksProps {
    stats: { minViews: number; maxViews: number };
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    amplifierLevel: number;
    dynamicWorldHeight: number;
}

export const useAxisTicks = ({
    stats,
    scalingMode,
    amplifierLevel,
    dynamicWorldHeight
}: UseAxisTicksProps) => {
    // Generate ticks with priority levels for LOD
    const ticksWithPriority = useMemo(() => {
        const { minViews, maxViews } = stats;
        if (minViews === maxViews) return [{ value: minViews, priority: 0 }];

        const result: { value: number; priority: number }[] = [];

        // Helper to assign priority based on "niceness"
        const getPriority = (val: number, base: number): number => {
            const mult = val / base;
            if (mult === 1) return 0;      // 10K, 100K, 1M (always show)
            if (mult === 5) return 1;      // 50K, 500K, 5M (show when space doubles)
            if (mult === 2) return 2;      // 20K, 200K, 2M
            if (mult === 2.5) return 3;    // 25K, 250K
            return 4;                       // Everything else
        };

        const minLog = Math.floor(Math.log10(Math.max(1, minViews)));
        const maxLog = Math.ceil(Math.log10(Math.max(1, maxViews)));

        for (let i = minLog; i <= maxLog; i++) {
            const base = Math.pow(10, i);
            // Multipliers covering various steps
            const multipliers = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 9];

            multipliers.forEach(mult => {
                const val = base * mult;
                if (val >= minViews && val <= maxViews) {
                    result.push({ value: val, priority: getPriority(val, base) });
                }
            });
        }

        return result.sort((a, b) => a.value - b.value);
    }, [stats.minViews, stats.maxViews]);

    // Calculate Y position for a view count
    const getY = (viewCount: number) => {
        let yNorm: number;

        if (scalingMode === 'linear') {
            const range = stats.maxViews - stats.minViews || 1;
            yNorm = 1 - (viewCount - stats.minViews) / range;
        } else if (scalingMode === 'log') {
            const viewRangeLog = Math.log(stats.maxViews) - Math.log(stats.minViews) || 1;
            const viewLog = Math.log(Math.max(1, viewCount));
            const minLog = Math.log(Math.max(1, stats.minViews));
            yNorm = 1 - (viewLog - minLog) / viewRangeLog;
        } else if (scalingMode === 'sqrt') {
            const viewRangeSqrt = Math.sqrt(stats.maxViews) - Math.sqrt(stats.minViews) || 1;
            const viewSqrt = Math.sqrt(viewCount);
            const minSqrt = Math.sqrt(stats.minViews);
            yNorm = 1 - (viewSqrt - minSqrt) / viewRangeSqrt;
        } else {
            return 0.5;
        }

        const effectiveYNorm = 0.5 + (yNorm - 0.5) * amplifierLevel;

        // Match video positioning: add padding based on average thumbnail size
        // Videos use: radius + effectiveYNorm * (height - diameter)
        const AVG_THUMBNAIL_SIZE = 120; // Average between MIN (40) and BASE (200)
        const radius = AVG_THUMBNAIL_SIZE / 2;
        const expandedY = radius + effectiveYNorm * (dynamicWorldHeight - AVG_THUMBNAIL_SIZE);

        return expandedY;
    };

    return {
        ticksWithPriority,
        getY
    };
};

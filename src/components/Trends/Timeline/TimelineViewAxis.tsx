import React, { useMemo, useRef, useState, useEffect } from 'react';

interface TimelineViewAxisProps {
    stats: { minViews: number; maxViews: number };
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    amplifierLevel: number;
    dynamicWorldHeight: number;
    transform: { scale: number; offsetY: number };
    style?: React.CSSProperties;
}

export const TimelineViewAxis: React.FC<TimelineViewAxisProps> = ({
    stats,
    scalingMode,
    amplifierLevel,
    dynamicWorldHeight,
    transform,
    style
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(600);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

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
        // We'll use an average size for the axis
        const AVG_THUMBNAIL_SIZE = 120; // Average between MIN (40) and BASE (200)
        const radius = AVG_THUMBNAIL_SIZE / 2;
        const expandedY = radius + effectiveYNorm * (dynamicWorldHeight - AVG_THUMBNAIL_SIZE);

        return expandedY;
    };

    const formatViews = (val: number) => {
        if (val >= 1000000) return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M`;
        if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
        return val.toString();
    };

    // Calculate ticks with screen positions and opacity
    const visibleTicks = useMemo(() => {
        const BASE_SPACING = containerHeight / 10; // Target 10 ticks at min scale

        const result = ticksWithPriority.map((tick, idx, arr) => {
            const y = getY(tick.value) * transform.scale + transform.offsetY;

            // Calculate spacing to nearest neighbors
            let minDistance = Infinity;
            if (idx > 0) {
                const prevY = getY(arr[idx - 1].value) * transform.scale + transform.offsetY;
                minDistance = Math.min(minDistance, Math.abs(y - prevY));
            }
            if (idx < arr.length - 1) {
                const nextY = getY(arr[idx + 1].value) * transform.scale + transform.offsetY;
                minDistance = Math.min(minDistance, Math.abs(y - nextY));
            }

            // Calculate opacity based on priority and available space
            // Linear progression instead of exponential:
            // Priority 0: needs BASE_SPACING (always visible at min scale)
            // Priority 1: needs 1.5× BASE_SPACING
            // Priority 2: needs 2.0× BASE_SPACING
            // Priority 3: needs 2.5× BASE_SPACING
            // Priority 4: needs 3.0× BASE_SPACING
            let opacity = 1;
            if (tick.priority > 0) {
                const requiredSpacing = BASE_SPACING * (1 + tick.priority * 0.5);
                const fadeRange = requiredSpacing * 0.3; // 30% fade zone

                if (minDistance < requiredSpacing - fadeRange) {
                    opacity = 0;
                } else if (minDistance < requiredSpacing + fadeRange) {
                    opacity = (minDistance - (requiredSpacing - fadeRange)) / (2 * fadeRange);
                } else {
                    opacity = 1;
                }
            }

            return { value: tick.value, y, opacity, priority: tick.priority };
        });

        // Filter out nearly invisible ticks to reduce DOM overhead
        return result.filter(t => t.opacity > 0.05);
    }, [ticksWithPriority, getY, transform.scale, transform.offsetY, containerHeight]);

    const axisOpacity = Math.min(1, Math.max(0, (amplifierLevel - 0.1) / 0.4));

    if (scalingMode === 'percentile' || axisOpacity <= 0) return null;

    return (
        <div
            ref={containerRef}
            className="absolute left-0 top-[48px] bottom-0 w-16 pointer-events-none z-20 overflow-hidden border-r border-border backdrop-blur-md bg-bg-primary/70"
            style={{
                ...style,
                opacity: axisOpacity,
                transition: 'opacity 0.2s ease',
            }}
        >
            {visibleTicks.map(({ value, y, opacity }) => (
                <div
                    key={value}
                    className="absolute right-0 w-full flex items-center justify-end pr-2 transform -translate-y-1/2"
                    style={{
                        top: y,
                        opacity,
                        transition: 'opacity 0.3s ease'
                    }}
                >
                    <span className="text-[10px] font-semibold text-text-secondary tracking-widest uppercase select-none">
                        {formatViews(value)}
                    </span>
                </div>
            ))}
        </div>
    );
};

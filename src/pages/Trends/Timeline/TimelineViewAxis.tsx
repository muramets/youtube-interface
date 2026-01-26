import React, { useMemo, useRef } from 'react';
import { useAxisTicks } from './hooks/useAxisTicks';

interface TimelineViewAxisProps {
    stats: { minViews: number; maxViews: number };
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    verticalSpread: number;
    dynamicWorldHeight: number;
    transform: { scale: number; offsetY: number; offsetX: number };
    style?: React.CSSProperties;
}

export const TimelineViewAxis: React.FC<TimelineViewAxisProps> = ({
    stats,
    scalingMode,
    verticalSpread,
    dynamicWorldHeight,
    transform,
    style
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const { ticksWithPriority, getY } = useAxisTicks({
        stats,
        scalingMode,
        verticalSpread,
        dynamicWorldHeight,
        transform
    });

    const formatViews = (val: number) => {
        if (val >= 1000000) return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M`;
        if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
        return val.toString();
    };

    // Calculate ticks with screen positions and opacity
    const visibleTicks = useMemo(() => {
        const result = ticksWithPriority.map((tick: { value: number; priority: number }, idx: number, arr: { value: number; priority: number }[]) => {
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

            // Density-based Opacity Logic
            // Priority 0 (1x): Major ticks. Always show unless overlapping heavily.
            // Priority 1 (5x): Halves. Show when there is moderate space.
            // Priority 2 (2x): Seconds. Show only when there is plenty of space.

            let requiredSpacing = 20; // Default min gap for P0

            if (tick.priority === 1) requiredSpacing = 45;
            if (tick.priority === 2) requiredSpacing = 80;

            const fadeRange = 15;
            let opacity = 1;

            if (minDistance < requiredSpacing - fadeRange) {
                opacity = 0;
            } else if (minDistance < requiredSpacing + fadeRange) {
                // Smooth fade in
                opacity = (minDistance - (requiredSpacing - fadeRange)) / (2 * fadeRange);
            } else {
                opacity = 1;
            }

            return { value: tick.value, y, opacity, priority: tick.priority };
        });

        // Filter out invisible ticks
        return result.filter((t: { opacity: number }) => t.opacity > 0.05);
    }, [ticksWithPriority, getY, transform.scale, transform.offsetY]);

    const safeSpread = verticalSpread ?? 1.0;

    // Relaxed opacity: Visible as soon as spread > 0. Full opacity at 0.3.
    const axisOpacity = Math.min(1, Math.max(0, safeSpread * 3.33));

    if (scalingMode === 'percentile') return null;

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

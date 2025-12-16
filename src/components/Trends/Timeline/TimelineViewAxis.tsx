import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useAxisTicks } from './hooks/useAxisTicks';

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

    const { ticksWithPriority, getY } = useAxisTicks({
        stats,
        scalingMode,
        amplifierLevel,
        dynamicWorldHeight
    });

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

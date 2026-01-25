import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TrendVideo, TimelineStats, MonthLayout } from '../../../../core/types/trends';
import { useTrendBaseline } from '../hooks/useTrendBaseline';

interface TimelineAverageLineProps {
    videos: TrendVideo[];
    stats: TimelineStats;
    monthLayouts: MonthLayout[];
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile';
    verticalSpread: number;
    dynamicWorldHeight: number;
    transform: { scale: number; offsetY: number; offsetX: number };
    baselineMode?: 'global' | 'dynamic';
    baselineWindowSize?: number;
    worldWidth?: number; // Needed for X position of path points
}

const formatViews = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K`;
    return Math.round(val).toString();
};

/**
 * Catmull-Rom Spline to SVG Path
 * Generates a smooth curve passing through all points.
 */
const pointsToPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + 10} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        let cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        let cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        // CLAMPING: Prevent X control points from going backward or overshooting the segment
        // This prevents the "loops" seen when irregular time gaps exist
        if (cp1x < p1.x) cp1x = p1.x;
        if (cp1x > p2.x) cp1x = p2.x;
        if (cp2x < p1.x) cp2x = p1.x;
        if (cp2x > p2.x) cp2x = p2.x;

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
};

export const TimelineAverageLine: React.FC<TimelineAverageLineProps> = ({
    videos,
    stats,
    monthLayouts,
    scalingMode,
    verticalSpread,
    dynamicWorldHeight,
    transform,
    baselineMode = 'dynamic',
    baselineWindowSize = 30, // Default to 30
    worldWidth = 10000
}) => {
    const [hoveredPoint, setHoveredPoint] = useState<{
        xNorm: number;
        localX: number;
        localY: number;
        screenX: number;
        screenY: number;
        value: number
    } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);

    // 1. Calculate Data using extracted Hook
    const lineData = useTrendBaseline({
        videos,
        stats,
        monthLayouts,
        scalingMode,
        verticalSpread,
        dynamicWorldHeight,
        baselineMode,
        baselineWindowSize
    });

    if (!lineData) return null;

    // Interaction Handlers
    const handleMouseMove = (e: React.MouseEvent) => {
        if (lineData.type !== 'dynamic' || !lineData.points || lineData.points.length < 2) return;
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;

        // Invert Transform X: ScreenX -> WorldX -> xNorm
        const worldX = (clientX - transform.offsetX) / transform.scale;
        const xNorm = worldX / worldWidth;

        // Find surrounding points [p1, p2]
        // This assumes points are sorted by x (they are, by definition of loop)
        const nextIndex = lineData.points.findIndex(p => p.x >= xNorm);

        if (nextIndex > 0) {
            const i = nextIndex - 1;
            const p1 = lineData.points[i];
            const p2 = lineData.points[nextIndex];

            const range = p2.x - p1.x;
            if (range > 0) {
                const t = (xNorm - p1.x) / range;

                // Get neighbor points for tension calculation (Catmull-Rom logic)
                const p0 = lineData.points[i - 1] || p1;
                const p3 = lineData.points[i + 2] || p2;

                // Calculate Control Points Y (Same logic as pointsToPath)
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;

                // Cubic Bezier Interpolation for Y to visually stick to the curve
                // B(t) = (1-t)^3 * P0 + 3*(1-t)^2 * t * P1 + 3*(1-t) * t^2 * P2 + t^3 * P3
                const t2 = t * t;
                const t3 = t2 * t;
                const mt = 1 - t;
                const mt2 = mt * mt;
                const mt3 = mt2 * mt;

                const interpolatedY =
                    mt3 * p1.y +
                    3 * mt2 * t * cp1y +
                    3 * mt * t2 * cp2y +
                    t3 * p2.y;

                // Value is still linearly interpolated (data truth)
                const interpolatedValue = p1.value + t * (p2.value - p1.value);

                const localX = transform.offsetX + (xNorm * worldWidth * transform.scale);
                const localY = transform.offsetY + (interpolatedY * transform.scale);

                setHoveredPoint({
                    xNorm,
                    localX,
                    localY,
                    screenX: rect.left + localX,
                    screenY: rect.top + localY,
                    value: interpolatedValue
                });
                return;
            }
        }

        // Fallback to snapping if exact range not found (e.g. out of bounds)
        setHoveredPoint(null);
    };

    const handleMouseLeave = () => setHoveredPoint(null);

    // -- RENDER --

    if (lineData.type === 'global') {
        const screenY = transform.offsetY + (lineData.y! * transform.scale);
        return (
            <div
                className="absolute left-0 right-0 pointer-events-none z-0"
                style={{ top: screenY, height: 1 }}
            >
                <div className="absolute inset-x-0 top-0 border-t border-dashed border-blue-400/50 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                {/* Label */}
                <div className="absolute left-4 -translate-y-[50%] flex items-center group pointer-events-auto cursor-help">
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 backdrop-blur-md border border-blue-400/20 shadow-lg transaction-all hover:bg-blue-500/20">
                        <span className="text-[10px] font-semibold text-blue-200 tracking-wide">
                            AVG • {formatViews(lineData.value!)}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // DYNAMIC MODE
    if (lineData.type === 'dynamic' && lineData.points) {
        // Convert normalized points to Screen Coordinates
        const screenPoints = lineData.points.map(p => ({
            x: transform.offsetX + (p.x * worldWidth * transform.scale),
            y: transform.offsetY + (p.y * transform.scale)
        }));

        const pathData = pointsToPath(screenPoints);

        // Active point uses local coords for SVG dot
        const activePoint = hoveredPoint ? {
            x: hoveredPoint.localX,
            y: hoveredPoint.localY,
            value: hoveredPoint.value
        } : null;

        return (
            <div
                ref={containerRef}
                className="absolute inset-0 pointer-events-none z-20"
            >
                <svg className="w-full h-full overflow-visible">
                    <defs>
                        <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    {/* The Curve */}
                    <path
                        d={pathData}
                        fill="none"
                        stroke="#60A5FA"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                        strokeOpacity="0.6"
                        filter="url(#glow-blue)"
                    />

                    {/* Invisible Hit Area for Hover - Made much wider (120px) */}
                    <path
                        d={pathData}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="120"
                        className="pointer-events-auto cursor-crosshair"
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                    />
                </svg>

                {/* Hover Dot (Local - Stays with Line) */}
                {activePoint && (
                    <div
                        className="absolute w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3B82F6] pointer-events-none transition-transform duration-75"
                        style={{
                            left: activePoint.x,
                            top: activePoint.y,
                            transform: 'translate(-50%, -50%)'
                        }}
                    />
                )}

                {/* Tooltip Text (Portal - Global Z-Index) */}
                {hoveredPoint && createPortal(
                    <div
                        className="fixed pointer-events-none z-[9999]"
                        style={{
                            left: hoveredPoint.screenX,
                            top: hoveredPoint.screenY,
                        }}
                    >
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/80 backdrop-blur text-[10px] text-white whitespace-nowrap border border-white/10 shadow-xl">
                            {formatViews(hoveredPoint.value)} views
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        );
    }

    return null;
};

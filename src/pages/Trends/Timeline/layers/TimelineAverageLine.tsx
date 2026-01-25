import React, { useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TrendVideo, TimelineStats } from '../../../../core/types/trends';

interface TimelineAverageLineProps {
    videos: TrendVideo[];
    stats: TimelineStats;
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

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
};

export const TimelineAverageLine: React.FC<TimelineAverageLineProps> = ({
    videos,
    stats,
    scalingMode,
    verticalSpread,
    dynamicWorldHeight,
    transform,
    baselineMode = 'dynamic',
    baselineWindowSize = 30, // Default to 30
    worldWidth = 10000
}) => {
    const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; value: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 1. Calculate Data (Global or Dynamic)
    const lineData = useMemo(() => {
        if (!videos.length || !stats) return null;
        if (scalingMode === 'percentile') return null;

        const { minViews, maxViews, minDate, maxDate } = stats;
        const viewRangeLinear = maxViews - minViews || 1;
        const viewRangeLog = Math.log(Math.max(1, maxViews)) - Math.log(Math.max(1, minViews)) || 1;
        const viewRangeSqrt = Math.sqrt(maxViews) - Math.sqrt(minViews) || 1;
        const dateRange = maxDate - minDate || 1;

        // Constants for Y positioning (to align with dot centers)
        const BASE_THUMBNAIL_SIZE = 200;
        const MIN_THUMBNAIL_SIZE = 40;
        const verticalBuffer = 12;

        const getYForValue = (val: number) => {
            let yNorm = 0.5;
            let sizeRatio = 0.5;

            if (Math.abs(stats.maxViews - stats.minViews) >= 0.001) {
                switch (scalingMode) {
                    case 'linear':
                        yNorm = 1 - (val - stats.minViews) / viewRangeLinear;
                        sizeRatio = (val - stats.minViews) / viewRangeLinear;
                        break;
                    case 'log':
                        const valLog = Math.log(Math.max(1, val));
                        const minLog = Math.log(Math.max(1, stats.minViews));
                        yNorm = 1 - (valLog - minLog) / viewRangeLog;
                        sizeRatio = (valLog - minLog) / viewRangeLog;
                        break;
                    case 'sqrt':
                        const valSqrt = Math.sqrt(val);
                        const minSqrt = Math.sqrt(stats.minViews);
                        yNorm = 1 - (valSqrt - minSqrt) / viewRangeSqrt;
                        sizeRatio = (valSqrt - minSqrt) / viewRangeSqrt;
                        break;
                }
            }

            const effectiveYNorm = 0.5 + (yNorm - 0.5) * verticalSpread;
            const baseSize = MIN_THUMBNAIL_SIZE + sizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);
            const radius = baseSize / 2;
            const availableHeight = dynamicWorldHeight - baseSize - 2 * verticalBuffer;

            // Return CENTER Y of where a dot would be
            return radius + verticalBuffer + effectiveYNorm * Math.max(0, availableHeight);
        };

        if (baselineMode === 'global') {
            const total = videos.reduce((acc, v) => acc + v.viewCount, 0);
            const avg = total / videos.length;
            return { type: 'global', y: getYForValue(avg), value: avg };
        } else {
            // Dynamic: Rolling Window
            const points: { x: number; y: number; value: number }[] = [];

            // Sort videos once
            const sortedVideos = [...videos].sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);

            // Rolling Window Logic: Smart Collapse
            const durationDays = (maxDate - minDate) / (24 * 60 * 60 * 1000);
            const safeMax = durationDays / 3; // Theoretical max (can be huge)

            // Determine effective window based on INTENT (baselineWindowSize)
            // intent is 7 (Fast), 30 (Mid), or 90 (Slow)
            const intent = baselineWindowSize || 30;
            let effectiveWindow = 30;

            // 1. Calculate Safe Bounds
            const MAX_CAP = 90;
            const clampedSafeMax = Math.min(MAX_CAP, Math.max(1, safeMax));
            const safeFast = Math.min(7, clampedSafeMax);

            if (intent === 90) {
                effectiveWindow = clampedSafeMax;
            } else if (intent === 7) {
                effectiveWindow = safeFast;
            } else {
                // Midpoint Logic (intent 30)
                if (clampedSafeMax >= 90) {
                    effectiveWindow = 30; // Standard
                } else {
                    effectiveWindow = (safeFast + clampedSafeMax) / 2;
                }
            }

            const windowMs = Math.max(1, effectiveWindow) * 24 * 60 * 60 * 1000;

            // Sampling: Aim for ~200 points for smooth interaction
            // Ensure step is at least 1 hour to avoid infinite loops on small ranges
            const stepMs = Math.max(1000 * 60 * 60, dateRange / 200);

            // Extend range slightly to cover edges
            const startT = minDate - stepMs;
            const endT = maxDate + stepMs;

            for (let t = startT; t <= endT; t += stepMs) {
                // Relevant videos for this window
                const relevant = sortedVideos.filter(v =>
                    v.publishedAtTimestamp >= t - windowMs &&
                    v.publishedAtTimestamp <= t + windowMs
                );

                if (relevant.length > 0) {
                    const avg = relevant.reduce((acc, v) => acc + v.viewCount, 0) / relevant.length;
                    const xNorm = (t - minDate) / dateRange;

                    points.push({
                        x: xNorm, // 0-1
                        y: getYForValue(avg), // World Y Pixels
                        value: avg
                    });
                }
            }

            return { type: 'dynamic', points };
        }

    }, [videos, stats, scalingMode, verticalSpread, dynamicWorldHeight, baselineMode, baselineWindowSize]);

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

                setHoveredPoint({
                    x: xNorm,
                    y: interpolatedY,
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

        const activePoint = hoveredPoint ? {
            x: transform.offsetX + (hoveredPoint.x * worldWidth * transform.scale),
            y: transform.offsetY + (hoveredPoint.y * transform.scale),
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
                {activePoint && containerRef.current && createPortal(
                    <div
                        className="fixed pointer-events-none z-[9999]"
                        style={{
                            left: containerRef.current.getBoundingClientRect().left + activePoint.x,
                            top: containerRef.current.getBoundingClientRect().top + activePoint.y,
                        }}
                    >
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/80 backdrop-blur text-[10px] text-white whitespace-nowrap border border-white/10 shadow-xl">
                            {formatViews(activePoint.value)} views
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        );
    }

    return null;
};

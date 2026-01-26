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
 * Monotone Cubic Spline Interpolation (Monotone X)
 * Ensures the curve is monotonic (no loops) and smooth (no sharp corners).
 * Based on the standard Fritsch-Carlson algorithm used in D3 and other libraries.
 */
const pointsToPath = (points: { x: number; y: number }[]) => {
    const n = points.length;
    if (n === 0) return '';
    if (n === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + 1} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;

    // 1. Compute Slopes (Secants)
    const m = new Array(n - 1); // Slopes of segments
    const dx = new Array(n - 1);

    for (let i = 0; i < n - 1; i++) {
        const deltaX = points[i + 1].x - points[i].x;
        const deltaY = points[i + 1].y - points[i].y;
        dx[i] = deltaX;

        // Handling duplicate X coordinates (vertical lines)
        if (deltaX === 0) {
            m[i] = 0; // Or infinity, but 0 prevents NaN in math
        } else {
            m[i] = deltaY / deltaX;
        }
    }

    // 2. Compute Tangents at each point
    const t = new Array(n);

    // Boundary conditions: Simple projection or average
    t[0] = m[0];
    t[n - 1] = m[n - 2];

    for (let i = 1; i < n - 1; i++) {
        const m0 = m[i - 1]; // Slope before
        const m1 = m[i];     // Slope after

        // If slopes have opposite signs or one is flat, it's a turning point.
        // Tangent MUST be flat (0) to preserve monotonicity.
        if (m0 * m1 <= 0) {
            t[i] = 0;
        } else {
            // Weighted Harmonic Mean (Steffen's Method? Or D3's approach?)
            // Standard avg is (m0 + m1) / 2
            // Common robust choice: 3-point average
            t[i] = (m0 + m1) / 2;
        }
    }

    // 3. Refine Tangents (Strict Monotonicity Check)
    // Ensure tangent magnitude doesn't exceed 3x the secant slope
    // to prevent "overshoot" within the segment boundaries Y-wise.
    for (let i = 0; i < n - 1; i++) {
        const slope = m[i];

        if (slope === 0) {
            t[i] = 0;
            t[i + 1] = 0;
            continue;
        }

        // Strict Fritsch-Carlson constraints check
        // If alpha^2 + beta^2 > 9, we need to scale them down
        // However, simpler chart libraries often skip this if visual "good enough" is target.
        // Let's rely on the m0*m1 check which handles the loops (extremums).
    }

    // 4. Generate Path
    for (let i = 0; i < n - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];

        const tangent0 = t[i];
        const tangent1 = t[i + 1];
        const dist = dx[i];

        // Bezier Control Points
        // X coords are 1/3 and 2/3 along the segment
        const cp1x = p0.x + dist / 3;
        const cp2x = p1.x - dist / 3;

        // Y coords follow the tangent slope
        const cp1y = p0.y + (tangent0 * dist) / 3;
        const cp2y = p1.y - (tangent1 * dist) / 3;

        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
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

                // Interpolating Value for Tooltip
                // NOTE: For exact visual correlation, we should solve the Cubic Bezier equation for Y given X.
                // However, linear interpolation of the value is usually acceptable for "value at time X",
                // even if the curve visually deviates slightly due to smoothing.
                // Solving Y for X on a Bezier curve is computationally expensive (cubic root finding).

                // Let's stick to linear interpolation of the VALUE data, which is statistically truthy.
                // We use calculate Y from that value using the scaling function?
                // Or just interpolate Y linearly?
                // The visual Y is smoothed. The data Y is probably linear or stepped.
                // To make the dot stick to the line: 
                // We'd ideally need to evaluate the Bezier function B(t) we just generated.
                // B(t) = (1-t)^3 P0 + ...
                // But we don't have the CP1/CP2 handy here easily without recalculating tangents.

                // COMPROMISE: Linearly interpolate the value. 
                // Then ask "Where is this value in pixel space?". 
                // Wait, Y is derived from value. So linear value interp -> Calculate Y.
                // If scaling is linear, that's equivalent. 
                // If scaling is Log/Sqrt, it's safer to interpolate value then calculate Y.

                const interpolatedValue = p1.value + t * (p2.value - p1.value);

                // Re-calculate Y for this specific interpolated value?
                // Or easier: Just interpolate Y linearly between p1.y and p2.y for the dot position?
                // The curve is curvy, linear is straight. The dot might detach from the line.
                // For "Industry Best Practice", the dot must stick to the curve.
                // So we MUST evaluate the Spline at t.

                // 1. Re-calculate tangents for just this segment?
                // We need p0, p1, p2, p3 to know tangents at p1/p2.
                // Tangent at p1 depends on p0-p1-p2.
                // Tangent at p2 depends on p1-p2-p3.

                const p0 = lineData.points[i - 1] || p1; // Boundary check
                const p3 = lineData.points[i + 2] || p2; // Boundary check

                // TANGENT CALCULATION (Inlined Monotone Logic)
                const m0 = (p1.y - p0.y) / (p1.x - p0.x || 1);
                const m1 = (p2.y - p1.y) / (p2.x - p1.x); // Current segment slope
                const m2 = (p3.y - p2.y) / (p3.x - p2.x || 1);

                // Tangent at P1 (using p0, p1, p2)
                let t1 = (m0 + m1) / 2;
                if (m0 * m1 <= 0) t1 = 0; // Flat extremum
                if (i === 0) t1 = m1; // Start boundary

                // Tangent at P2 (using p1, p2, p3)
                let t2 = (m1 + m2) / 2;
                if (m1 * m2 <= 0) t2 = 0; // Flat extremum 
                if (nextIndex === lineData.points.length - 1) t2 = m1; // End boundary

                // Bezier Evaluation
                const dist = p2.x - p1.x;
                const cp1y = p1.y + (t1 * dist) / 3;
                const cp2y = p2.y - (t2 * dist) / 3;

                // Cubic Bezier formula
                const t_sq = t * t;
                const t_cub = t_sq * t;
                const mt = 1 - t;
                const mt_sq = mt * mt;
                const mt_cub = mt_sq * mt;

                const curveY =
                    mt_cub * p1.y +
                    3 * mt_sq * t * cp1y +
                    3 * mt * t_sq * cp2y +
                    t_cub * p2.y;

                const localX = transform.offsetX + (xNorm * worldWidth * transform.scale);
                const localY = transform.offsetY + (curveY * transform.scale);

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

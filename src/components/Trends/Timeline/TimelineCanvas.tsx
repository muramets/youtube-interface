import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendTooltip } from './TrendTooltip';
import { useDebounce } from '../../../hooks/useDebounce';
import { TimelineDateHeader } from './TimelineDateHeader';
import { TimelineBackground } from './TimelineBackground';
import { TimelineVideoLayer, type TimelineVideoLayerHandle } from './TimelineVideoLayer';
import { ZoomIndicator } from './ZoomIndicator';
import { AmplifierSlider } from './AmplifierSlider';
import type { MonthRegion, YearMarker, TrendVideo } from '../../../types/trends';

// Performance logging flag (set to true to enable console logging)
const PERF_LOGGING = true; // Enabled for debugging

interface Transform {
    scale: number;
    offsetX: number;
    offsetY: number;
}

interface TimelineCanvasProps {
    videos: TrendVideo[];
}

// Constants for "world" coordinate system
const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;
const HEADER_HEIGHT = 48;
const PADDING = 40;
// WORLD_HEIGHT is now dynamic based on viewport aspect ratio
// Note: For true 2D zoom, thumbnails scale with zoom level (no counter-scaling)

// Amplifier constants and helpers -> REMOVING AMPLIFIER LOGIC for simplicity/Miro-style first
// We can re-add if needed, but "Zooming into 2D" usually replaces the need for an "Amplifier".
// User asked for Miro-style zoom.
// Let's keep logic simple: 2D World with fixed dimensions.


/**
 * Calculate the expansion factor for Range Expansion based on amplifier level.
 * At amp=1: factor=1 (no expansion)
 * At amp=3: factor=8.6 (strong expansion)
 */
// Amplifier constants and helpers -> REMOVED


export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ videos }) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen } = useTrendStore();
    const { scalingMode, layoutMode, isCustomView, zoomLevel, offsetX, offsetY, amplifierLevel } = timelineConfig;

    // Refs for imperative access (perf optimization)
    const containerRef = useRef<HTMLDivElement>(null);

    // Initial ResizeObserver to cache size
    const containerSizeRef = useRef({ width: 0, height: 0 });
    // State to trigger re-renders on resize (needed for dynamic world height)
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newSize = {
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                };
                containerSizeRef.current = newSize;
                setViewportSize(newSize);
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const [hoveredVideo, setHoveredVideo] = useState<{ video: TrendVideo; x: number; y: number; height: number } | null>(null);
    const isTooltipHoveredRef = useRef(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Ref for imperative DOM updates (bypass React for max performance)
    const videoLayerRef = useRef<TimelineVideoLayerHandle>(null);

    // Drag-to-pan state
    const [isPanning, setIsPanning] = useState(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    // Transform state: Mutable ref for high-perf updates + React state for sync
    const transformRef = useRef<Transform>({
        scale: Math.max(0.1, zoomLevel || 1),
        offsetX: offsetX || 0,
        offsetY: offsetY || 0
    });

    // Keep React state for non-critical UI (like zoom label) - AND for React rendering of children
    const [transformState, setTransformState] = useState<Transform>(transformRef.current);

    // Dynamic World Width
    const worldWidth = useMemo(() => {
        if (videos.length === 0) return 2000;

        const counts = new Map<string, number>();
        videos.forEach(v => {
            const d = new Date(v.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        let totalWidth = 0;
        const start = new Date(Math.min(...videos.map(v => v.publishedAtTimestamp)));
        const end = new Date(Math.max(...videos.map(v => v.publishedAtTimestamp)));
        // Add buffer
        start.setMonth(start.getMonth() - 1);
        end.setMonth(end.getMonth() + 1);

        const current = new Date(start);
        current.setDate(1);

        while (current <= end) {
            const key = `${current.getFullYear()}-${current.getMonth()}`;
            const count = counts.get(key) || 0;
            // Layout mode determines spacing
            const width = layoutMode === 'compact'
                ? Math.max(60, count * 30)
                : Math.max(200, count * 80);
            totalWidth += width;
            current.setMonth(current.getMonth() + 1);
        }

        return Math.max(2000, totalWidth);
    }, [videos, layoutMode]);

    // Helper to apply transforms imperatively to DOM is NO LONGER NEEDED for children that are React components
    // relying on props. However, for max performance we might want to ref pass?
    // User requested "industry standard". React reconciliation at 120fps is hard.
    // But passing down a changing "transform" prop will cause re-render of children.
    // The previous implementation used imperative Refs to style.
    // To match that performance while decoupling:
    // We can pass a Ref to the children? Or just ensure the Children are light.
    // Actually, `TimelineVideoLayer` uses `will-change-transform` and is relatively light if virtualized.
    // Let's stick to React state for now (transformState). If it lags, we move to Ref-based imperative updates.
    // BUT: previous implementation used `requestAnimationFrame` and direct DOM manipulation.
    // To preserve that smoothness, we should probably still allow direct manipulation or use a library like `react-spring` or just stick to the imperative approach for the container divs.

    // DECISION: We will pass `transformState` as props. This causes re-renders on every frame of drag/zoom.
    // This is "React Way" but potentially slower than direct DOM.
    // Given 1000 items + virtualization, it might be fine.
    // If user complains about perf, we switch to ref / imperative handle.
    // The "standard" way in complex apps (Figma-like) is often imperative or using specialized canvasses.
    // Let's stick to React Props for clean code first (as requested "components"), but optimize `TimelineVideoLayer` with `memo`.

    // Performance tracking refs
    const perfFrameCountRef = useRef(0);
    const perfLastTimeRef = useRef(performance.now());
    const perfActiveRef = useRef(false);
    const perfTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const syncToDom = useCallback(() => {
        // Imperative DOM update for video layer (bypasses React reconciliation)
        if (videoLayerRef.current) {
            videoLayerRef.current.updateTransform(transformRef.current);
        }

        // Still update React state for components that need it (throttled updates)
        setTransformState({ ...transformRef.current });

        // Performance logging - accurate FPS measurement
        if (PERF_LOGGING) {
            perfFrameCountRef.current++;

            // Start tracking when interaction begins
            if (!perfActiveRef.current) {
                perfActiveRef.current = true;
                perfLastTimeRef.current = performance.now();
                perfFrameCountRef.current = 1;
            }

            // Clear any existing timeout
            if (perfTimeoutRef.current) clearTimeout(perfTimeoutRef.current);

            // Log FPS every second during activity
            const now = performance.now();
            const elapsed = now - perfLastTimeRef.current;

            if (elapsed >= 1000) {
                const fps = Math.round(perfFrameCountRef.current * 1000 / elapsed);
                console.log(`📊 FPS: ${fps} (${perfFrameCountRef.current} frames in ${elapsed.toFixed(0)}ms)`);
                perfFrameCountRef.current = 0;
                perfLastTimeRef.current = now;
            }

            // Stop tracking after 500ms of inactivity
            perfTimeoutRef.current = setTimeout(() => {
                if (perfFrameCountRef.current > 0) {
                    const finalElapsed = performance.now() - perfLastTimeRef.current;
                    const finalFps = Math.round(perfFrameCountRef.current * 1000 / finalElapsed);
                    console.log(`📊 Final FPS: ${finalFps} (${perfFrameCountRef.current} frames)`);
                }
                perfActiveRef.current = false;
                perfFrameCountRef.current = 0;
            }, 500);
        }
    }, []);

    // Debounce value to prevent excessive store updates
    const debouncedTransform = useDebounce(transformState, 500);

    // Sync transform back to store when it settles
    useEffect(() => {
        if (
            Math.abs(debouncedTransform.scale - zoomLevel) > 0.001 ||
            Math.abs(debouncedTransform.offsetX - offsetX) > 1 ||
            Math.abs(debouncedTransform.offsetY - offsetY) > 1
        ) {
            setTimelineConfig({
                zoomLevel: debouncedTransform.scale,
                offsetX: debouncedTransform.offsetX,
                offsetY: debouncedTransform.offsetY,
                isCustomView: true
            });
        }
    }, [debouncedTransform, setTimelineConfig, zoomLevel, offsetX, offsetY]);

    // Calculate view stats for scaling
    const stats = useMemo(() => {
        if (videos.length === 0) return { minViews: 0, maxViews: 1, minDate: Date.now(), maxDate: Date.now() };
        const views = videos.map(v => v.viewCount);
        const dates = videos.map(v => v.publishedAtTimestamp);

        const buffer = 1000 * 60 * 60 * 12;

        return {
            minViews: Math.max(1, Math.min(...views)),
            maxViews: Math.max(1, Math.max(...views)),
            minDate: Math.min(...dates) - buffer,
            maxDate: Math.max(...dates) + buffer
        };
    }, [videos]);

    // Calculate density-based month layouts
    const monthLayouts = useMemo(() => {
        if (videos.length === 0) return [];

        const counts = new Map<string, number>();
        videos.forEach(v => {
            const d = new Date(v.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        // Determine range stats
        let current = new Date(stats.minDate);
        current.setDate(1); // align to start of month
        current.setHours(0, 0, 0, 0);

        const endDate = new Date(stats.maxDate);
        const safeEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);

        // First pass: Calculate absolute widths
        const layouts = [];
        let totalAbsWidth = 0;

        while (current < safeEndDate) {
            const year = current.getFullYear();
            const month = current.getMonth();
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;

            const absWidth = layoutMode === 'compact'
                ? Math.max(60, count * 30)
                : Math.max(200, count * 80);

            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);

            layouts.push({
                year,
                month,
                monthKey: key,
                label: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                count,
                startX: totalAbsWidth,
                endX: totalAbsWidth + absWidth,
                width: absWidth,
                startTs: current.getTime(),
                endTs: nextMonth.getTime()
            });

            totalAbsWidth += absWidth;
            current = nextMonth;
        }

        // Normalize
        return layouts.map(l => ({
            ...l,
            startX: l.startX / totalAbsWidth,
            endX: l.endX / totalAbsWidth,
            width: l.width / totalAbsWidth
        }));
    }, [videos, stats, layoutMode]);

    // 1. Calculate the 'Fit Scale' based on Width (Primary constraint)
    const fitScale = useMemo(() => {
        if (viewportSize.width <= 0) return 0.001;
        // Use PADDING to ensure horizontal breathing room
        return (viewportSize.width - PADDING * 2) / worldWidth;
    }, [viewportSize.width, worldWidth]);

    // 2. Derive Dynamic World Height
    // We want the content to fill the Viewport Height exactly when at 'Fit Scale'.
    // worldHeight * fitScale = viewportHeight - Header
    const dynamicWorldHeight = useMemo(() => {
        if (viewportSize.height <= 0 || fitScale <= 0) return 1000;
        return (viewportSize.height - HEADER_HEIGHT) / fitScale;
    }, [viewportSize.height, fitScale]);

    // 3. Min Scale is simply the fit scale
    // We don't want to zoom out further than fitting the width
    const minScale = fitScale;

    // Helper to clamp transform
    const clampTransform = useCallback((
        t: Transform,
        viewportWidth: number,
        viewportHeight: number
    ): Transform => {
        // Uniform scaling - same scale for X and Y
        const scaledWidth = worldWidth * t.scale;
        const scaledHeight = dynamicWorldHeight * t.scale;

        // X-Axis clamping
        let constrainedOffsetX: number;
        if (scaledWidth < viewportWidth) {
            // Center horizontally if content is smaller than viewport
            constrainedOffsetX = (viewportWidth - scaledWidth) / 2;
        } else {
            const minOffsetX = viewportWidth - scaledWidth;
            const maxOffsetX = 0;
            constrainedOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, t.offsetX));
        }

        // Y-Axis clamping
        let constrainedOffsetY: number;
        // Available height for content is below the header
        const availableHeight = viewportHeight - HEADER_HEIGHT;

        if (scaledHeight < availableHeight) {
            // Center vertically within the available space below header
            // Offset = HeaderHeight + (Available - Scaled)/2
            constrainedOffsetY = HEADER_HEIGHT + (availableHeight - scaledHeight) / 2;
        } else {
            // Allow panning such that:
            // Top of content can touch bottom of header (HEADER_HEIGHT)
            // Bottom of content can touch bottom of viewport (viewportHeight)

            const maxOffsetY = HEADER_HEIGHT;
            const minOffsetY = viewportHeight - scaledHeight;

            constrainedOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, t.offsetY));
        }

        return {
            scale: t.scale,
            offsetX: constrainedOffsetX,
            offsetY: constrainedOffsetY
        };
    }, [worldWidth, dynamicWorldHeight]);

    // Calculate local stats for the currently visible videos
    // This ensures the top video *in the current set* is strictly at yNorm=0
    const localStats = useMemo(() => {
        if (videos.length === 0) return { minViews: 0, maxViews: 1, minDate: 0, maxDate: 1 };

        let minViews = Infinity;
        let maxViews = -Infinity;
        // We use global dates for X axis to maintain timeline consistency across filters? 
        // Or local? Usually Timeline X is time, so fixed range is better.
        // But Y axis (Views) is relative density.

        videos.forEach(v => {
            if (v.viewCount < minViews) minViews = v.viewCount;
            if (v.viewCount > maxViews) maxViews = v.viewCount;
        });

        return { minViews, maxViews };
    }, [videos]);

    // Calculate video positions
    const videoPositions = useMemo(() => {
        // Use LOCAL stats for Y-axis normalization
        const viewRangeLinear = localStats.maxViews - localStats.minViews || 1;
        const viewRangeLog = Math.log(localStats.maxViews) - Math.log(localStats.minViews) || 1;
        const viewRangeSqrt = Math.sqrt(localStats.maxViews) - Math.sqrt(localStats.minViews) || 1;

        const sortedByViews = [...videos].sort((a, b) => a.viewCount - b.viewCount);
        const rankMap = new Map<string, number>();
        sortedByViews.forEach((v, i) => rankMap.set(v.id, i / (videos.length - 1 || 1)));

        const positions = videos.map(video => {
            const d = new Date(video.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const layout = monthLayouts.find(l => l.monthKey === key);

            // X-AXIS uses global stats or layout (Time is absolute)
            let xNorm: number;

            if (layout) {
                const monthDuration = layout.endTs - layout.startTs;
                const offsetInMonth = video.publishedAtTimestamp - layout.startTs;
                const localProgress = Math.max(0, Math.min(1, offsetInMonth / monthDuration));
                xNorm = layout.startX + (localProgress * layout.width);
            } else {
                const dateRange = stats.maxDate - stats.minDate || 1;
                xNorm = (video.publishedAtTimestamp - stats.minDate) / dateRange;
            }

            let yNorm: number;
            let sizeRatio: number;

            switch (scalingMode) {
                case 'linear':
                    yNorm = 1 - (video.viewCount - localStats.minViews) / viewRangeLinear;
                    sizeRatio = (video.viewCount - localStats.minViews) / (localStats.maxViews - localStats.minViews);
                    break;
                case 'log':
                    const viewLog = Math.log(Math.max(1, video.viewCount));
                    const minLog = Math.log(Math.max(1, localStats.minViews));
                    const maxLog = Math.log(Math.max(1, localStats.maxViews));
                    yNorm = 1 - (viewLog - minLog) / viewRangeLog;
                    sizeRatio = (viewLog - minLog) / (maxLog - minLog);
                    break;
                case 'sqrt':
                    const viewSqrt = Math.sqrt(video.viewCount);
                    const minSqrt = Math.sqrt(localStats.minViews);
                    const maxSqrt = Math.sqrt(localStats.maxViews);
                    yNorm = 1 - (viewSqrt - minSqrt) / viewRangeSqrt;
                    sizeRatio = (viewSqrt - minSqrt) / (maxSqrt - minSqrt);
                    break;
                case 'percentile':
                    const percentileRank = rankMap.get(video.id) ?? 0.5;
                    yNorm = 1 - percentileRank;
                    sizeRatio = percentileRank;
                    break;
                default:
                    yNorm = 0.5;
                    sizeRatio = 0.5;
            }

            // Simple Y-Norm distribution (0-1)
            // We want yNorm=0 to place visually at top edge (radius)
            // We want yNorm=1 to place visually at bottom edge (H - radius)

            const baseSize = MIN_THUMBNAIL_SIZE + sizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);
            const radius = baseSize / 2;

            // Dynamic Radius Position
            // y = Radius + yNorm * (WorldHeight - Diameter)
            const expandedY = radius + yNorm * (dynamicWorldHeight - baseSize);

            // Return normalized Y relative to dynamicWorldHeight
            return { video, xNorm, yNorm: expandedY / dynamicWorldHeight, baseSize };
        });

        positions.sort((a, b) => b.baseSize - a.baseSize);
        return positions;
    }, [videos, stats, scalingMode, monthLayouts, amplifierLevel, dynamicWorldHeight, localStats]);

    // Handle Auto Fit
    const handleAutoFit = useCallback(() => {
        if (videos.length === 0 || !containerRef.current) return;

        const container = containerRef.current;
        const viewportWidth = container.clientWidth;
        const viewportHeight = container.clientHeight;

        if (viewportWidth <= 0 || viewportHeight <= 0) return;

        // Auto Fit: Use uniform scale to fit content

        const contentWidth = worldWidth * fitScale;
        const contentHeight = dynamicWorldHeight * fitScale;

        // Center both horizontally and vertically (but respect Header)
        const newOffsetX = (viewportWidth - contentWidth) / 2;
        const newOffsetY = HEADER_HEIGHT + ((viewportHeight - HEADER_HEIGHT) - contentHeight) / 2;

        const newState = { scale: fitScale, offsetX: newOffsetX, offsetY: newOffsetY };

        transformRef.current = newState;
        syncToDom();
        setTimelineConfig({
            zoomLevel: fitScale,
            offsetX: newOffsetX,
            offsetY: newOffsetY,
            isCustomView: false
        });
    }, [videos.length, setTimelineConfig, worldWidth, minScale, syncToDom]);

    // Auto-fit on load
    useEffect(() => {
        if (!isCustomView) {
            handleAutoFit();
        }
    }, [handleAutoFit, isCustomView]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const key = e.key.toLowerCase();
            if (key === 'z' || key === 'я') {
                e.preventDefault();
                handleAutoFit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleAutoFit]);

    // Wheel Handler
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
        if (viewportWidth === 0) return;

        if (e.ctrlKey || e.metaKey) {
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const ZOOM_SENSITIVITY = 0.01;
            const delta = Math.max(-100, Math.min(100, e.deltaY));

            const currentScale = transformRef.current.scale;
            const scaleFactor = Math.exp(-delta * ZOOM_SENSITIVITY);

            // Enforce Minimum Scale (The "Fit" state)
            // User cannot zoom out further than the fit state
            const newScale = Math.max(minScale, Math.min(10, currentScale * scaleFactor));
            const scaleRatio = newScale / currentScale;

            // Zoom towards mouse point
            const newOffsetX = mouseX - (mouseX - transformRef.current.offsetX) * scaleRatio;
            const newOffsetY = mouseY - (mouseY - transformRef.current.offsetY) * scaleRatio;

            const clamped = clampTransform({
                scale: newScale,
                offsetX: newOffsetX,
                offsetY: newOffsetY
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            syncToDom();
        } else {
            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: transformRef.current.offsetX - e.deltaX,
                offsetY: transformRef.current.offsetY - e.deltaY
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            syncToDom();
        }
    }, [clampTransform, syncToDom, minScale]);

    // Mouse Pan Handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0 && !hoveredVideo) {
            setIsPanning(true);
            isPanningRef.current = true;
            panStartRef.current = {
                x: e.clientX - transformRef.current.offsetX,
                y: e.clientY - transformRef.current.offsetY
            };
        }
    }, [hoveredVideo]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanningRef.current) {
            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0) return;

            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: e.clientX - panStartRef.current.x,
                offsetY: e.clientY - panStartRef.current.y
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            syncToDom();
        }
    }, [clampTransform, syncToDom]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        isPanningRef.current = false;
    }, []);

    // Events attachment
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const gestureHandler = (e: Event) => e.preventDefault();
        container.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('gesturestart', gestureHandler);
        document.addEventListener('gesturechange', gestureHandler);
        document.addEventListener('gestureend', gestureHandler);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            document.removeEventListener('gesturestart', gestureHandler);
            document.removeEventListener('gesturechange', gestureHandler);
            document.removeEventListener('gestureend', gestureHandler);
        };
    }, [handleWheel]);

    // Derived regions for Background/Header
    const monthRegions: MonthRegion[] = useMemo(() => {
        if (videos.length === 0 || monthLayouts.length === 0) return [];
        let prevYear: number | null = null;
        return monthLayouts.map(layout => {
            const isFirstOfYear = layout.year !== prevYear;
            prevYear = layout.year;
            return {
                month: layout.label,
                year: layout.year,
                startX: layout.startX,
                endX: layout.endX,
                center: (layout.startX + layout.endX) / 2,
                isFirstOfYear
            };
        });
    }, [monthLayouts, videos.length]);

    const yearMarkers: YearMarker[] = useMemo(() => {
        const years: YearMarker[] = [];
        let currentYear: number | null = null;
        let yearStart = 0;
        let yearEnd = 0;

        monthRegions.forEach((region, i) => {
            if (region.year !== currentYear) {
                if (currentYear !== null) {
                    years.push({ year: currentYear, startX: yearStart, endX: yearEnd });
                }
                currentYear = region.year;
                yearStart = region.startX;
            }
            yearEnd = region.endX;
            if (i === monthRegions.length - 1 && currentYear !== null) {
                years.push({ year: currentYear, startX: yearStart, endX: yearEnd });
            }
        });
        return years;
    }, [monthRegions]);

    // Helper for tooltip percentile - always calculate regardless of scaling mode
    const getPercentileGroup = useMemo(() => {
        if (videos.length === 0) return () => undefined;
        const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount);
        const rankMap = new Map<string, number>();
        sortedByViews.forEach((v, i) => {
            const percentile = (i / videos.length) * 100;
            rankMap.set(v.id, percentile);
        });
        return (videoId: string): string | undefined => {
            const percentile = rankMap.get(videoId);
            if (percentile === undefined) return undefined;
            if (percentile <= 1) return 'Top 1%';
            if (percentile <= 5) return 'Top 5%';
            if (percentile <= 20) return 'Top 20%';
            if (percentile <= 80) return 'Middle 60%';
            return 'Bottom 20%';
        };
    }, [videos]);

    return (
        <div
            ref={containerRef}
            className="w-full h-[calc(100vh-56px)] flex flex-col bg-bg-primary overflow-hidden relative"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Subtle Vertical Gradient Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-text-primary/[0.02] to-transparent" />

            <TimelineBackground
                monthRegions={monthRegions}
                transform={transformState} // Will fix interface in component
                worldWidth={worldWidth}
            />

            <TimelineVideoLayer
                ref={videoLayerRef}
                videoPositions={videoPositions}
                transform={transformState} // Will fix interface in component
                worldWidth={worldWidth}
                worldHeight={dynamicWorldHeight}
                style={{
                    // No counter-scaling needed for true 2D zoom
                } as React.CSSProperties}
                getPercentileGroup={getPercentileGroup}
                amplifierLevel={amplifierLevel}
                onHoverVideo={(data) => {
                    if (data) {
                        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                        setHoveredVideo(data);
                    } else {
                        // Delay hiding to allow mouse to reach tooltip
                        hideTimeoutRef.current = setTimeout(() => {
                            if (!isTooltipHoveredRef.current) {
                                setHoveredVideo(null);
                            }
                        }, 150);
                    }
                }}
                setAddChannelModalOpen={setAddChannelModalOpen}
            />

            <AmplifierSlider
                amplifierLevel={amplifierLevel}
                onChange={(level) => setTimelineConfig({ amplifierLevel: level })}
            />
            <ZoomIndicator scale={transformState.scale} onReset={handleAutoFit} />

            {/* DEBUG OVERLAY */}
            <div className="absolute bottom-4 left-4 bg-black/80 text-white font-mono text-xs p-2 rounded pointer-events-none z-50">
                <div>Scale: {transformState.scale.toFixed(3)}</div>
                <div>Offset X: {transformState.offsetX.toFixed(0)}</div>
                <div>Offset Y: {transformState.offsetY.toFixed(0)}</div>
                <div>VP: {Math.round(viewportSize.width)}x{Math.round(viewportSize.height)}</div>
            </div>

            {/* Tooltip */}
            {hoveredVideo && (
                <TrendTooltip
                    video={hoveredVideo.video}
                    percentileGroup={getPercentileGroup(hoveredVideo.video.id)}
                    style={{
                        left: hoveredVideo.x,
                        top: hoveredVideo.y < 350 ? hoveredVideo.y + hoveredVideo.height + 16 : hoveredVideo.y - 16,
                        transform: hoveredVideo.y < 350 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
                    }}
                    onMouseEnter={() => {
                        isTooltipHoveredRef.current = true;
                        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                    }}
                    onMouseLeave={() => {
                        isTooltipHoveredRef.current = false;
                        setHoveredVideo(null);
                    }}
                />
            )}

            {/* Header rendered LAST to stay on top */}
            <TimelineDateHeader
                yearMarkers={yearMarkers}
                monthRegions={monthRegions}
                transform={transformState}
                worldWidth={worldWidth}
            />
        </div>
    );
};

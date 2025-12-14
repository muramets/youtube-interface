import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTrendStore } from '../../../stores/trendStore';
import { RotateCcw } from 'lucide-react';

import { TrendTooltip } from './TrendTooltip';

interface VideoNode {
    id: string;
    title: string;
    thumbnail: string;
    viewCount: number;
    publishedAt: string;
    publishedAtTimestamp: number;
    description?: string;
    tags?: string[];
    channelId: string;
    channelTitle?: string;
}

interface Transform {
    scale: number;
    offsetX: number;
    offsetY: number;
}

interface TimelineCanvasProps {
    videos: VideoNode[];
}

// Constants for "world" coordinate system
const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;
const HEADER_HEIGHT = 48;
const PADDING = 40;

// World dimensions (used in multiple places)
// Width is now dynamic
const WORLD_HEIGHT = 1000;



import { useDebounce } from '../../../hooks/useDebounce';

// ... (previous imports)

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ videos }) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen } = useTrendStore();
    const { scalingMode, isCustomView, zoomLevel, offsetX, offsetY } = timelineConfig;

    // Refs for imperative access (perf optimization)
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const bgRef = useRef<HTMLDivElement>(null);

    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Initial ResizeObserver to cache size
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                containerSizeRef.current = {
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                };
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const [hoveredVideo, setHoveredVideo] = useState<{ video: VideoNode; x: number; y: number; height: number } | null>(null);

    // Drag-to-pan state
    const [isPanning, setIsPanning] = useState(false);
    const isPanningRef = useRef(false); // Ref for event handlers
    const panStartRef = useRef({ x: 0, y: 0 });

    // Cache viewport size to avoid reflows during zoom (120Hz optimization)
    const containerSizeRef = useRef({ width: 0, height: 0 });

    // Transform state: Mutable ref for high-perf updates + React state for sync
    const transformRef = useRef<Transform>({
        scale: Math.max(0.1, zoomLevel || 1),
        offsetX: offsetX || 0,
        offsetY: offsetY || 0
    });

    // Keep React state for non-critical UI (like zoom label)
    const [transformState, setTransformState] = useState<Transform>(transformRef.current);

    // Dynamic World Width - HOISTED to top for access in syncToDom
    const worldWidth = useMemo(() => {
        if (videos.length === 0) return 2000;

        // Calculate total width based on "Generous Expansion"
        // Each video needs ~60px width + gaps. 
        // We will sum up the widths of all months.

        // Quick pre-calc (full logic repeated in monthLayouts but we need width first)
        // Actually, we can move the width calculation into monthLayouts and return { layouts, totalWidth }
        // BUT monthLayouts depends on stats which depends on videos.
        // Let's keep it simple: Estimate roughly or move logic?

        // Better: Let monthLayouts drive the width?
        // But worldWidth is used BEFORE monthLayouts in the component (for clamping).
        // Let's duplicate the counting logic briefly or just make monthLayouts the source of truth
        // and have worldWidth be derived?
        // We can't easily hoist monthLayouts before worldWidth if worldWidth is needed for Clamp.

        // COMPROMISE: We'll calculate the counts here.
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
            // Generous width: AT LEAST 200px, plus 60px per video
            const width = Math.max(200, count * 80); // 80px per video for plenty of space
            totalWidth += width;
            current.setMonth(current.getMonth() + 1);
        }

        return Math.max(2000, totalWidth);
    }, [videos]);

    // Helper to apply transforms imperatively to DOM
    const syncToDom = useCallback(() => {
        const { scale, offsetX, offsetY } = transformRef.current;
        // width unused

        requestAnimationFrame(() => {
            // 1. Content Layer
            if (contentRef.current) {
                contentRef.current.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
            }
            // 2. Header Layer (Sticky X, Fixed Y)
            if (headerRef.current) {
                headerRef.current.style.transform = `translate3d(${offsetX}px, 0, 0) scaleX(${scale})`;
            }
            // 3. Background Layer
            if (bgRef.current) {
                bgRef.current.style.transform = `translate3d(${offsetX}px, 0, 0) scaleX(${scale})`;
            }
        });
    }, []); // worldWidth removed from deps as it's not used inside

    // Initial sync
    useEffect(() => {
        syncToDom();
    }, [syncToDom]);

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

        const layouts: {
            year: number;
            month: number;
            monthKey: string;
            label: string;
            count: number;
            startX: number;
            endX: number;
            width: number;
            startTs: number;
            endTs: number;
        }[] = [];

        // Determine range stats (re-calculated to be safe or reuse stats?)
        // reusing stats is safer for consistency
        let current = new Date(stats.minDate);
        current.setDate(1); // align to start of month
        current.setHours(0, 0, 0, 0);

        const endDate = new Date(stats.maxDate);
        const safeEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);

        // First pass: Calculate absolute widths
        const absLayouts: typeof layouts = [];
        let totalAbsWidth = 0;

        while (current < safeEndDate) {
            const year = current.getFullYear();
            const month = current.getMonth();
            const key = `${year}-${month}`;
            const count = counts.get(key) || 0;

            // ABSOLUTE WIDTH CALCULATION (Generous Expansion)
            // 200px min width for empty months, 80px per video for dense months
            const absWidth = Math.max(200, count * 80);

            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);

            absLayouts.push({
                year,
                month,
                monthKey: key,
                label: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                count,
                startX: totalAbsWidth, // Temporary absolute X
                endX: totalAbsWidth + absWidth, // Temporary absolute EndX
                width: absWidth,
                startTs: current.getTime(),
                endTs: nextMonth.getTime()
            });

            totalAbsWidth += absWidth;
            current = nextMonth;
        }

        // Second pass: Normalize to 0-1 range for the rest of the app logic
        // The `worldWidth` calculated earlier *should* match `totalAbsWidth` closely,
        // but we'll use `totalAbsWidth` here to be self-consistent.

        return absLayouts.map(l => ({
            ...l,
            startX: l.startX / totalAbsWidth,
            endX: l.endX / totalAbsWidth,
            width: l.width / totalAbsWidth
        }));
    }, [videos, stats]);



    // Helper to clamp transform so content stays visible
    // Helper to clamp transform so content stays visible
    const clampTransform = useCallback((
        t: { scale: number; offsetX: number; offsetY: number },
        viewportWidth: number,
        viewportHeight: number
    ): { scale: number; offsetX: number; offsetY: number } => {
        const scaledWidth = worldWidth * t.scale;
        const scaledHeight = WORLD_HEIGHT * t.scale;
        const viewportH = viewportHeight - HEADER_HEIGHT;

        // Visibility constraint
        const VISIBILITY_RATIO = 0.74;

        const minVisibleX = Math.min(scaledWidth, viewportWidth) * VISIBILITY_RATIO;
        const minVisibleY = Math.min(scaledHeight, viewportH) * VISIBILITY_RATIO;

        const maxOffsetX = viewportWidth - minVisibleX;
        const minOffsetX = minVisibleX - scaledWidth;

        const maxOffsetY = viewportH - minVisibleY;
        const minOffsetY = minVisibleY - scaledHeight;

        return {
            scale: t.scale,
            offsetX: Math.max(minOffsetX, Math.min(maxOffsetX, t.offsetX)),
            offsetY: Math.max(minOffsetY, Math.min(maxOffsetY, t.offsetY))
        };
    }, [worldWidth]);

    // Calculate "world" coordinates for each video 
    // STRICT CHRONOLOGICAL ORDERING (Removed collision resolution)
    const videoPositions = useMemo(() => {
        const viewRangeLinear = stats.maxViews - stats.minViews || 1;
        const viewRangeLog = Math.log(stats.maxViews) - Math.log(stats.minViews) || 1;

        // Calculate positions
        const positions = videos.map(video => {
            // Find the month layout for this video
            const d = new Date(video.publishedAtTimestamp);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            const layout = monthLayouts.find(l => l.monthKey === key);

            let xNorm: number;

            if (layout) {
                // Calculate position WITHIN the month
                const monthDuration = layout.endTs - layout.startTs;
                const offsetInMonth = video.publishedAtTimestamp - layout.startTs;
                const localProgress = Math.max(0, Math.min(1, offsetInMonth / monthDuration));

                // Map to global X
                xNorm = layout.startX + (localProgress * layout.width);
            } else {
                const dateRange = stats.maxDate - stats.minDate || 1;
                xNorm = (video.publishedAtTimestamp - stats.minDate) / dateRange;
            }

            let yNorm: number;
            if (scalingMode === 'linear') {
                yNorm = 1 - (video.viewCount - stats.minViews) / viewRangeLinear;
            } else {
                const viewLog = Math.log(Math.max(1, video.viewCount));
                const minLog = Math.log(stats.minViews);
                yNorm = 1 - (viewLog - minLog) / viewRangeLog;
            }

            let sizeRatio: number;
            if (scalingMode === 'linear') {
                sizeRatio = video.viewCount / stats.maxViews;
            } else {
                const viewLog = Math.log(Math.max(1, video.viewCount));
                const minLog = Math.log(stats.minViews);
                const maxLog = Math.log(stats.maxViews);
                sizeRatio = (viewLog - minLog) / (maxLog - minLog);
            }
            const baseSize = MIN_THUMBNAIL_SIZE + sizeRatio * (BASE_THUMBNAIL_SIZE - MIN_THUMBNAIL_SIZE);

            return { video, xNorm, yNorm, baseSize };
        });

        // Sort by X (Time) purely for rendering order (z-index implicit)
        // Actually rendering order should maybe be by ViewCount (small on top?) or Reverse ViewCount?
        // Let's render smaller videos later so they are on top
        positions.sort((a, b) => b.baseSize - a.baseSize); // Largest first, Smallest last (on top)

        return positions;
    }, [videos, stats, scalingMode, monthLayouts]);



    // Reusable auto-fit logic
    // Reusable auto-fit logic
    const handleAutoFit = useCallback(() => {
        if (videos.length === 0 || !containerRef.current) return;

        const container = containerRef.current;
        const viewportWidth = container.clientWidth;
        const viewportHeight = container.clientHeight - HEADER_HEIGHT;

        if (viewportWidth <= 0 || viewportHeight <= 0) return;

        const scaleX = (viewportWidth - PADDING * 2) / worldWidth;
        const scaleY = (viewportHeight - PADDING * 2) / WORLD_HEIGHT;
        const fitScale = Math.min(scaleX, scaleY);

        const contentWidth = worldWidth * fitScale;
        const contentHeight = WORLD_HEIGHT * fitScale;
        const newOffsetX = (viewportWidth - contentWidth) / 2;
        const newOffsetY = (viewportHeight - contentHeight) / 2;

        const newState = { scale: fitScale, offsetX: newOffsetX, offsetY: newOffsetY };

        // Update Ref & DOM
        transformRef.current = newState;
        syncToDom();

        // Update React State
        setTransformState(newState);

        setTimelineConfig({
            zoomLevel: fitScale,
            offsetX: newOffsetX,
            offsetY: newOffsetY,
            isCustomView: false
        });
    }, [videos.length, setTimelineConfig, worldWidth, syncToDom]);

    // Auto-fit on load
    useEffect(() => {
        if (!isCustomView) {
            handleAutoFit();
        }
    }, [handleAutoFit, isCustomView]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only trigger if not typing in an input
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

    // Scroll-to-pan + Intelligent Zoom handler (velocity-based)
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
            // Use cached size
            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0 || viewportHeight === 0) return;

            // Approximate mouse position relative to container (without getBoundingClientRect)
            // We can't perfectly get mouseX/Y without reading DOM, but for trackpad zoom,
            // we can assume center or use e.layerX/Y if available or just clamp.
            // BETTER: Read DOM *once* on mouse move and cache it? 
            // OR: Just accept one read per frame? 
            // actually getBoundingClientRect IS expensive.
            // Let's use e.offsetX / e.offsetY if available on the event target?
            // Native WheelEvent doesn't always have offsetX relative to the specific container if it bubbled.
            // Compromise: Read rect only if we absolutely must, but try to rely on cache.

            // For 120Hz perfection, we should cache the rect position too, but it changes on scroll??
            // Actually, if the container is full screen...
            // Let's stick to standard behavior for now but use cached Dimensions at least.

            const container = containerRef.current;
            if (!container) return;

            // optimization: only call getBoundingClientRect if needed
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top - HEADER_HEIGHT;

            // Standard exponential zoom
            const ZOOM_SENSITIVITY = 0.01;
            const delta = Math.max(-100, Math.min(100, e.deltaY));

            const currentScale = transformRef.current.scale;
            const newScale = Math.max(0.1, Math.min(10, currentScale * Math.exp(-delta * ZOOM_SENSITIVITY)));
            const scaleRatio = newScale / currentScale;

            const clamped = clampTransform({
                scale: newScale,
                offsetX: mouseX - (mouseX - transformRef.current.offsetX) * scaleRatio,
                offsetY: mouseY - (mouseY - transformRef.current.offsetY) * scaleRatio
            }, viewportWidth, viewportHeight); // Use CACHED width/height

            // Imperative Update
            transformRef.current = clamped;
            syncToDom();

            // Sync to UI state occasionally
            setTransformState(clamped);

        } else {
            // Use cached size
            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0) return;

            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: transformRef.current.offsetX - e.deltaX,
                offsetY: transformRef.current.offsetY - e.deltaY
            }, viewportWidth, viewportHeight); // Use CACHED width/height

            // Imperative Update
            transformRef.current = clamped;
            syncToDom();

            // Sync to UI state
            setTransformState(clamped);
        }
    }, [clampTransform, syncToDom]);

    // Mouse drag-to-pan handlers
    // Mouse drag-to-pan handlers
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
            // Use cached size optimization
            const { width: viewportWidth, height: viewportHeight } = containerSizeRef.current;
            if (viewportWidth === 0) return;

            const clamped = clampTransform({
                ...transformRef.current,
                offsetX: e.clientX - panStartRef.current.x,
                offsetY: e.clientY - panStartRef.current.y
            }, viewportWidth, viewportHeight);

            transformRef.current = clamped;
            syncToDom();
            setTransformState(clamped);
        }
    }, [clampTransform, syncToDom]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        isPanningRef.current = false;
    }, []);



    // Attach non-passive wheel listener
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

    // Generate month regions for background - NOW USING DYNAMIC LAYOUTS
    const monthRegions = useMemo(() => {
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

    // Generate year markers from month regions
    const yearMarkers = useMemo(() => {
        const years: { year: number; startX: number; endX: number }[] = [];
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

    // Debug logging for regions and positions
    useEffect(() => {
        if (monthRegions.length > 0) {
            console.log('[TimelineCanvas Debug] Month Regions:', monthRegions.map(r => ({
                month: r.month,
                year: r.year,
                startX: r.startX.toFixed(4),
                endX: r.endX.toFixed(4)
            })));
        }

        if (videoPositions.length > 0) {
            const sample = videoPositions.slice(0, 5).map(p => ({
                title: p.video.title,
                date: new Date(p.video.publishedAtTimestamp).toLocaleDateString(),
                xNorm: p.xNorm.toFixed(4)
            }));
            console.log('[TimelineCanvas Debug] First 5 Videos:', sample);
        }
    }, [monthRegions, videoPositions]);

    // Format views like "1.2M"
    const formatCompactNumber = (num: number) => {
        return new Intl.NumberFormat('en-US', {
            notation: "compact",
            maximumFractionDigits: 1
        }).format(num);
    };

    // Updated text counter scale to use state
    // const textCounterScale = 1 / transformState.scale; // UNUSED

    const [focusedVideoId, setFocusedVideoId] = useState<string | null>(null);

    return (
        <div
            ref={containerRef}
            className="w-full h-[calc(100vh-56px)] flex flex-col bg-gradient-to-b from-[#181818] to-[#0a0a0a] overflow-hidden relative"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Sticky Date Header */}
            <div
                className="absolute top-0 left-0 right-0 h-12 bg-[#1a1a1a]/80 backdrop-blur-md border-b border-white/10 z-30 overflow-hidden"
            >
                <div
                    ref={headerRef}
                    style={{
                        transform: `translateX(${transformState.offsetX}px) scaleX(${transformState.scale})`,
                        transformOrigin: '0 0',
                        width: worldWidth,
                        height: '100%',
                        position: 'relative'
                    }}
                >
                    {/* Year Row */}
                    {yearMarkers.map((yearMarker) => (
                        <div
                            key={`year-${yearMarker.year}`}
                            className="absolute h-5 flex items-center justify-center border-l border-white/20"
                            style={{
                                left: `${yearMarker.startX * 100}%`,
                                width: `${(yearMarker.endX - yearMarker.startX) * 100}%`,
                                top: 0
                            }}
                        >
                            <span
                                className="text-xs font-bold text-white/70 tracking-widest"
                                style={{
                                    transform: `scaleX(${1 / transformState.scale})`,
                                    transformOrigin: 'center',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {yearMarker.year}
                            </span>
                        </div>
                    ))}

                    {/* Month Row */}
                    {monthRegions.map((region) => (
                        <div
                            key={`header-${region.month}-${region.year}`}
                            className="absolute h-7 flex items-center justify-center border-l border-white/10"
                            style={{
                                left: `${region.startX * 100}%`,
                                width: `${(region.endX - region.startX) * 100}%`,
                                top: 20
                            }}
                        >
                            <span
                                className="text-[10px] font-medium text-text-tertiary tracking-wider"
                                style={{
                                    transform: `scaleX(${1 / transformState.scale})`,
                                    transformOrigin: 'center',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {region.month}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Month Background Columns */}
            <div
                className="absolute inset-0 top-12 pointer-events-none overflow-hidden z-0"
            >
                <div
                    ref={bgRef}
                    style={{
                        transform: `translateX(${transformState.offsetX}px) scaleX(${transformState.scale})`,
                        transformOrigin: '0 0',
                        width: worldWidth,
                        height: '100%',
                        position: 'relative'
                    }}
                >
                    {monthRegions.map((region, i) => (
                        <div
                            key={`bg-${region.month}-${region.year}`}
                            className={`h-full border-l border-white/5 ${i % 2 === 0 ? 'bg-white/[0.015]' : 'bg-transparent'}`}
                            style={{
                                position: 'absolute',
                                left: `${region.startX * 100}%`,
                                width: `${(region.endX - region.startX) * 100}%`
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Infinite Canvas Container */}
            <div className="flex-1 relative overflow-hidden mt-12">
                <div
                    ref={contentRef}
                    style={{
                        transform: `translate(${transformState.offsetX}px, ${transformState.offsetY}px) scale(${transformState.scale})`,
                        transformOrigin: '0 0',
                        width: worldWidth,
                        height: WORLD_HEIGHT,
                        position: 'absolute',
                        willChange: 'transform'
                    }}
                >
                    {videoPositions.map(({ video, xNorm, yNorm, baseSize }, index) => {
                        const x = xNorm * worldWidth;
                        const y = yNorm * (WORLD_HEIGHT - 50) + 25;
                        const width = baseSize;
                        const height = baseSize / (16 / 9);
                        const borderRadius = Math.max(3, Math.min(12, 8));
                        const viewLabel = formatCompactNumber(video.viewCount);

                        return (
                            <div
                                key={video.id}
                                className="absolute cursor-pointer group flex flex-col items-center transition-all duration-200"
                                style={{
                                    left: x,
                                    top: y,
                                    width: width,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: focusedVideoId === video.id ? 1000 : 10 + index
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onMouseEnter={(e) => {
                                    setFocusedVideoId(video.id); // Instant Z-Index change

                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

                                    const rect = e.currentTarget.getBoundingClientRect();

                                    // Delay showing the tooltip
                                    showTimeoutRef.current = setTimeout(() => {
                                        setHoveredVideo({
                                            video,
                                            x: rect.left + rect.width / 2,
                                            y: rect.top,
                                            height: rect.height
                                        });
                                    }, 500);
                                }}
                                onMouseLeave={() => {
                                    setFocusedVideoId(null); // Instant Z-Index reset

                                    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);

                                    hoverTimeoutRef.current = setTimeout(() => {
                                        setHoveredVideo(null);
                                    }, 200); // 200ms grace period
                                }}
                            >
                                <div
                                    className="overflow-hidden group-hover:scale-105 transition-transform duration-200 ease-out shadow-lg group-hover:shadow-2xl group-hover:shadow-white/10 bg-black/50 w-full"
                                    style={{
                                        height,
                                        borderRadius: `${borderRadius}px`,
                                        backgroundImage: `url(${video.thumbnail})`,
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                    }}
                                />
                                <span className="mt-1.5 text-[10px] font-medium text-white/50 group-hover:text-white transition-colors bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm pointer-events-none whitespace-nowrap">
                                    {viewLabel}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {videos.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-[#555] text-lg mb-2">No videos to display</div>
                            <div className="text-[#555] text-sm">
                                <span
                                    onClick={() => setAddChannelModalOpen(true)}
                                    className="text-[#AAAAAA] hover:text-white transition-colors hover:underline cursor-pointer"
                                >
                                    Add channels
                                </span>
                                {" and sync data"}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Right Zoom Indicator & Controls */}
            <div className="absolute bottom-4 right-6 pointer-events-auto z-50 flex flex-col items-end gap-2 group">
                {/* Hotkey Hint */}
                <div className="flex items-center gap-2 text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out translate-y-2 group-hover:translate-y-0 pointer-events-none">
                    <span className="px-1.5 py-0.5 bg-[#2a2a2a] border border-white/10 rounded text-text-secondary font-mono">z</span>
                    <span>reset</span>
                </div>

                <div className="flex items-center bg-[#1a1a1a]/90 backdrop-blur-md border border-white/10 rounded-full px-1.5 py-1">
                    <span className="text-xs pl-2 pr-1 text-text-secondary font-mono text-right tabular-nums">
                        {(transformState.scale * 100).toFixed(0)}%
                    </span>
                    <div className="w-[1px] h-3 bg-white/10 mx-1" />
                    <button
                        onClick={handleAutoFit}
                        className="p-1 hover:bg-white/10 rounded-full text-text-tertiary hover:text-white transition-colors"
                    >
                        <RotateCcw size={12} />
                    </button>
                </div>
            </div>

            {/* Tooltip */}
            {
                hoveredVideo && (
                    <TrendTooltip
                        video={hoveredVideo.video}
                        style={{
                            left: hoveredVideo.x,
                            top: hoveredVideo.y < 350 ? hoveredVideo.y + hoveredVideo.height + 16 : hoveredVideo.y - 16,
                            transform: hoveredVideo.y < 350 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
                        }}
                        onMouseEnter={() => {
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        }}
                        onMouseLeave={() => {
                            hoverTimeoutRef.current = setTimeout(() => {
                                setHoveredVideo(null);
                            }, 200);
                        }}
                    />
                )
            }
        </div >
    );
};

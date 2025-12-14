import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendService } from '../../../services/trendService';
import { Settings } from 'lucide-react';

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

// Constants for "world" coordinate system
const BASE_THUMBNAIL_SIZE = 200;
const MIN_THUMBNAIL_SIZE = 40;
const HEADER_HEIGHT = 48;
const PADDING = 40;

export const TimelineCanvas: React.FC = () => {
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig } = useTrendStore();
    const { scalingMode } = timelineConfig;

    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const [videos, setVideos] = useState<VideoNode[]>([]);
    const [hoveredVideo, setHoveredVideo] = useState<{ video: VideoNode; x: number; y: number } | null>(null);
    const [showSettings, setShowSettings] = useState(false);

    // Drag-to-pan state
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    // Transform state: scale + pan offsets
    const [transform, setTransform] = useState<Transform>({
        scale: 1,
        offsetX: 0,
        offsetY: 0
    });

    // Get visible channels based on mode
    const visibleChannels = useMemo(() => {
        if (selectedChannelId) {
            return channels.filter(c => c.id === selectedChannelId);
        }
        return channels.filter(c => c.isVisible);
    }, [channels, selectedChannelId]);

    // Load videos from all visible channels
    useEffect(() => {
        const loadVideos = async () => {
            const allVideos: VideoNode[] = [];
            for (const channel of visibleChannels) {
                const channelVideos = await TrendService.getChannelVideosFromCache(channel.id);
                allVideos.push(...channelVideos.map(v => ({
                    ...v,
                    channelTitle: channel.title
                })));
            }
            allVideos.sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);
            setVideos(allVideos);
        };
        loadVideos();
    }, [visibleChannels]);

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

    // Calculate "world" coordinates for each video with collision detection
    const videoPositions = useMemo(() => {
        const dateRange = stats.maxDate - stats.minDate || 1;
        const viewRangeLinear = stats.maxViews - stats.minViews || 1;
        const viewRangeLog = Math.log(stats.maxViews) - Math.log(stats.minViews) || 1;

        // Helper to check if two videos are on the same day
        const isSameDay = (ts1: number, ts2: number) => {
            const d1 = new Date(ts1);
            const d2 = new Date(ts2);
            return d1.getFullYear() === d2.getFullYear() &&
                d1.getMonth() === d2.getMonth() &&
                d1.getDate() === d2.getDate();
        };

        // Helper to check if views are similar (within 50% of each other)
        const hasSimilarViews = (v1: number, v2: number) => {
            const ratio = Math.max(v1, v2) / Math.min(v1, v2);
            return ratio < 1.5;
        };

        // First pass: calculate base positions and sizes
        const initialPositions = videos.map(video => {
            const xNorm = (video.publishedAtTimestamp - stats.minDate) / dateRange;

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

        // World dimensions (same as defined below)
        const worldW = 2000;
        const worldH = 1000;
        const MIN_GAP = 10; // Minimum gap between videos in world pixels

        // Second pass: resolve horizontal collisions
        // Process in order of x position (left to right)
        const sorted = [...initialPositions].sort((a, b) => a.xNorm - b.xNorm);
        const resolved: typeof initialPositions = [];

        for (const current of sorted) {
            let finalX = current.xNorm * worldW;
            const currentWidth = current.baseSize;
            const currentY = current.yNorm * (worldH - 50) + 25;
            const currentHeight = currentWidth / (16 / 9);

            // Check against all previously placed videos
            for (const placed of resolved) {
                const placedX = placed.xNorm * worldW;
                const placedWidth = placed.baseSize;
                const placedY = placed.yNorm * (worldH - 50) + 25;
                const placedHeight = placedWidth / (16 / 9);

                // Calculate horizontal overlap
                const currentLeft = finalX - currentWidth / 2;
                const currentRight = finalX + currentWidth / 2;
                const placedLeft = placedX - placedWidth / 2;
                const placedRight = placedX + placedWidth / 2;

                // Calculate vertical overlap
                const currentTop = currentY - currentHeight / 2;
                const currentBottom = currentY + currentHeight / 2;
                const placedTop = placedY - placedHeight / 2;
                const placedBottom = placedY + placedHeight / 2;

                const horizontalOverlap = currentLeft < placedRight + MIN_GAP && currentRight > placedLeft - MIN_GAP;
                const verticalOverlap = currentTop < placedBottom && currentBottom > placedTop;

                // Only resolve if there's actual 2D overlap
                if (horizontalOverlap && verticalOverlap) {
                    // Check if they should be allowed to overlap
                    const sameDay = isSameDay(current.video.publishedAtTimestamp, placed.video.publishedAtTimestamp);
                    const similarViews = hasSimilarViews(current.video.viewCount, placed.video.viewCount);

                    if (!(sameDay && similarViews)) {
                        // Push current video to the right
                        const requiredX = placedRight + MIN_GAP + currentWidth / 2;
                        finalX = Math.max(finalX, requiredX);
                    }
                }
            }

            // Update xNorm based on resolved position
            const resolvedXNorm = finalX / worldW;

            resolved.push({
                ...current,
                xNorm: resolvedXNorm
            });
        }

        // Re-sort by original video order for stable rendering
        const videoIdOrder = new Map(videos.map((v, i) => [v.id, i]));
        resolved.sort((a, b) => (videoIdOrder.get(a.video.id) ?? 0) - (videoIdOrder.get(b.video.id) ?? 0));

        return resolved;
    }, [videos, stats, scalingMode]);

    // World dimensions
    const worldWidth = 2000;
    const worldHeight = 1000;

    // Auto-fit on load
    useEffect(() => {
        if (videos.length === 0 || !containerRef.current) return;

        const container = containerRef.current;
        const viewportWidth = container.clientWidth;
        const viewportHeight = container.clientHeight - HEADER_HEIGHT;

        if (viewportWidth <= 0 || viewportHeight <= 0) return;

        const scaleX = (viewportWidth - PADDING * 2) / worldWidth;
        const scaleY = (viewportHeight - PADDING * 2) / worldHeight;
        const fitScale = Math.min(scaleX, scaleY);

        const contentWidth = worldWidth * fitScale;
        const contentHeight = worldHeight * fitScale;
        const offsetX = (viewportWidth - contentWidth) / 2;
        const offsetY = (viewportHeight - contentHeight) / 2;

        console.log('[Timeline] Auto-fit:', { viewportWidth, viewportHeight, fitScale, offsetX, offsetY });

        setTransform({ scale: fitScale, offsetX, offsetY });
    }, [videos.length, stats]);

    // Scroll-to-pan + Zoom handler
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        if (e.ctrlKey || e.metaKey) {
            const container = containerRef.current;
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top - HEADER_HEIGHT;

            const zoomFactor = 1 - e.deltaY * 0.002;
            const newScale = Math.max(0.1, Math.min(10, transform.scale * zoomFactor));
            const scaleRatio = newScale / transform.scale;

            setTransform({
                scale: newScale,
                offsetX: mouseX - (mouseX - transform.offsetX) * scaleRatio,
                offsetY: mouseY - (mouseY - transform.offsetY) * scaleRatio
            });
        } else {
            setTransform(t => ({
                ...t,
                offsetX: t.offsetX - e.deltaX,
                offsetY: t.offsetY - e.deltaY
            }));
        }
    }, [transform]);

    // Mouse drag-to-pan handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0 && !hoveredVideo) {
            setIsPanning(true);
            setPanStart({ x: e.clientX - transform.offsetX, y: e.clientY - transform.offsetY });
        }
    }, [transform.offsetX, transform.offsetY, hoveredVideo]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            setTransform(t => ({
                ...t,
                offsetX: e.clientX - panStart.x,
                offsetY: e.clientY - panStart.y
            }));
        }
    }, [isPanning, panStart]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
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

    // Generate month regions for background
    const monthRegions = useMemo(() => {
        if (videos.length === 0) return [];

        const regions: { month: string; year: number; startX: number; endX: number; center: number; isFirstOfYear: boolean }[] = [];
        const dateRange = stats.maxDate - stats.minDate;

        let current = new Date(stats.minDate);
        current.setDate(1);
        const endDate = new Date(stats.maxDate);
        let prevYear: number | null = null;

        while (current <= endDate) {
            const monthStart = current.getTime();
            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);
            const monthEnd = nextMonth.getTime();

            const visibleStart = Math.max(stats.minDate, monthStart);
            const visibleEnd = Math.min(stats.maxDate, monthEnd);

            if (visibleStart < visibleEnd) {
                const startX = (visibleStart - stats.minDate) / dateRange;
                const endX = (visibleEnd - stats.minDate) / dateRange;
                const isFirstOfYear = current.getFullYear() !== prevYear;
                regions.push({
                    month: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                    year: current.getFullYear(),
                    startX,
                    endX,
                    center: (startX + endX) / 2,
                    isFirstOfYear
                });
                prevYear = current.getFullYear();
            }
            current.setMonth(current.getMonth() + 1);
        }
        return regions;
    }, [stats, videos.length]);

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

    // Format views like "1.2M"
    const formatCompactNumber = (num: number) => {
        return new Intl.NumberFormat('en-US', {
            notation: "compact",
            maximumFractionDigits: 1
        }).format(num);
    };

    // Counter-scale for header text (inverse of scaleX so text remains readable)
    const textCounterScale = 1 / transform.scale;

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
            {/* Stats & Settings Overlay */}
            <div className="absolute top-2 right-6 flex items-center gap-3 z-50 pointer-events-auto">
                <span className="text-sm text-text-secondary">{videos.length} videos</span>
                <span className="text-xs px-2 py-1 bg-white/5 rounded-full backdrop-blur-md text-text-secondary">
                    {(transform.scale * 100).toFixed(0)}%
                </span>

                {/* Settings Gear */}
                <div className="relative">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowSettings(!showSettings);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-text-secondary hover:text-text-primary"
                    >
                        <Settings size={16} />
                    </button>

                    {showSettings && (
                        <div
                            className="absolute right-0 top-full mt-2 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl p-3 min-w-[200px]"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
                                Size Scaling
                            </div>
                            <div className="flex flex-col gap-1">
                                <button
                                    onClick={() => {
                                        setTimelineConfig({ scalingMode: 'linear' });
                                        setShowSettings(false);
                                    }}
                                    className={`px-3 py-2 rounded-md text-sm text-left transition-colors ${scalingMode === 'linear' ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-text-secondary'}`}
                                >
                                    Linear
                                    <span className="block text-[10px] text-text-tertiary">Proportional to views</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setTimelineConfig({ scalingMode: 'log' });
                                        setShowSettings(false);
                                    }}
                                    className={`px-3 py-2 rounded-md text-sm text-left transition-colors ${scalingMode === 'log' ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-text-secondary'}`}
                                >
                                    Logarithmic
                                    <span className="block text-[10px] text-text-tertiary">Less extreme differences</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sticky Date Header - Two rows: Year + Month */}
            <div
                className="absolute top-0 left-0 right-0 h-12 bg-[#1a1a1a]/80 backdrop-blur-md border-b border-white/10 z-30 overflow-hidden"
            >
                {/* Horizontal transform container */}
                <div
                    style={{
                        transform: `translateX(${transform.offsetX}px) scaleX(${transform.scale})`,
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
                                    transform: `scaleX(${textCounterScale})`,
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
                                    transform: `scaleX(${textCounterScale})`,
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

            {/* Month Background Columns - Screen height, not world height */}
            <div
                className="absolute inset-0 top-12 pointer-events-none overflow-hidden z-0"
            >
                <div
                    style={{
                        transform: `translateX(${transform.offsetX}px) scaleX(${transform.scale})`,
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
                {/* Transformed Content Layer - Videos Only */}
                <div
                    ref={contentRef}
                    style={{
                        transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
                        transformOrigin: '0 0',
                        width: worldWidth,
                        height: worldHeight,
                        position: 'absolute'
                    }}
                >
                    {/* Video Nodes */}
                    {videoPositions.map(({ video, xNorm, yNorm, baseSize }, index) => {
                        const x = xNorm * worldWidth;
                        const y = yNorm * (worldHeight - 50) + 25;
                        const width = baseSize;
                        const height = baseSize / (16 / 9);
                        const borderRadius = Math.max(3, Math.min(12, 8));
                        const viewLabel = formatCompactNumber(video.viewCount);

                        return (
                            <div
                                key={video.id}
                                className="absolute cursor-pointer hover:z-50 group flex flex-col items-center"
                                style={{
                                    left: x,
                                    top: y,
                                    width: width,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 10 + index
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredVideo({
                                        video,
                                        x: rect.left + rect.width / 2,
                                        y: rect.top
                                    });
                                }}
                                onMouseLeave={() => setHoveredVideo(null)}
                            >
                                {/* Thumbnail */}
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

                                {/* View Count Label */}
                                <span className="mt-1.5 text-[10px] font-medium text-white/50 group-hover:text-white transition-colors bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm pointer-events-none whitespace-nowrap">
                                    {viewLabel}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Empty State */}
                {videos.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            <div className="text-text-tertiary text-lg mb-2">No videos to display</div>
                            <div className="text-text-secondary text-sm">Add channels and sync data</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Tooltip (Fixed, not transformed) */}
            {hoveredVideo && (
                <div
                    className="fixed z-[200] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-4 pointer-events-none w-[340px] animate-fade-in"
                    style={{
                        left: hoveredVideo.x,
                        top: hoveredVideo.y - 16,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <div className="aspect-video w-full rounded-lg bg-black/40 mb-3 overflow-hidden border border-white/5">
                        <img src={hoveredVideo.video.thumbnail} className="w-full h-full object-cover" alt="" />
                    </div>

                    <div className="mb-2">
                        <div className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug">
                            {hoveredVideo.video.title}
                        </div>
                        {hoveredVideo.video.channelTitle && !selectedChannelId && (
                            <div className="text-xs text-text-tertiary mt-1">
                                {hoveredVideo.video.channelTitle}
                            </div>
                        )}
                        <div className="flex justify-between items-center mt-2 text-xs">
                            <span className="text-white font-bold px-2 py-1 bg-white/10 rounded-full">
                                {hoveredVideo.video.viewCount.toLocaleString()} views
                            </span>
                            <span className="text-text-secondary">
                                {new Date(hoveredVideo.video.publishedAt).toLocaleDateString()}
                            </span>
                        </div>
                    </div>

                    {hoveredVideo.video.description && (
                        <div className="text-xs text-text-secondary line-clamp-2 border-t border-white/5 pt-2 mt-2">
                            {hoveredVideo.video.description}
                        </div>
                    )}

                    {hoveredVideo.video.tags && hoveredVideo.video.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                            {hoveredVideo.video.tags.slice(0, 5).map((tag: string) => (
                                <span key={tag} className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] text-text-tertiary">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

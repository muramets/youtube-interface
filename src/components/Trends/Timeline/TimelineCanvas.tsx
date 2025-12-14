import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendService } from '../../../services/trendService';

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

export const TimelineCanvas: React.FC = () => {
    const { channels, selectedChannelId, timelineConfig, setTimelineConfig } = useTrendStore();
    const { zoomLevel } = timelineConfig;

    const [videos, setVideos] = useState<VideoNode[]>([]);
    const [hoveredVideo, setHoveredVideo] = useState<{ video: VideoNode; x: number; y: number } | null>(null);

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
            // Sort by date
            allVideos.sort((a, b) => a.publishedAtTimestamp - b.publishedAtTimestamp);
            setVideos(allVideos);
        };
        loadVideos();
    }, [visibleChannels]);

    // Calculate stats for scaling - TIGHT range +/- 1 day buffer
    const stats = useMemo(() => {
        if (videos.length === 0) return { minViews: 0, maxViews: 0, minDate: Date.now(), maxDate: Date.now() };
        const views = videos.map(v => v.viewCount);
        const dates = videos.map(v => v.publishedAtTimestamp);

        // Add 12 hours buffer before/after to prevent edge clipping of the first/last video
        const buffer = 1000 * 60 * 60 * 12;

        return {
            minViews: Math.min(...views),
            maxViews: Math.max(...views),
            minDate: Math.min(...dates) - buffer,
            maxDate: Math.max(...dates) + buffer
        };
    }, [videos]);

    // Constant for spacing
    const MIN_PIXELS_PER_DAY = 320;
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const totalDays = Math.max(1, Math.ceil((stats.maxDate - stats.minDate) / MS_PER_DAY));

    // Auto-fit Zoom on Load
    useEffect(() => {
        if (videos.length === 0) return;

        // Calculate required zoom to fit everything in viewport
        // Available width approx window width (or generic 80% of it)
        const viewportWidth = window.innerWidth - 300; // Deduct sidebar estimate
        const requiredWidth = totalDays * MIN_PIXELS_PER_DAY;

        // targetZoom * requiredWidth = viewportWidth
        // targetZoom = viewportWidth / requiredWidth
        // Clamp to sensible min/max
        const fitZoom = Math.max(0.2, Math.min(1.5, viewportWidth / requiredWidth));

        console.log('[Timeline] Auto-fitting:', { totalDays, requiredWidth, viewportWidth, fitZoom });
        setTimelineConfig({ zoomLevel: fitZoom });
    }, [stats, videos.length, totalDays, setTimelineConfig]);

    // Zoom handler - Zoom to Cursor
    const handleWheel = useCallback((e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();

            const container = e.currentTarget as HTMLDivElement;
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const contentX = mouseX + container.scrollLeft;
            const totalWidth = container.scrollWidth;
            const percentage = contentX / totalWidth;

            const currentZoom = zoomLevel;
            // Restore zoom out capability, clamp to 0.2
            const newZoom = Math.max(0.2, Math.min(5, currentZoom + (e.deltaY * -0.003)));

            setTimelineConfig({ zoomLevel: newZoom });

            requestAnimationFrame(() => {
                const newTotalWidth = container.scrollWidth;
                const newScrollLeft = (percentage * newTotalWidth) - mouseX;
                container.scrollLeft = newScrollLeft;
            });
        }
    }, [zoomLevel, setTimelineConfig]);

    // Prevent default browser zoom with non-passive event listeners
    useEffect(() => {
        const container = document.getElementById('timeline-canvas');
        if (!container) return; // Wait for mount? Ref would be better but ID works for now.
        // Actually the container with ID 'timeline-canvas' is the outer wrapper!
        // We need the scrollable inner div for scrollLeft.
        // Let's attach the handler to the scrollable div if possible, OR
        // handle logic here but find the scrollable child.

        // The outer div is 'timeline-canvas'. The scrollable one is the child.
        // Let's attach directly to the scrollable div using a Ref?
        // For minimal code change, I'll attach to the outer but assume the scrollable element is user's target or query it.
        const scrollContainer = container.querySelector('.custom-scrollbar') as HTMLElement;
        if (!scrollContainer) return;

        // Actually, we can just use the React `onWheel` on the element if we set `passive: false`?
        // React doesn't support passive: false easily.
        // Let's use the native listener approach to prevent browser zoom,
        // AND trigger the zoom update.
        // Since we need state (zoomLevel), we can't easily do it in a static effect without re-binding.
        // Re-binding is fine.

        const strictWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                handleWheel(e);
            }
        };

        const gestureHandler = (e: Event) => e.preventDefault();

        scrollContainer.addEventListener('wheel', strictWheel, { passive: false });
        document.addEventListener('gesturestart', gestureHandler);
        document.addEventListener('gesturechange', gestureHandler);
        document.addEventListener('gestureend', gestureHandler);

        return () => {
            scrollContainer.removeEventListener('wheel', strictWheel);
            document.removeEventListener('gesturestart', gestureHandler);
            document.removeEventListener('gesturechange', gestureHandler);
            document.removeEventListener('gestureend', gestureHandler);
        };
    }, [handleWheel]);

    // Calculate thumbnail size based on views - SCALES with ZOOM now
    const getSize = useCallback((viewCount: number) => {
        // Base sizes at 100% zoom
        // We scale them by zoomLevel to keep proportions with the timeline width
        const minSize = 120 * zoomLevel;
        const maxSize = 260 * zoomLevel;

        if (stats.maxViews === stats.minViews) return (minSize + maxSize) / 2;

        const minLog = Math.log(Math.max(1, stats.minViews));
        const maxLog = Math.log(Math.max(1, stats.maxViews));
        const valLog = Math.log(Math.max(1, viewCount));
        const scale = (valLog - minLog) / (maxLog - minLog);

        return minSize + scale * (maxSize - minSize);
    }, [stats, zoomLevel]);

    // Generate year/month markers for the date header
    const dateMarkers = useMemo(() => {
        if (videos.length === 0) return { years: [], months: [] };

        const years: { year: number; xPercent: number }[] = [];
        const months: { month: string; year: number; xPercent: number }[] = [];

        const startDate = new Date(stats.minDate);
        const endDate = new Date(stats.maxDate);
        const dateRange = stats.maxDate - stats.minDate;

        console.log('[Timeline] Generating markers covering:', {
            start: startDate.toLocaleDateString(),
            end: endDate.toLocaleDateString()
        });

        // Generate year markers (centered)
        for (let y = startDate.getFullYear(); y <= endDate.getFullYear(); y++) {
            const yearStart = Math.max(stats.minDate, new Date(y, 0, 1).getTime());
            const yearEnd = Math.min(stats.maxDate, new Date(y + 1, 0, 1).getTime());

            // Only add if the year logic makes sense (start < end)
            if (yearStart < yearEnd) {
                const midTimestamp = (yearStart + yearEnd) / 2;
                const xPercent = (midTimestamp - stats.minDate) / dateRange;
                years.push({ year: y, xPercent });
            }
        }

        // Generate month markers (centered)
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (current <= endDate) {
            const monthStart = current.getTime();
            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);
            const monthEnd = nextMonth.getTime();

            // Calculate center point of the month
            const midTimestamp = (monthStart + monthEnd) / 2;
            const xPercent = (midTimestamp - stats.minDate) / dateRange;

            // Only add if visible (allowing slight buffer)
            if (xPercent >= -0.1 && xPercent <= 1.1) {
                const monthName = current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                console.log(`[Timeline] Adding month: ${monthName} at ${xPercent.toFixed(3)}`);
                months.push({
                    month: monthName,
                    year: current.getFullYear(),
                    xPercent
                });
            }
            current.setMonth(current.getMonth() + 1);
        }

        return { years, months };
    }, [stats, videos.length]);

    // Generate month markers and regions - CLIPPED to visible range
    const monthRegions = useMemo(() => {
        if (videos.length === 0) return [];

        const regions: { month: string; year: number; startX: number; endX: number; center: number }[] = [];
        const dateRange = stats.maxDate - stats.minDate;

        // Start iteration from the month of the minDate
        let current = new Date(stats.minDate);
        current.setDate(1); // Start at beginning of that month

        const endDate = new Date(stats.maxDate);

        while (current <= endDate || (current.getFullYear() === endDate.getFullYear() && current.getMonth() === endDate.getMonth())) {
            const monthStart = current.getTime();

            const nextMonth = new Date(current);
            nextMonth.setMonth(current.getMonth() + 1);
            const monthEnd = nextMonth.getTime();

            // Intersection of Month [monthStart, monthEnd] and Timeline [stats.minDate, stats.maxDate]
            const visibleStart = Math.max(stats.minDate, monthStart);
            const visibleEnd = Math.min(stats.maxDate, monthEnd);

            if (visibleStart < visibleEnd) {
                const startX = (visibleStart - stats.minDate) / dateRange;
                const endX = (visibleEnd - stats.minDate) / dateRange;
                const center = (startX + endX) / 2;

                regions.push({
                    month: current.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                    year: current.getFullYear(),
                    startX,
                    endX,
                    center
                });
            }
            current.setMonth(current.getMonth() + 1);
        }
        return regions;
    }, [stats]);

    // Calculate position for a video based on STRICT DAILY SLOTS
    const getPosition = useCallback((video: VideoNode) => {
        const dateRange = stats.maxDate - stats.minDate || 1;
        const viewRange = Math.log(stats.maxViews) - Math.log(Math.max(1, stats.minViews)) || 1;

        // X: Snapped to Day Center
        // Find which day index this is from Start
        // Use exact day-center logic (e.g. Day 0 -> 0.5/TotalDays?)
        // Mapping linear time is accurate enough IF the width is sufficient.

        // Strict linear time is fine because we enforced Width = TotalDays * 300px.
        // So Day 0 is at 0px -> 300px. Day 1 is 300px -> 600px.
        // A video at 12:00 on Day 0 is at 150px.
        // A video at 12:00 on Day 1 is at 450px. Distance 300px.
        // Max video width 260px. Gap 40px guaranteed.

        const xPercent = (video.publishedAtTimestamp - stats.minDate) / dateRange;

        // Y: Views (Log scale)
        const viewLog = Math.log(Math.max(1, video.viewCount));
        const minLog = Math.log(Math.max(1, stats.minViews));
        const yPercent = 1 - (viewLog - minLog) / viewRange;

        return { xPercent, yPercent };
    }, [stats, MS_PER_DAY]);

    const containerWidth = Math.max(100, totalDays * MIN_PIXELS_PER_DAY * zoomLevel);

    return (
        <div
            id="timeline-canvas"
            className="w-full h-[calc(100vh-56px)] mt-[56px] flex flex-col bg-gradient-to-b from-[#181818] to-[#0a0a0a] overflow-hidden relative"
        >
            {/* Stats Overlay (Fixed) */}
            <div className="absolute top-2 right-6 flex items-center gap-4 text-sm text-text-secondary z-30 pointer-events-none">
                <span>{videos.length} videos</span>
                <span className="text-xs px-2 py-1 bg-white/5 rounded-full backdrop-blur-md">
                    {(zoomLevel * 100).toFixed(0)}%
                </span>
            </div>

            {/* Main Scroll Area containing Header AND Content */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar relative">
                <div
                    style={{
                        minWidth: `${containerWidth}px`,
                        height: '100%',
                        position: 'relative'
                    }}
                >
                    {/* Background Month Regions (Visuals only, Labels moved to Header) */}
                    <div className="absolute inset-0 pointer-events-none flex">
                        {monthRegions.map((region, i) => (
                            <div
                                key={`${region.month}-${region.year}`}
                                className={`h-full border-l border-white/5 ${i % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'}`}
                                style={{
                                    position: 'absolute',
                                    left: `${region.startX * 100}%`,
                                    width: `${(region.endX - region.startX) * 100}%`
                                }}
                            />
                        ))}
                    </div>

                    {/* Date Header (Now scrolls with content) */}
                    <div className="h-16 border-b border-white/10 relative z-20 bg-[#1a1a1a]/40 backdrop-blur-sm">
                        {/* Year Items */}
                        {dateMarkers.years.map((marker, i) => (
                            <div
                                key={i}
                                className="absolute top-4 -translate-y-1/2 text-lg font-bold text-white/50 tracking-widest pointer-events-none"
                                style={{ left: `${marker.xPercent * 100}%`, transform: 'translate(-50%, -50%)' }}
                            >
                                {marker.year}
                            </div>
                        ))}

                        {/* Month Labels - Centered in their region */}
                        {monthRegions.map((region) => (
                            <div
                                key={`label-${region.month}-${region.year}`}
                                className="absolute top-10 text-xs font-bold text-text-secondary tracking-widest px-2 py-1 rounded transition-colors group-hover:bg-[#1a1a1a]"
                                style={{
                                    left: `${region.center * 100}%`,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 25
                                }}
                            >
                                {region.month}
                            </div>
                        ))}
                    </div>

                    {/* Chart Area */}
                    <div
                        className="relative z-10"
                        style={{
                            height: 'calc(100% - 64px)',
                            marginTop: '20px'
                        }}
                    >
                        {/* Video Nodes - Strict Position */}
                        {videos.map((video, index) => {
                            const { xPercent, yPercent } = getPosition(video);
                            const size = getSize(video.viewCount);
                            const aspectRatio = 16 / 9;
                            const width = size;
                            const height = size / aspectRatio;

                            // Dynamic safe bounds based on card height
                            // Container height = viewport - app header - date bar with margin
                            const containerHeightEstimate = window.innerHeight - 56 - 84;
                            const cardHalfHeightPercent = (height / 2 + 30) / containerHeightEstimate; // +30 for label + margin

                            // Clamp yPercent to ensure full visibility within the chart area
                            // At min zoom, cards are small so they can be close to edges
                            // At max zoom, cards are large so cardHalfHeightPercent naturally pushes them away
                            const minY = cardHalfHeightPercent;
                            const maxY = 1 - cardHalfHeightPercent;
                            const clampedY = Math.max(minY, Math.min(maxY, yPercent));
                            const safeY = clampedY;

                            // Format views like "1.2M", "10K"
                            const formatCompactNumber = (num: number) => {
                                return new Intl.NumberFormat('en-US', {
                                    notation: "compact",
                                    maximumFractionDigits: 1
                                }).format(num);
                            };

                            const viewLabel = formatCompactNumber(video.viewCount);

                            // Dynamic border radius that scales down with zoom but stays minimal
                            const borderRadius = Math.max(3, Math.min(12, 8 * zoomLevel));

                            return (
                                <div
                                    key={video.id}
                                    className="absolute cursor-pointer hover:z-50 group flex flex-col items-center"
                                    style={{
                                        left: `${xPercent * 100}%`,
                                        top: `${safeY * 100}%`,
                                        width: width,
                                        transform: 'translate(-50%, -50%)',
                                        zIndex: 10 + index
                                    }}
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

                                    {/* View Count Under Thumbnail */}
                                    <span className="mt-1.5 text-[10px] font-medium text-white/50 group-hover:text-white transition-colors bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm pointer-events-none">
                                        {viewLabel}
                                    </span>
                                </div>
                            );
                        })}

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
                </div>
            </div>

            {/* Tooltip */}
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

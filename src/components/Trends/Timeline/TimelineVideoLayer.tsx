import React, { useState, useRef, memo, useMemo } from 'react';
import type { TrendVideo } from '../../../types/trends';

interface VideoPosition {
    video: TrendVideo;
    xNorm: number;
    yNorm: number;
    baseSize: number;
}

interface TimelineVideoLayerProps {
    videoPositions: VideoPosition[];
    transform: { scale: number; offsetX: number; offsetY: number };
    worldWidth: number;
    worldHeight: number;
    onHoverVideo: (data: { video: TrendVideo; x: number; y: number; height: number } | null) => void;
    setAddChannelModalOpen: (isOpen: boolean) => void;
}

// Format views like "1.2M"
const formatCompactNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

// Memoized single video component for extreme performance updates
const VideoItem = memo(({
    position,
    worldWidth,
    worldHeight,
    isFocused,
    isElevated,
    onMouseEnter,
    onMouseLeave
}: {
    position: VideoPosition;
    worldWidth: number;
    worldHeight: number;
    isFocused: boolean;
    isElevated: boolean;
    onMouseEnter: (e: React.MouseEvent, vid: TrendVideo) => void;
    onMouseLeave: () => void;
}) => {
    const { video, xNorm, yNorm, baseSize } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * (worldHeight - 50) + 25;
    const width = baseSize;
    const height = baseSize / (16 / 9);
    const borderRadius = Math.max(3, Math.min(12, 8));
    const viewLabel = formatCompactNumber(video.viewCount);

    return (
        <div
            className={`absolute cursor-pointer group flex flex-col items-center will-change-transform ${isFocused ? 'drop-shadow-[0_8px_30px_rgba(255,255,255,0.15)]' : ''}`}
            style={{
                left: x,
                top: y,
                width: width,
                transform: `translate(-50%, -50%) scale(${isFocused ? 1.25 : 1})`,
                zIndex: isElevated ? 1000 : 10,
                filter: isFocused ? 'brightness(1.1)' : 'brightness(1)',
                transition: 'transform 200ms ease-out, filter 200ms ease-out, box-shadow 200ms ease-out',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={(e) => onMouseEnter(e, video)}
            onMouseLeave={onMouseLeave}
        >
            <div
                className={`overflow-hidden shadow-lg bg-black/50 w-full ${isFocused ? 'shadow-2xl shadow-white/20' : 'group-hover:shadow-xl'}`}
                style={{
                    height,
                    borderRadius: `${borderRadius}px`,
                    backgroundImage: `url(${video.thumbnail})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    transition: 'box-shadow 200ms ease-out',
                }}
            />
            <span className={`mt-1.5 text-[10px] font-medium transition-colors bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm pointer-events-none whitespace-nowrap ${isFocused ? 'text-white' : 'text-white/50 group-hover:text-white'}`}>
                {viewLabel}
            </span>
        </div>
    );
});

export const TimelineVideoLayer: React.FC<TimelineVideoLayerProps> = ({
    videoPositions,
    transform,
    worldWidth,
    worldHeight,
    onHoverVideo,
    setAddChannelModalOpen
}) => {
    // Internal state for hover effects
    const [focusedVideoId, setFocusedVideoId] = useState<string | null>(null);
    const [elevatedVideoId, setElevatedVideoId] = useState<string | null>(null);
    const elevationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // -- VIRTUALIZATION / CULLING --
    const visibleRegion = useMemo(() => {
        const viewportW = window.innerWidth;
        // const viewportH = window.innerHeight; // Unused for now as we cull X only for simple timeline usually, or XY?
        // Let's cull X only for now as horizontal scroll is the main factor in timeline. 
        // Although vertical is bounded by WORLD_HEIGHT so it's always "visible" vertically 
        // unless zoomed in extremely. 

        const minX = -500; // Buffer
        const maxX = viewportW + 500;

        // Transform screen coords to world coords
        const worldMinX = (minX - transform.offsetX) / transform.scale;
        const worldMaxX = (maxX - transform.offsetX) / transform.scale;

        return { start: worldMinX, end: worldMaxX };
    }, [transform.offsetX, transform.scale]);

    // Filter videos. 
    const visibleVideos = useMemo(() => {
        return videoPositions.filter(p => {
            const x = p.xNorm * worldWidth;
            return x >= visibleRegion.start && x <= visibleRegion.end;
        });
    }, [videoPositions, visibleRegion, worldWidth]);


    const handleMouseEnter = (e: React.MouseEvent, video: TrendVideo) => {
        if (elevationTimeoutRef.current) clearTimeout(elevationTimeoutRef.current);

        setFocusedVideoId(video.id);
        setElevatedVideoId(video.id);

        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

        const rect = e.currentTarget.getBoundingClientRect();

        showTimeoutRef.current = setTimeout(() => {
            onHoverVideo({
                video,
                x: rect.left + rect.width / 2,
                y: rect.top,
                height: rect.height
            });
        }, 500);
    };

    const handleMouseLeave = () => {
        setFocusedVideoId(null);

        elevationTimeoutRef.current = setTimeout(() => {
            setElevatedVideoId(null);
        }, 200);

        if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);

        hoverTimeoutRef.current = setTimeout(() => {
            onHoverVideo(null);
        }, 200);
    };

    return (
        <div className="flex-1 relative overflow-hidden mt-12">
            <div
                style={{
                    transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    width: worldWidth,
                    height: worldHeight,
                    position: 'absolute',
                    willChange: 'transform'
                }}
            >
                {visibleVideos.map((position) => (
                    <VideoItem
                        key={position.video.id}
                        position={position}
                        worldWidth={worldWidth}
                        worldHeight={worldHeight}
                        isFocused={focusedVideoId === position.video.id}
                        isElevated={elevatedVideoId === position.video.id}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    />
                ))}
            </div>

            {videoPositions.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center pointer-events-auto">
                        <div className="text-text-secondary text-lg mb-2">No videos to display</div>
                        <div className="text-text-secondary text-sm">
                            <span
                                onClick={() => setAddChannelModalOpen(true)}
                                className="text-text-secondary hover:text-white transition-colors hover:underline cursor-pointer"
                            >
                                Add channels
                            </span>
                            {" and sync data"}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

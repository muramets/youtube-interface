import React, { useState, useRef, memo, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { TrendVideo } from '../../../types/trends';
import { useThrottle } from '../../../hooks/useThrottle';

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
    getPercentileGroup: (videoId: string) => string | undefined;
    amplifierLevel?: number; // Optional prop for now
}

export interface TimelineVideoLayerHandle {
    updateTransform: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
}

// LOD Thresholds
const LOD_SHOW_THUMBNAIL = 0.25;  // Below this, show colored dots
const LOD_SHOW_LABEL = 0.4;       // Below this, hide view count labels

// Format views like "1.2M"
const formatCompactNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
    }).format(num);
};

// Percentile color and size mapping
// Returns size and a 'weight' (0-1) for amplification
const getPercentileStyle = (percentile: string | undefined) => {
    switch (percentile) {
        case 'Top 1%':
            return { color: 'bg-emerald-500', size: 16, weight: 1.0 };
        case 'Top 5%':
            return { color: 'bg-lime-500', size: 12, weight: 0.8 };
        case 'Top 20%':
            return { color: 'bg-blue-500', size: 10, weight: 0.5 };
        case 'Middle 60%':
            return { color: 'bg-purple-400', size: 7, weight: 0.2 };
        case 'Bottom 20%':
            return { color: 'bg-red-400', size: 5, weight: 0.0 };
        default:
            return { color: 'bg-gray-400', size: 6, weight: 0.1 };
    }
};

// Simplified dot for low zoom (LOD)
const VideoDot = memo(({
    position,
    worldWidth,
    worldHeight,
    percentileGroup,
    amplifierLevel
}: {
    position: VideoPosition;
    worldWidth: number;
    worldHeight: number;
    percentileGroup: string | undefined;
    amplifierLevel?: number;
}) => {
    const { xNorm, yNorm } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * worldHeight;
    const { color, size: baseSize, weight } = getPercentileStyle(percentileGroup);

    // Apply amplifier: Large dots grow, small dots stay roughly same
    const amp = amplifierLevel || 1.0;
    const finalSize = baseSize * (1 + weight * (amp - 1));

    return (
        <div
            className={`absolute rounded-full ${color} shadow-sm`}
            style={{
                left: x,
                top: y,
                width: finalSize,
                height: finalSize,
                transform: 'translate(-50%, -50%)',
            }}
        />
    );
});

// Memoized single video component for extreme performance updates
const VideoItem = memo(({
    position,
    worldWidth,
    worldHeight,
    isFocused,
    isElevated,
    showLabel,
    onMouseEnter,
    onMouseLeave
}: {
    position: VideoPosition;
    worldWidth: number;
    worldHeight: number;
    isFocused: boolean;
    isElevated: boolean;
    showLabel: boolean;
    onMouseEnter: (e: React.MouseEvent, vid: TrendVideo) => void;
    onMouseLeave: () => void;
}) => {
    const { video, xNorm, yNorm, baseSize } = position;
    const x = xNorm * worldWidth;
    const y = yNorm * worldHeight;
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
            {showLabel && (
                <span className={`mt-1.5 text-[10px] font-medium transition-colors bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-sm pointer-events-none whitespace-nowrap ${isFocused ? 'text-white' : 'text-white/50 group-hover:text-white'}`}>
                    {viewLabel}
                </span>
            )}
        </div>
    );
});

export const TimelineVideoLayer = forwardRef<TimelineVideoLayerHandle, TimelineVideoLayerProps>(({
    videoPositions,
    transform,
    worldWidth,
    worldHeight,
    onHoverVideo,
    setAddChannelModalOpen,
    getPercentileGroup,
    amplifierLevel
}, ref) => {
    // Ref for imperative DOM updates
    const layerRef = useRef<HTMLDivElement>(null);

    // Expose imperative handle for direct DOM updates
    useImperativeHandle(ref, () => ({
        updateTransform: (t) => {
            if (layerRef.current) {
                layerRef.current.style.transform = `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.scale})`;
            }
        }
    }), []);

    // Internal state for hover effects
    const [focusedVideoId, setFocusedVideoId] = useState<string | null>(null);
    const [elevatedVideoId, setElevatedVideoId] = useState<string | null>(null);
    const elevationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // LOD state based on zoom level
    const showThumbnails = transform.scale >= LOD_SHOW_THUMBNAIL;
    const showLabels = transform.scale >= LOD_SHOW_LABEL;

    // -- VIRTUALIZATION / CULLING (throttled for performance) --
    const rawVisibleRegion = useMemo(() => {
        const viewportW = window.innerWidth;
        const minX = -500; // Buffer
        const maxX = viewportW + 500;

        // Transform screen coords to world coords
        const worldMinX = (minX - transform.offsetX) / transform.scale;
        const worldMaxX = (maxX - transform.offsetX) / transform.scale;

        return { start: worldMinX, end: worldMaxX };
    }, [transform.offsetX, transform.scale]);

    // Throttle visible region updates to reduce recalculation
    const visibleRegion = useThrottle(rawVisibleRegion, 32); // ~30fps for culling

    // Filter videos
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
                ref={layerRef}
                style={{
                    transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    width: worldWidth,
                    height: worldHeight,
                    position: 'absolute',
                    willChange: 'transform'
                }}
            >
                {showThumbnails ? (
                    // Full quality thumbnails
                    visibleVideos.map((position) => (
                        <VideoItem
                            key={position.video.id}
                            position={position}
                            worldWidth={worldWidth}
                            worldHeight={worldHeight}
                            isFocused={focusedVideoId === position.video.id}
                            isElevated={elevatedVideoId === position.video.id}
                            showLabel={showLabels}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                        />
                    ))
                ) : (
                    // LOD: Simplified dots for low zoom with percentile colors
                    visibleVideos.map((position) => (
                        <VideoDot
                            key={position.video.id}
                            position={position}
                            worldWidth={worldWidth}
                            worldHeight={worldHeight}
                            percentileGroup={getPercentileGroup(position.video.id)}
                            amplifierLevel={amplifierLevel}
                        />
                    ))
                )}
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
});

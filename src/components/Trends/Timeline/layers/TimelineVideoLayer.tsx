import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import type { TrendVideo, VideoPosition } from '../../../../types/trends';
import { useTimelineVirtualization } from '../hooks/useTimelineVirtualization';
import { VideoDot } from '../nodes/VideoDot';
import { VideoNode } from '../nodes/VideoNode';

interface TimelineVideoLayerProps {
    videoPositions: VideoPosition[];
    transform: { scale: number; offsetX: number; offsetY: number };
    worldWidth: number;
    worldHeight: number;
    onHoverVideo: (data: { video: TrendVideo; x: number; y: number; width: number; height: number } | null) => void;
    onDoubleClickVideo: (video: TrendVideo, worldX: number, worldY: number) => void;
    onClickVideo: (video: TrendVideo, clientX: number, clientY: number) => void;
    setAddChannelModalOpen: (isOpen: boolean) => void;
    getPercentileGroup: (videoId: string) => string | undefined;
    style?: React.CSSProperties;
    isLoading?: boolean;
}

export interface TimelineVideoLayerHandle {
    updateTransform: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
}

// LOD Thresholds
const LOD_SHOW_THUMBNAIL = 0.25;
const LOD_SHOW_LABEL = 0.4;

export const TimelineVideoLayer = forwardRef<TimelineVideoLayerHandle, TimelineVideoLayerProps>(({
    videoPositions,
    transform,
    worldWidth,
    worldHeight,
    style,
    getPercentileGroup,
    setAddChannelModalOpen,
    onHoverVideo,
    onDoubleClickVideo,
    onClickVideo,
    isLoading = false
}, ref) => {

    // Local state for smooth interactions (hover, pan) -- decoupled from React render if needed
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

    // Timeouts
    const elevationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Use Virtualization Hook
    const { visibleVideos } = useTimelineVirtualization({
        videoPositions,
        transform,
        worldWidth
    });

    // LOD state based on zoom level
    const showThumbnails = transform.scale >= LOD_SHOW_THUMBNAIL;
    const showLabels = transform.scale >= LOD_SHOW_LABEL;

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
                width: rect.width,
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
        <div className="flex-1 relative overflow-hidden">
            <div
                ref={layerRef}
                style={{
                    ...style,
                    // Initialize transform style
                    transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    width: worldWidth,
                    height: worldHeight,
                    position: 'absolute',
                    willChange: 'transform',
                    '--timeline-scale': transform.scale,
                } as React.CSSProperties}
            >
                {!isLoading && (showThumbnails ? (
                    visibleVideos.map((position) => (
                        <VideoNode
                            key={position.video.id}
                            position={position}
                            worldWidth={worldWidth}
                            worldHeight={worldHeight}
                            isFocused={focusedVideoId === position.video.id}
                            isElevated={elevatedVideoId === position.video.id}
                            showLabel={showLabels}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            onDoubleClick={onDoubleClickVideo}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClickVideo(position.video, e.clientX, e.clientY);
                            }}
                        />
                    ))
                ) : (
                    visibleVideos.map((position) => (
                        <VideoDot
                            key={position.video.id}
                            position={position}
                            worldWidth={worldWidth}
                            worldHeight={worldHeight}
                            percentileGroup={getPercentileGroup(position.video.id)}
                            isFocused={focusedVideoId === position.video.id}
                            isElevated={elevatedVideoId === position.video.id}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            onDoubleClick={onDoubleClickVideo}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClickVideo(position.video, e.clientX, e.clientY);
                            }}
                        />
                    ))
                ))}
            </div>

            {!isLoading && videoPositions.length === 0 && (
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

TimelineVideoLayer.displayName = 'TimelineVideoLayer';

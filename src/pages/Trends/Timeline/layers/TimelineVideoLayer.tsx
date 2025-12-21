import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useDndMonitor } from '@dnd-kit/core';
import type { TrendVideo, VideoPosition } from '../../../../types/trends';
import { useTimelineVirtualization } from '../hooks/useTimelineVirtualization';
import { VideoDot } from '../nodes/VideoDot';
import { DraggableVideoNode } from '../nodes/DraggableVideoNode';
import {
    LOD_SHOW_LABEL,
    LOD_SHOW_THUMBNAIL,
    TOOLTIP_SHOW_DELAY_MS,
    ELEVATION_TIMEOUT_MS,
    HOVER_DEBOUNCE_MS
} from '../utils/timelineConstants';

interface TimelineVideoLayerProps {
    videoPositions: VideoPosition[];
    transform: { scale: number; offsetX: number; offsetY: number };
    worldWidth: number;
    worldHeight: number;
    activeVideoIds: Set<string>;
    onHoverVideo: (data: { video: TrendVideo; x: number; y: number; width: number; height: number } | null) => void;
    onDoubleClickVideo: (video: TrendVideo, worldX: number, worldY: number, e: React.MouseEvent) => void;
    onClickVideo: (video: TrendVideo, e: React.MouseEvent) => void;
    getPercentileGroup: (videoId: string) => string | undefined;
    style?: React.CSSProperties;
    isLoading?: boolean;
    isHidden?: boolean;
}

export interface TimelineVideoLayerHandle {
    updateTransform: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
}



export const TimelineVideoLayer = forwardRef<TimelineVideoLayerHandle, TimelineVideoLayerProps>(({
    videoPositions,
    transform,
    worldWidth,
    worldHeight,
    activeVideoIds,
    style,
    getPercentileGroup,
    onHoverVideo,
    onDoubleClickVideo,
    onClickVideo,
    isLoading = false,
    isHidden = false
}, ref) => {
    // Immediate optimization: If hidden, render null to unmount heavy DOM
    if (isHidden) return null;

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

    // Track global drag state to suppress tooltips during drag
    const [isAnyDragging, setIsAnyDragging] = useState(false);
    useDndMonitor({
        onDragStart: () => {
            setIsAnyDragging(true);
            onHoverVideo(null); // Instantly hide tooltip when drag starts
        },
        onDragEnd: () => setIsAnyDragging(false),
        onDragCancel: () => setIsAnyDragging(false),
    });

    const handleMouseEnter = (e: React.MouseEvent, video: TrendVideo) => {
        // Don't show tooltip during drag
        if (isAnyDragging) return;

        if (elevationTimeoutRef.current) clearTimeout(elevationTimeoutRef.current);

        setFocusedVideoId(video.id);
        setElevatedVideoId(video.id);

        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

        // Don't show tooltip if video is already selected
        if (activeVideoIds.has(video.id)) return;

        const rect = e.currentTarget.getBoundingClientRect();

        showTimeoutRef.current = setTimeout(() => {
            onHoverVideo({
                video,
                x: rect.left + rect.width / 2,
                y: rect.top,
                width: rect.width,
                height: rect.height
            });
        }, TOOLTIP_SHOW_DELAY_MS);
    };

    const handleMouseLeave = () => {
        setFocusedVideoId(null);

        elevationTimeoutRef.current = setTimeout(() => {
            setElevatedVideoId(null);
        }, ELEVATION_TIMEOUT_MS);

        if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);

        hoverTimeoutRef.current = setTimeout(() => {
            onHoverVideo(null);
        }, HOVER_DEBOUNCE_MS);
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
                        <DraggableVideoNode
                            key={position.video.id}
                            position={position}
                            worldWidth={worldWidth}
                            worldHeight={worldHeight}
                            isFocused={focusedVideoId === position.video.id}
                            isElevated={elevatedVideoId === position.video.id}
                            isActive={activeVideoIds.has(position.video.id)}
                            showLabel={showLabels}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            onDoubleClick={onDoubleClickVideo}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClickVideo(position.video, e);
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
                            isActive={activeVideoIds.has(position.video.id)}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            onDoubleClick={onDoubleClickVideo}
                            onClick={(e) => {
                                e.stopPropagation();
                                onClickVideo(position.video, e);
                            }}
                        />
                    ))
                ))}
            </div>
        </div>
    );
});

TimelineVideoLayer.displayName = 'TimelineVideoLayer';

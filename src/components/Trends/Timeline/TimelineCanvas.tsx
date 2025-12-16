import React, { useRef, useState } from 'react';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendTooltip } from './TrendTooltip';
import { TimelineDateHeader } from './TimelineDateHeader';
import { TimelineViewAxis } from './TimelineViewAxis';
import { TimelineBackground } from './TimelineBackground';
import { TimelineVideoLayer, type TimelineVideoLayerHandle } from './layers/TimelineVideoLayer';
import { ZoomIndicator } from './ZoomIndicator';
import { TimelineSkeleton } from './TimelineSkeleton';
import type { TrendVideo } from '../../../types/trends';

// Hooks
import { useTimelineStructure, useTimelinePositions } from './hooks/useTimelineData';
import { useTimelineTransform } from './hooks/useTimelineTransform';
import { useTimelineInteraction } from './hooks/useTimelineInteraction';
import { useTimelineHotkeys } from './hooks/useTimelineHotkeys';

// Constants
const HEADER_HEIGHT = 48;
const PADDING = 40;

interface TimelineCanvasProps {
    videos: TrendVideo[];
    isLoading?: boolean;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ videos, isLoading = false }) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen } = useTrendStore();
    const { scalingMode, amplifierLevel, timeLinearity } = timelineConfig;

    // 1. Structure (independent of viewport)
    const {
        worldWidth,
        stats,
        monthLayouts,
        monthRegions,
        yearMarkers
    } = useTimelineStructure({ videos, timeLinearity });

    // 2. Transform & Viewport Logic
    const {
        containerRef,
        containerSizeRef,
        // viewportSize removed (unused)
        transformState,
        transformRef,
        setTransformState,
        clampTransform,
        handleAutoFit,
        minScale,
        dynamicWorldHeight // Now derived inside the hook
    } = useTimelineTransform({
        worldWidth,
        headerHeight: HEADER_HEIGHT,
        padding: PADDING,
        videosLength: videos.length
    });

    // 3. Data Positions (needs dynamicWorldHeight)
    const {
        videoPositions,
        getPercentileGroup
    } = useTimelinePositions({
        videos,
        stats,
        monthLayouts,
        scalingMode,
        amplifierLevel,
        dynamicWorldHeight
    });

    // 4. Interaction
    const videoLayerRef = useRef<TimelineVideoLayerHandle>(null);
    const [hoveredVideo, setHoveredVideo] = useState<{ video: TrendVideo; x: number; y: number; height: number } | null>(null);
    const isTooltipHoveredRef = useRef(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const { isPanning } = useTimelineInteraction({
        containerRef,
        videoLayerRef,
        transformRef,
        minScale,
        containerSizeRef,
        setTransformState,
        clampTransform,
        onHoverVideo: (hovered: boolean) => {
            // Logic to hide tooltip if needed
            if (!hovered) setHoveredVideo(null);
        },
        worldWidth,
        dynamicWorldHeight,
        headerHeight: HEADER_HEIGHT
    });



    // Hotkey: 'Z' to Auto Fit
    useTimelineHotkeys({ onAutoFit: handleAutoFit });



    return (
        <div
            ref={containerRef}
            className="w-full h-[calc(100vh-56px)] flex flex-col bg-bg-primary overflow-hidden relative"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        >
            {/* Subtle Vertical Gradient Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-text-primary/[0.02] to-transparent" />

            {/* 1. Background (Bottom Layer) */}
            {!isLoading && (
                <TimelineBackground
                    monthRegions={monthRegions}
                    transform={transformState}
                    worldWidth={worldWidth}
                    timeLinearity={timeLinearity || 1.0}
                />
            )}

            {/* 2. Video Content (Middle Layer) */}
            <TimelineVideoLayer
                ref={videoLayerRef}
                videoPositions={videoPositions}
                transform={transformState}
                worldWidth={worldWidth}
                worldHeight={dynamicWorldHeight}
                style={{
                    opacity: isLoading ? 0 : 1,
                    transition: 'opacity 0.3s ease'
                } as React.CSSProperties}
                getPercentileGroup={getPercentileGroup}
                setAddChannelModalOpen={setAddChannelModalOpen}
                onHoverVideo={(data) => {
                    if (data) {
                        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                        setHoveredVideo(data);
                    } else {
                        hideTimeoutRef.current = setTimeout(() => {
                            if (!isTooltipHoveredRef.current) {
                                setHoveredVideo(null);
                            }
                        }, 150);
                    }
                }}
                onDoubleClickVideo={(_video, worldX, worldY) => {
                    // Center the clicked video at 100% scale
                    const { width, height } = containerSizeRef.current;
                    const targetScale = 1.0;

                    // Calculate offset to center the video
                    const newOffsetX = (width / 2) - (worldX * targetScale);
                    const newOffsetY = (height / 2) - (worldY * targetScale);

                    const clamped = clampTransform({
                        scale: targetScale,
                        offsetX: newOffsetX,
                        offsetY: newOffsetY
                    }, width, height);

                    transformRef.current = clamped;
                    if (videoLayerRef.current) videoLayerRef.current.updateTransform(clamped);
                    setTransformState(clamped);
                }}
            />

            {/* 3. Headers & UI Overlays (Top Layer) */}
            {isLoading ? (
                <TimelineSkeleton />
            ) : (
                <>
                    {/* Date Header with Backdrop Blur */}
                    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
                        {/* Wrapper handles z-index and positioning. Inner header handles content. */}
                        <div className="pointer-events-auto">
                            <TimelineDateHeader
                                yearMarkers={yearMarkers}
                                monthRegions={monthRegions}
                                transform={transformState}
                                worldWidth={worldWidth}
                            />
                        </div>
                    </div>

                    {/* Vertical View Axis */}
                    <TimelineViewAxis
                        stats={stats}
                        scalingMode={scalingMode}
                        amplifierLevel={amplifierLevel}
                        dynamicWorldHeight={dynamicWorldHeight}
                        transform={transformState}
                        style={{ top: HEADER_HEIGHT }}
                    />
                </>
            )}

            <ZoomIndicator
                scale={transformState.scale}
                minScale={minScale}
                amplifierLevel={amplifierLevel ?? 1.0}
                timeLinearity={timeLinearity ?? 1.0}
                onReset={handleAutoFit}
                onAmplifierChange={(level) => setTimelineConfig({ amplifierLevel: level })}
                onTimeLinearityChange={(level) => setTimelineConfig({ timeLinearity: level })}
                onZoomChange={(newScale) => {
                    // Center zoom (simplified for now, ideally zooms to center of viewport)
                    const { width, height } = containerSizeRef.current;
                    const newOffsetX = transformRef.current.offsetX; // Keep offset for now or improve
                    const newOffsetY = transformRef.current.offsetY;

                    const clamped = clampTransform({
                        scale: newScale,
                        offsetX: newOffsetX,
                        offsetY: newOffsetY
                    }, width, height);

                    transformRef.current = clamped;
                    if (videoLayerRef.current) videoLayerRef.current.updateTransform(clamped);
                    setTransformState(clamped);
                }}
                isLoading={isLoading}
            />

            {hoveredVideo && (
                <TrendTooltip
                    video={hoveredVideo.video}
                    style={{
                        left: hoveredVideo.x,
                        top: hoveredVideo.y,
                        transform: 'translate(-50%, -100%) translateY(-12px)'
                    }}
                    onMouseEnter={() => {
                        isTooltipHoveredRef.current = true;
                        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                    }}
                    onMouseLeave={() => {
                        isTooltipHoveredRef.current = false;
                        setHoveredVideo(null);
                    }}
                    percentileGroup={getPercentileGroup(hoveredVideo.video.id)}
                />
            )}
        </div>
    );
};

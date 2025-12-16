import React, { useRef, useState } from 'react';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendTooltip } from './TrendTooltip';
import { TimelineDateHeader } from './TimelineDateHeader';
import { TimelineViewAxis } from './TimelineViewAxis';
import { TimelineBackground } from './TimelineBackground';
import { TimelineVideoLayer, type TimelineVideoLayerHandle } from './layers/TimelineVideoLayer';
import { TimelineControls } from './TimelineControls';
import { TimelineSkeleton } from './TimelineSkeleton';
import type { TrendVideo } from '../../../types/trends';

// Hooks
import { useTimelineStructure, useTimelinePositions } from './hooks/useTimelineData';
import { useTimelineTransform } from './hooks/useTimelineTransform';
import { useTimelineInteraction } from './hooks/useTimelineInteraction';
import { useTimelineHotkeys } from './hooks/useTimelineHotkeys';
import { getTimeAtWorldX } from './utils/timelineMath';

// Constants
const HEADER_HEIGHT = 48;
const PADDING = 40;

interface TimelineCanvasProps {
    videos: TrendVideo[];
    isLoading?: boolean;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({ videos, isLoading = false }) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen } = useTrendStore();
    const { scalingMode, verticalSpread, timeLinearity } = timelineConfig;

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
        dynamicWorldHeight, // Now derived inside the hook
        anchorToTime
    } = useTimelineTransform({
        worldWidth,
        headerHeight: HEADER_HEIGHT,
        padding: PADDING,
        videosLength: videos.length,
        monthLayouts,
        stats
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
        verticalSpread,
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
                        verticalSpread={verticalSpread}
                        dynamicWorldHeight={dynamicWorldHeight}
                        transform={transformState}
                        style={{ top: HEADER_HEIGHT }}
                    />
                </>
            )}

            <TimelineControls
                scale={transformState.scale}
                minScale={minScale}
                onReset={handleAutoFit}
                verticalSpread={verticalSpread ?? 1.0}
                onSpreadChange={(newSpread) => {
                    const oldSpread = verticalSpread ?? 1.0;
                    if (Math.abs(oldSpread - newSpread) < 0.001) return;

                    const currentScale = transformState.scale;
                    const currentOffsetY = transformState.offsetY;
                    const viewportHeight = containerSizeRef.current.height;

                    // 1. Find World Y at Viewport Center
                    const centerY = HEADER_HEIGHT + (viewportHeight - HEADER_HEIGHT) / 2;
                    const worldY = (centerY - currentOffsetY) / currentScale;

                    // 2. Normalize relative to World Height
                    const normY = worldY / dynamicWorldHeight;

                    // 3. De-normalize to find Base Position (0-1 ideal)
                    // Formula: effective = 0.5 + (base - 0.5) * spread
                    // base = 0.5 + (effective - 0.5) / spread
                    const distFromCenter = normY - 0.5;
                    // Avoid division by zero, though spread should be > 0
                    const safeOldSpread = Math.max(0.001, oldSpread);
                    const baseDist = distFromCenter / safeOldSpread;

                    // 4. Re-normalize with New Spread
                    const newDist = baseDist * newSpread;
                    const newNormY = 0.5 + newDist;
                    const newWorldY = newNormY * dynamicWorldHeight;

                    // 5. Calculate New Offset
                    // centerY = newWorldY * scale + newOffsetY
                    // newOffsetY = centerY - newWorldY * scale
                    const newOffsetY = centerY - (newWorldY * currentScale);

                    setTimelineConfig({ verticalSpread: newSpread, offsetY: newOffsetY });

                    // Update local state immediately to prevents jumps
                    setTransformState({
                        ...transformState,
                        offsetY: newOffsetY
                    });
                }}
                timeLinearity={timeLinearity ?? 1.0}
                onTimeLinearityChange={(level) => {
                    const currentScale = transformState.scale;
                    const viewportWidth = containerSizeRef.current.width;

                    // 1. Check if we are currently "Fitted" (Zoomed out to see everything)
                    // If so, we DON'T want to anchor to a time, we want to stay fitted (Autofit).
                    const isRoughlyFitted = Math.abs(currentScale - minScale) < 0.0001 || (Math.abs(currentScale - minScale) / minScale) < 0.01;

                    if (!isRoughlyFitted) {
                        // 2. Find World X at Viewport Center
                        const centerX = viewportWidth / 2;
                        const worldX = (centerX - transformState.offsetX) / currentScale;
                        // Normalize (0-1)
                        const normX = worldX / worldWidth;

                        // 3. Find Time and Request Anchor
                        const centerTime = getTimeAtWorldX(normX, monthLayouts, stats);
                        anchorToTime(centerTime);
                    }

                    setTimelineConfig({ timeLinearity: level });
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

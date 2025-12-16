import React, { useRef, useState, useEffect } from 'react';
import { useTrendStore } from '../../../stores/trendStore';
import { TrendTooltip } from './TrendTooltip';
import { TimelineDateHeader } from './TimelineDateHeader';
import { TimelineViewAxis } from './TimelineViewAxis';
import { TimelineBackground } from './TimelineBackground';
import { TimelineVideoLayer, type TimelineVideoLayerHandle } from './layers/TimelineVideoLayer';
import { TimelineControls } from './TimelineControls';
import { TimelineSkeleton } from './TimelineSkeleton';
import { TimelineSelectionOverlay } from './TimelineSelectionOverlay';
import type { TrendVideo, TimelineStats } from '../../../types/trends';

// Hooks
import { useTimelineStructure, useTimelinePositions } from './hooks/useTimelineData';
import { useTimelineTransform } from './hooks/useTimelineTransform';
import { useTimelineInteraction } from './hooks/useTimelineInteraction';
import { useTimelineHotkeys } from './hooks/useTimelineHotkeys';
import { getTimeAtWorldX, findSmartAnchorTime } from './utils/timelineMath';

// Constants
const HEADER_HEIGHT = 48;
const PADDING = 40;

interface TimelineCanvasProps {
    videos: TrendVideo[];
    isLoading?: boolean;
    percentileMap?: Map<string, string>;
    forcedStats?: TimelineStats;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
    videos,
    isLoading = false,
    percentileMap,
    forcedStats
}) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen } = useTrendStore();
    const { scalingMode, verticalSpread, timeLinearity } = timelineConfig;

    // State to control structure updates ('Z' key forces update)
    const [structureVersion, setStructureVersion] = useState(0);

    // 1. Structure (independent of viewport)
    // forcedStats override internal calculation if provided (e.g. for global context in filtered mode)
    const {
        worldWidth,
        stats,
        monthLayouts,
        monthRegions,
        yearMarkers
    } = useTimelineStructure({ videos, timeLinearity, structureVersion, stats: forcedStats });



    // 2. Transform & Viewport Logic
    const {
        containerRef,
        containerSizeRef,
        // viewportSize removed (unused)
        transformState,
        transformRef,
        setTransformState,
        clampTransform,
        minScale,
        dynamicWorldHeight, // Now derived inside the hook
        anchorToTime,
        calculateAutoFitTransform,
        currentContentHash
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
        dynamicWorldHeight,
        percentileMap
    });

    // 4. Interaction
    const videoLayerRef = useRef<TimelineVideoLayerHandle>(null);
    const [hoveredVideo, setHoveredVideo] = useState<{ video: TrendVideo; x: number; y: number; width: number; height: number } | null>(null);
    const isTooltipHoveredRef = useRef(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Smart Focus: Persist anchor video during drag to prevent jumping between videos
    const spreadDragAnchorRef = useRef<string | null>(null);
    const timeDragAnchorRef = useRef<string | null>(null);

    const [isTooltipClosing, setIsTooltipClosing] = useState(false);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const closeTooltipSmoothly = () => {
        setIsTooltipClosing(true);
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setHoveredVideo(null);
            setIsTooltipClosing(false);
        }, 200); // Wait for fade out
    };

    const interaction = useTimelineInteraction({
        containerRef,
        videoLayerRef,
        transformRef,
        minScale,
        containerSizeRef,
        setTransformState,
        clampTransform,
        onHoverVideo: (active: boolean) => {
            if (!active) closeTooltipSmoothly();
        }
    });

    const { isPanning, selectionRect } = interaction;


    // Triggered by 'Z' or Double Click
    const handleSmoothFit = () => {
        closeTooltipSmoothly();

        // Force structure recalculation first
        setStructureVersion(v => v + 1);

        // The actual auto-fit will happen in the effect below once the structure updates
        // We delay it slightly to ensure the new worldWidth is available
    };

    // Effect to trigger Auto-Fit when structure updates explicitly
    const appliedStructureVersionRef = useRef(0);

    const { smoothToTransform } = interaction;

    useEffect(() => {
        if (structureVersion > 0 && structureVersion > appliedStructureVersionRef.current) {
            appliedStructureVersionRef.current = structureVersion;

            // Verify if we can fit immediately? 
            // useTimelineTransform handles auto-fit logic, but we need to trigger it *after* 
            // the render cycle where worldWidth updated.

            const fitTransform = calculateAutoFitTransform();
            if (fitTransform) {
                smoothToTransform(fitTransform);
                setTimelineConfig({
                    zoomLevel: fitTransform.scale,
                    offsetX: fitTransform.offsetX,
                    offsetY: fitTransform.offsetY,
                    isCustomView: false,
                    contentHash: currentContentHash
                });
            }
        }
    }, [structureVersion, calculateAutoFitTransform, smoothToTransform, setTimelineConfig, currentContentHash]);


    // Hotkey: 'Z' to Auto Fit (Smooth)
    useTimelineHotkeys({ onAutoFit: handleSmoothFit });

    return (
        <div
            ref={containerRef}
            className="w-full h-[calc(100vh-56px)] flex flex-col bg-bg-primary overflow-hidden relative select-none"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={interaction.handleMouseDown}
            onMouseMove={interaction.handleMouseMove}
            onMouseUp={interaction.handleMouseUp}
            onMouseLeave={interaction.handleMouseUp}
            onDoubleClick={handleSmoothFit} // Double click empty space to fit
        >
            {/* Subtle Vertical Gradient Overlay */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-text-primary/[0.02] to-transparent" />

            {/* 1. Background (Bottom Layer) */}
            {!isLoading && (
                <TimelineBackground
                    monthRegions={monthRegions}
                    transform={transformState}
                    worldWidth={worldWidth}
                    timeLinearity={timeLinearity ?? 1.0}
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
                isLoading={isLoading}
                onHoverVideo={(data) => {
                    if (data) {
                        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
                        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                        setIsTooltipClosing(false);
                        setHoveredVideo(data);
                    } else {
                        hideTimeoutRef.current = setTimeout(() => {
                            if (!isTooltipHoveredRef.current) {
                                closeTooltipSmoothly();
                            }
                        }, 150); // Delay before starting fade out
                    }
                }}
                onDoubleClickVideo={(_video, worldX, worldY) => {
                    closeTooltipSmoothly(); // Close tooltip on zoom in
                    // Smoothly animate to center the video
                    interaction.zoomToPoint(worldX, worldY, 1.0); // 1.0 = 100% scale
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

            <TimelineSelectionOverlay selectionRect={selectionRect} />

            <TimelineControls
                scale={transformState.scale}
                minScale={minScale}
                onReset={handleSmoothFit}
                verticalSpread={verticalSpread ?? 1.0}
                onSpreadChange={(newSpread) => {
                    const oldSpread = verticalSpread ?? 1.0;
                    if (Math.abs(oldSpread - newSpread) < 0.001) return;

                    const currentScale = transformState.scale;
                    const viewportWidth = containerSizeRef.current.width;
                    const viewportHeight = containerSizeRef.current.height;

                    // Check if roughly fitted (zoomed out)
                    const isRoughlyFitted = Math.abs(currentScale - minScale) < 0.0001 || (Math.abs(currentScale - minScale) / minScale) < 0.01;

                    if (!isRoughlyFitted && videoPositions.length > 0) {
                        // Try to use persisted anchor, or find new one
                        const hadPersisted = !!spreadDragAnchorRef.current;
                        let anchorVideoPos = spreadDragAnchorRef.current
                            ? videoPositions.find(v => v.video.id === spreadDragAnchorRef.current)
                            : null;

                        // If no persisted anchor, find best one and save it
                        if (!anchorVideoPos) {
                            const foundAnchor = findSmartAnchorTime({
                                videoPositions,
                                currentTransform: transformState,
                                worldWidth,
                                worldHeight: dynamicWorldHeight,
                                viewportWidth,
                                viewportHeight,
                                stats
                            });
                            if (foundAnchor) {
                                spreadDragAnchorRef.current = foundAnchor.videoId;
                                // Find the actual VideoPosition for this video
                                anchorVideoPos = videoPositions.find(v => v.video.id === foundAnchor.videoId) ?? null;
                            }
                        }

                        if (anchorVideoPos) {
                            // Get video's current screen position
                            const worldX = anchorVideoPos.xNorm * worldWidth;
                            const worldY = anchorVideoPos.yNorm * dynamicWorldHeight;
                            const screenX = worldX * currentScale + transformState.offsetX;
                            const screenY = worldY * currentScale + transformState.offsetY;

                            // Calculate viewport center
                            const centerScreenX = viewportWidth / 2;
                            const centerScreenY = HEADER_HEIGHT + (viewportHeight - HEADER_HEIGHT) / 2;

                            // Only apply pull if we had a persisted anchor (not first onChange)
                            // This prevents the initial "jerk" when starting drag
                            let targetScreenX = screenX;
                            let targetScreenY = screenY;

                            if (hadPersisted) {
                                // 2D pull towards center: the further from center, the more pull
                                const distFromCenterX = Math.abs(screenX - centerScreenX);
                                const distFromCenterY = Math.abs(screenY - centerScreenY);
                                const maxDistX = viewportWidth / 2;
                                const maxDistY = viewportHeight / 2;

                                const pullStrengthX = Math.min(0.3, (distFromCenterX / maxDistX) * 0.3);
                                const pullStrengthY = Math.min(0.3, (distFromCenterY / maxDistY) * 0.3);

                                // Target screen position: blend towards center
                                targetScreenX = screenX + (centerScreenX - screenX) * pullStrengthX;
                                targetScreenY = screenY + (centerScreenY - screenY) * pullStrengthY;
                            }

                            // De-spread the yNorm to get base position (relative to 0.5 center)
                            const distFromCenter = anchorVideoPos.yNorm - 0.5;
                            const safeOldSpread = Math.max(0.001, oldSpread);
                            let baseDist = distFromCenter / safeOldSpread;
                            // Clamp to prevent extreme values
                            baseDist = Math.max(-0.5, Math.min(0.5, baseDist));

                            // Re-spread with new spread
                            const newYNorm = 0.5 + baseDist * newSpread;
                            const newWorldY = newYNorm * dynamicWorldHeight;

                            // Calculate new offsets for 2D positioning
                            const newOffsetX = targetScreenX - (worldX * currentScale);
                            const newOffsetY = targetScreenY - (newWorldY * currentScale);

                            setTimelineConfig({ verticalSpread: newSpread });
                            setTransformState({
                                ...transformState,
                                offsetX: newOffsetX,
                                offsetY: newOffsetY
                            });
                            return;
                        }
                    }

                    // Fallback: just update spread without offset change
                    setTimelineConfig({ verticalSpread: newSpread });
                }}
                onSpreadDragStart={() => {
                    // Will be populated on first onChange call
                    spreadDragAnchorRef.current = null;
                }}
                onSpreadDragEnd={() => {
                    spreadDragAnchorRef.current = null;
                }}
                timeLinearity={timeLinearity ?? 1.0}
                onTimeLinearityChange={(level) => {
                    const currentScale = transformState.scale;
                    const viewportWidth = containerSizeRef.current.width;
                    const viewportHeight = containerSizeRef.current.height;

                    // 1. Check if we are currently "Fitted" (Zoomed out to see everything)
                    const isRoughlyFitted = Math.abs(currentScale - minScale) < 0.0001 || (Math.abs(currentScale - minScale) / minScale) < 0.01;

                    if (!isRoughlyFitted && videoPositions.length > 0) {
                        // Try to use persisted anchor, or find new one
                        const hadPersisted = !!timeDragAnchorRef.current;
                        let anchorVideoPos = timeDragAnchorRef.current
                            ? videoPositions.find(v => v.video.id === timeDragAnchorRef.current)
                            : null;

                        // If no persisted anchor, find best one and save it
                        if (!anchorVideoPos) {
                            const foundAnchor = findSmartAnchorTime({
                                videoPositions,
                                currentTransform: transformState,
                                worldWidth,
                                worldHeight: dynamicWorldHeight,
                                viewportWidth,
                                viewportHeight,
                                stats
                            });
                            if (foundAnchor) {
                                timeDragAnchorRef.current = foundAnchor.videoId;
                                anchorVideoPos = videoPositions.find(v => v.video.id === foundAnchor.videoId) ?? null;
                            }
                        }

                        if (anchorVideoPos) {
                            // Get video's current screen position
                            const worldX = anchorVideoPos.xNorm * worldWidth;
                            const worldY = anchorVideoPos.yNorm * dynamicWorldHeight;
                            const screenX = worldX * currentScale + transformState.offsetX;
                            const screenY = worldY * currentScale + transformState.offsetY;

                            // Only apply pull if we had a persisted anchor (not first onChange)
                            let targetScreenX = screenX;
                            let targetScreenY = screenY;

                            if (hadPersisted) {
                                // 2D pull towards center
                                const centerScreenX = viewportWidth / 2;
                                const centerScreenY = HEADER_HEIGHT + (viewportHeight - HEADER_HEIGHT) / 2;

                                const distFromCenterX = Math.abs(screenX - centerScreenX);
                                const distFromCenterY = Math.abs(screenY - centerScreenY);
                                const maxDistX = viewportWidth / 2;
                                const maxDistY = viewportHeight / 2;

                                const pullStrengthX = Math.min(0.3, (distFromCenterX / maxDistX) * 0.3);
                                const pullStrengthY = Math.min(0.3, (distFromCenterY / maxDistY) * 0.3);

                                // Target screen position: blend towards center
                                targetScreenX = screenX + (centerScreenX - screenX) * pullStrengthX;
                                targetScreenY = screenY + (centerScreenY - screenY) * pullStrengthY;
                            }

                            anchorToTime({
                                time: anchorVideoPos.video.publishedAtTimestamp,
                                xNorm: anchorVideoPos.xNorm,
                                yNorm: anchorVideoPos.yNorm,
                                screenX: targetScreenX,
                                screenY: targetScreenY
                            });
                        } else {
                            // 3. Fallback: Center Time
                            const centerX = viewportWidth / 2;
                            const worldX = (centerX - transformState.offsetX) / currentScale;
                            const normX = worldX / worldWidth;
                            const centerTime = getTimeAtWorldX(normX, monthLayouts, stats);
                            anchorToTime(centerTime);
                        }
                    }

                    setTimelineConfig({ timeLinearity: level });
                }}
                onTimeDragStart={() => {
                    timeDragAnchorRef.current = null;
                }}
                onTimeDragEnd={() => {
                    timeDragAnchorRef.current = null;
                }}
                isLoading={isLoading}
            />

            {hoveredVideo && (
                <TrendTooltip
                    key={hoveredVideo.video.id}
                    video={hoveredVideo.video}
                    anchorPos={{
                        x: hoveredVideo.x,
                        y: hoveredVideo.y,
                        width: hoveredVideo.width,
                        height: hoveredVideo.height
                    }}
                    isClosing={isTooltipClosing}
                    onMouseEnter={() => {
                        isTooltipHoveredRef.current = true;
                        setIsTooltipClosing(false); // Cancel closing if we re-enter
                        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
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

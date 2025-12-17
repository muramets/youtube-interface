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
// Hooks
import { useTimelineStructure } from './hooks/useTimelineStructure';
import { useTimelinePositions } from './hooks/useTimelinePositions';
import { useTimelineControlHandlers } from './hooks/useTimelineControlHandlers';
import { useTimelineTransform } from './hooks/useTimelineTransform';
import { useTimelineInteraction } from './hooks/useTimelineInteraction';
import { useTimelineHotkeys } from './hooks/useTimelineHotkeys';

// Constants
const HEADER_HEIGHT = 48;
const PADDING = 40;

import { TrendsFloatingBar } from './TrendsFloatingBar';

interface TimelineCanvasProps {
    videos: TrendVideo[];
    isLoading?: boolean;
    percentileMap?: Map<string, string>;
    forcedStats?: TimelineStats;
    onRequestStatsRefresh?: () => void;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
    videos,
    isLoading = false,
    percentileMap,
    forcedStats,
    onRequestStatsRefresh
}) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen } = useTrendStore();
    const { scalingMode, verticalSpread, timeLinearity } = timelineConfig;

    // State to control structure updates ('Z' key forces update)
    const [structureVersion, setStructureVersion] = useState(0);

    // Smart Structure Updates:
    // We want the timeline to re-calculate structure (Fit) automatically in specific cases,
    // but stay "Frozen" in others (to preserve context).
    const prevVideoCountRef = useRef(videos.length);
    const prevForcedStatsRef = useRef(forcedStats);

    useEffect(() => {
        const currentCount = videos.length;
        const prevCount = prevVideoCountRef.current;
        const prevStats = prevForcedStatsRef.current;
        const hasStatsChanged = prevStats !== forcedStats;

        // Update refs
        prevVideoCountRef.current = currentCount;
        prevForcedStatsRef.current = forcedStats;

        // Skip initial mount check (though refs init with values, so it handles itself)

        // 1. Significance Check: If count didn't change and stats didn't change, do nothing.
        if (currentCount === prevCount && !hasStatsChanged) return;

        // 2. Context Switch (Global <-> Local OR Global stats update)
        // If the context defining the "World" changes, we MUST update.
        if (hasStatsChanged) {
            setStructureVersion(v => v + 1);
            return;
        }

        // 3. Filter Changes (Count Changed)
        if (currentCount !== prevCount) {
            // STRICT FREEZE:
            // If we are in Global Mode (forcedStats provided), we NEVER update structure
            // regardless of whether videos are being added or removed.
            // User must press Z to refit.
            if (forcedStats) {
                return;
            }

            // Local Mode: Always re-calculate structure
            setStructureVersion(v => v + 1);
        }
    }, [videos.length, forcedStats]);

    // 1. Structure Logic
    const {
        worldWidth,
        stats,
        monthLayouts,
        monthRegions,
        yearMarkers
    } = useTimelineStructure({
        videos,
        stats: forcedStats,
        structureVersion,
        timeLinearity,
        isFrozen: !!forcedStats // Freezes internal dependencies when in global mode
    });


    // 4. Interaction
    const {
        containerRef,
        containerSizeRef,
        transformState,
        transformRef,
        setTransformState,
        clampTransform,
        minScale,
        dynamicWorldHeight,
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

    // ... (omitted hook calls to maintain structure)

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
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null); // For handling single vs double click

    // Selected Video for Floating Bar
    const [selectedVideoState, setSelectedVideoState] = useState<{ video: TrendVideo; x: number; y: number } | null>(null);

    const floatingBarPosition = React.useMemo(() => {
        if (!selectedVideoState) return { x: 0, y: 0 };
        return {
            x: selectedVideoState.x,
            y: selectedVideoState.y
        };
    }, [selectedVideoState?.x, selectedVideoState?.y]);

    // Smart Focus Logic (Extracted)
    const {
        handleSpreadChange,
        handleSpreadDragStart,
        handleSpreadDragEnd,
        handleTimeLinearityChange,
        handleTimeDragStart,
        handleTimeDragEnd
    } = useTimelineControlHandlers({
        transformState,
        containerSizeRef,
        minScale,
        videoPositions,
        worldWidth,
        dynamicWorldHeight,
        stats,
        monthLayouts,
        setTimelineConfig,
        setTransformState,
        anchorToTime,
        verticalSpread: verticalSpread ?? 1.0
    });

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
        },
        onInteractionStart: () => {
            // Close floating bar during any zoom/pan/selection interaction
            setSelectedVideoState(null);
        }
    });

    const { isPanning, selectionRect } = interaction;


    // Triggered by 'Z' or Double Click
    const handleSmoothFit = () => {
        closeTooltipSmoothly();

        // Request stats refresh from parent (updates frozen stats to current)
        onRequestStatsRefresh?.();

        // Force structure recalculation
        setStructureVersion(v => v + 1);
        shouldAutoFitRef.current = true; // Explicit request -> Auto Fit
    };

    // Effect to trigger Auto-Fit when structure updates explicitly
    const appliedStructureVersionRef = useRef(0);
    const shouldAutoFitRef = useRef(true); // Default to true for initial load

    const { smoothToTransform } = interaction; // Interaction hook result

    useEffect(() => {
        if (structureVersion > 0 && structureVersion > appliedStructureVersionRef.current) {
            appliedStructureVersionRef.current = structureVersion;

            if (shouldAutoFitRef.current) {
                // EXPLICIT FIT (Z Key / Initial Load)
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
            } else {
                // IMPLICIT UPDATE (Data Added / Visibility Toggle)
                // We do NOT auto-fit. Instead, we rely on `useTimelineTransform`'s pending anchor logic.
                // Note: We already queued the anchor in the render/effect that triggered the update.
            }

            // Reset flag
            shouldAutoFitRef.current = false;
        }
    }, [structureVersion, calculateAutoFitTransform, smoothToTransform, setTimelineConfig, currentContentHash]);


    // NOTE: The main structure update logic is in the first useEffect near the top.
    // This section previously had duplicate logic that has been consolidated.


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
            onClick={(e) => {
                if (e.target === containerRef.current) {
                    setSelectedVideoState(null);
                }
            }}
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
                activeVideoId={selectedVideoState?.video.id || null}
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
                    // Clear any pending single click action
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                        clickTimeoutRef.current = null;
                    }

                    closeTooltipSmoothly(); // Close tooltip on zoom in
                    // Smoothly animate to center the video
                    interaction.zoomToPoint(worldX, worldY, 1.0); // 1.0 = 100% scale
                }}
                onClickVideo={(video, clientX, clientY) => {
                    // Debounce single click to allow double click to happen first
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                    }

                    clickTimeoutRef.current = setTimeout(() => {
                        // Toggle logic: If clicking the same video, close it.
                        if (selectedVideoState?.video.id === video.id) {
                            setSelectedVideoState(null);
                        } else {
                            setSelectedVideoState({
                                video,
                                x: clientX,
                                y: clientY
                            });
                        }
                        clickTimeoutRef.current = null;
                    }, 250); // 250ms wait for potential double click
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
                onSpreadChange={handleSpreadChange}
                onSpreadDragStart={handleSpreadDragStart}
                onSpreadDragEnd={handleSpreadDragEnd}
                timeLinearity={timeLinearity ?? 1.0}
                onTimeLinearityChange={handleTimeLinearityChange}
                onTimeDragStart={handleTimeDragStart}
                onTimeDragEnd={handleTimeDragEnd}
                isLoading={isLoading}
            />

            {/* Hide tooltip when floating bar is visible to avoid z-index artifact */}
            {hoveredVideo && !selectedVideoState && (
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
            {selectedVideoState && (
                <>
                    {/* Invisible backdrop to close floating bar on click outside */}
                    <div
                        className="fixed inset-0 z-[999]"
                        onClick={() => setSelectedVideoState(null)}
                    />
                    <TrendsFloatingBar
                        video={selectedVideoState.video}
                        position={floatingBarPosition}
                        onClose={() => setSelectedVideoState(null)}
                    />
                </>
            )}
        </div>
    );
};

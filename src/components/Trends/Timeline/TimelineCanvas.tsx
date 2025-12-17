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
import { useTimelineStructure } from './hooks/useTimelineStructure';
import { useTimelinePositions } from './hooks/useTimelinePositions';
import { useTimelineControlHandlers } from './hooks/useTimelineControlHandlers';
import { useTimelineTransform } from './hooks/useTimelineTransform';
import { useTimelineInteraction } from './hooks/useTimelineInteraction';
import { useTimelineHotkeys } from './hooks/useTimelineHotkeys';
import { useTimelineAutoUpdate } from './hooks/useTimelineAutoUpdate';
import { useTimelineTooltip } from './hooks/useTimelineTooltip';

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

    // 1. Structure Auto-Update Logic
    const { structureVersion, forceStructureUpdate } = useTimelineAutoUpdate({ videos, forcedStats });

    // 2. Structure Logic
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
        isFrozen: !!forcedStats
    });

    // 3. Tooltip Logic
    const {
        hoveredVideo,
        isTooltipClosing,
        handleHoverVideo,
        handleTooltipMouseEnter,
        handleTooltipMouseLeave,
        forceCloseTooltip
    } = useTimelineTooltip();

    // 4. Transform & Interaction
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

    // 5. Data Positions
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

    // 6. Selected Video for Floating Bar
    const [selectedVideoState, setSelectedVideoState] = useState<{ video: TrendVideo; x: number; y: number } | null>(null);

    const floatingBarPosition = React.useMemo(() => {
        if (!selectedVideoState) return { x: 0, y: 0 };
        return { x: selectedVideoState.x, y: selectedVideoState.y };
    }, [selectedVideoState?.x, selectedVideoState?.y]);

    // 7. Control Handlers (Smart Focus)
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

    const videoLayerRef = useRef<TimelineVideoLayerHandle>(null);
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 8. Main Interaction Hook
    const interaction = useTimelineInteraction({
        containerRef,
        videoLayerRef,
        transformRef,
        minScale,
        containerSizeRef,
        setTransformState,
        clampTransform,
        onHoverVideo: (active: boolean) => {
            if (!active) forceCloseTooltip();
        },
        onInteractionStart: () => {
            setSelectedVideoState(null);
        }
    });

    const { isPanning, selectionRect, smoothToTransform } = interaction;

    // 9. Manual Fit / Auto Fit Logic
    const appliedStructureVersionRef = useRef(0);
    const shouldAutoFitRef = useRef(true);

    const handleSmoothFit = () => {
        forceCloseTooltip();
        onRequestStatsRefresh?.();
        forceStructureUpdate();
        shouldAutoFitRef.current = true;
    };

    // Effect to trigger Auto-Fit when structure updates explicitly
    useEffect(() => {
        if (structureVersion > 0 && structureVersion > appliedStructureVersionRef.current) {
            appliedStructureVersionRef.current = structureVersion;

            if (shouldAutoFitRef.current) {
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
            shouldAutoFitRef.current = false;
        }
    }, [structureVersion, calculateAutoFitTransform, smoothToTransform, setTimelineConfig, currentContentHash]);

    // Hotkeys
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
            onDoubleClick={handleSmoothFit}
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
                onHoverVideo={handleHoverVideo}
                onDoubleClickVideo={(_video, worldX, worldY) => {
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                        clickTimeoutRef.current = null;
                    }
                    forceCloseTooltip();
                    interaction.zoomToPoint(worldX, worldY, 1.0);
                }}
                onClickVideo={(video, clientX, clientY) => {
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                    }
                    clickTimeoutRef.current = setTimeout(() => {
                        if (selectedVideoState?.video.id === video.id) {
                            setSelectedVideoState(null);
                        } else {
                            setSelectedVideoState({ video, x: clientX, y: clientY });
                        }
                        clickTimeoutRef.current = null;
                    }, 250);
                }}
            />

            {/* 3. Headers & UI Overlays (Top Layer) */}
            {isLoading ? (
                <TimelineSkeleton />
            ) : (
                <>
                    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
                        <div className="pointer-events-auto">
                            <TimelineDateHeader
                                yearMarkers={yearMarkers}
                                monthRegions={monthRegions}
                                transform={transformState}
                                worldWidth={worldWidth}
                            />
                        </div>
                    </div>

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

            {/* Check hoveredVideo vs selectedVideoState to avoid tooltip overlap */}
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
                    onMouseEnter={handleTooltipMouseEnter}
                    onMouseLeave={handleTooltipMouseLeave}
                    percentileGroup={getPercentileGroup(hoveredVideo.video.id)}
                />
            )}

            {selectedVideoState && (
                <>
                    <div className="fixed inset-0 z-[999]" onClick={() => setSelectedVideoState(null)} />
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

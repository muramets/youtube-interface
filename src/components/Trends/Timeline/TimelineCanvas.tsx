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
const PADDING_LEFT = 64;
const PADDING_RIGHT = 12;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 12;

import { TrendsFloatingBar } from './TrendsFloatingBar';

interface TimelineCanvasProps {
    videos: TrendVideo[];
    /** Full set of videos for the current context (used for consistent density) */
    allVideos?: TrendVideo[];
    isLoading?: boolean;
    percentileMap?: Map<string, string>;
    forcedStats?: TimelineStats;
    onRequestStatsRefresh?: () => void;
    /** If true, skip auto-fit on next structure update (for filterMode toggle) */
    skipAutoFitRef?: React.RefObject<boolean>;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
    videos,
    allVideos = [],
    isLoading = false,
    percentileMap,
    forcedStats,
    onRequestStatsRefresh,
    skipAutoFitRef
}) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen } = useTrendStore();
    const { scalingMode, verticalSpread, timeLinearity } = timelineConfig;

    // 1. Structure Auto-Update Logic
    const { structureVersion, shouldAutoFit, forceStructureUpdate } = useTimelineAutoUpdate({
        videos,
        forcedStats,
        skipAutoFitRef
    });

    // 2. Structure Logic
    const {
        worldWidth,
        stats,
        monthLayouts,
        monthRegions,
        yearMarkers
    } = useTimelineStructure({
        videos,
        allVideos,
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
        paddingLeft: PADDING_LEFT,
        paddingRight: PADDING_RIGHT,
        paddingTop: PADDING_TOP,
        paddingBottom: PADDING_BOTTOM,
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
    const [selectionState, setSelectionState] = useState<{
        selectedIds: Set<string>;
        lastAnchor: { x: number; y: number } | null;
        hasDocked: boolean;
    }>({ selectedIds: new Set(), lastAnchor: null, hasDocked: false });

    const selectedVideos = React.useMemo(() => {
        return videos.filter(v => selectionState.selectedIds.has(v.id));
    }, [videos, selectionState.selectedIds]);

    const floatingBarPosition = React.useMemo(() => {
        if (selectionState.selectedIds.size === 0 || !selectionState.lastAnchor) return { x: 0, y: 0 };
        return selectionState.lastAnchor;
    }, [selectionState.lastAnchor, selectionState.selectedIds.size]);

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
        onHoverVideo: React.useCallback((active: boolean) => {
            if (!active) forceCloseTooltip();
        }, [forceCloseTooltip]),
        onInteractionStart: React.useCallback(() => {
            // Dock the floating bar on any interaction (zoom/pan) if we have a selection
            setSelectionState(prev => {
                if (prev.selectedIds.size > 0 && !prev.hasDocked) {
                    return { ...prev, hasDocked: true };
                }
                return prev;
            });
        }, [])
    });

    const { isPanning, selectionRect, smoothToTransform } = interaction;

    // 9. Manual Fit / Auto Fit Logic
    const appliedStructureVersionRef = useRef(0);
    const shouldAutoFitRef = useRef(true);

    const handleSmoothFit = () => {
        forceCloseTooltip();
        onRequestStatsRefresh?.();
        forceStructureUpdate(true); // Explicitly request fit
        shouldAutoFitRef.current = true;
    };

    // Effect to trigger Auto-Fit when structure updates explicitly
    useEffect(() => {
        if (structureVersion > 0 && structureVersion > appliedStructureVersionRef.current) {
            appliedStructureVersionRef.current = structureVersion;

            // Use declarative flag from hook OR manual override
            const canFit = shouldAutoFit || shouldAutoFitRef.current;

            if (canFit) {
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
    }, [structureVersion, shouldAutoFit, calculateAutoFitTransform, smoothToTransform, setTimelineConfig, currentContentHash]);

    // Hotkeys (Standard)
    useTimelineHotkeys({ onAutoFit: handleSmoothFit });

    // 10. Global Hotkeys (Cmd+Shift+L to clear)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCmdShiftL = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l';
            const isEsc = e.key === 'Escape';

            if (isCmdShiftL || isEsc) {
                e.preventDefault();
                setSelectionState({ selectedIds: new Set(), lastAnchor: null, hasDocked: false });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Determine visibility logic
    // isMultiSelect logic is handled internally

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
        // onClick removed for background clearing. Selection persists until explicitly cleared (X or Cmd+L).
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
                activeVideoIds={selectionState.selectedIds}
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
                onClickVideo={(video, e) => {
                    const PAN_COOLDOWN_MS = 200;
                    if (Date.now() - interaction.lastPanEndTimeRef.current < PAN_COOLDOWN_MS) {
                        return; // Ignore click if we just finished panning
                    }

                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                    }

                    const isModifier = e.metaKey || e.ctrlKey;
                    const clientX = e.clientX;
                    const clientY = e.clientY;

                    clickTimeoutRef.current = setTimeout(() => {
                        setSelectionState(prev => {
                            const newSet = new Set(prev.selectedIds);

                            // Multi-select toggle
                            if (isModifier) {
                                if (newSet.has(video.id)) {
                                    newSet.delete(video.id);
                                } else {
                                    newSet.add(video.id);
                                }
                                return {
                                    selectedIds: newSet,
                                    lastAnchor: { x: clientX, y: clientY },
                                    hasDocked: prev.hasDocked // Maintain docked state during multi-select operations
                                };
                            }
                            // Single select -> Only update if not already selected or if we want to switch selection
                            else {
                                // Logic: If clicking a different video, select it. 
                                // And RESET docked state (start anchored near video).
                                return {
                                    selectedIds: new Set([video.id]),
                                    lastAnchor: { x: clientX, y: clientY },
                                    hasDocked: false
                                };
                            }
                        });
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

            {/* Check hoveredVideo vs selectedVideos to avoid tooltip overlap */}
            {hoveredVideo && !selectionState.selectedIds.has(hoveredVideo.video.id) && (
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

            {/* Floating Bar with Smart Positioning */}
            <div className="transition-opacity duration-200 opacity-100">
                {selectedVideos.length > 0 && (
                    <TrendsFloatingBar
                        videos={selectedVideos}
                        position={floatingBarPosition}
                        onClose={() => setSelectionState({ selectedIds: new Set(), lastAnchor: null, hasDocked: false })}
                        isDocked={selectionState.hasDocked}
                    />
                )}
            </div>
        </div>
    );
};


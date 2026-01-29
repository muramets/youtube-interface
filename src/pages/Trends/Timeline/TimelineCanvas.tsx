import React, { useRef, useEffect } from 'react';
import { useTrendStore } from '../../../core/stores/trendStore';
import { TrendTooltip } from './TrendTooltip';
import { TimelineDateHeader } from './TimelineDateHeader';
import { TimelineViewAxis } from './TimelineViewAxis';
import { TimelineBackground } from './TimelineBackground';
import { TimelineVideoLayer, type TimelineVideoLayerHandle } from './layers/TimelineVideoLayer';
import { TimelineDotsLayer } from './layers/TimelineDotsLayer';
import { TimelineControls } from './TimelineControls';
import { TimelineSkeleton } from './TimelineSkeleton';
import { TimelineEmptyState } from './TimelineEmptyState';
import { TimelineSelectionOverlay } from './TimelineSelectionOverlay';
import type { TrendVideo, TimelineStats } from '../../../core/types/trends';
import { TimelineAverageLine } from './layers/TimelineAverageLine';

// Hooks
import { useTimelineStructure } from './hooks/useTimelineStructure';
import { useTimelinePositions } from './hooks/useTimelinePositions';
import { useTimelineControlHandlers } from './hooks/useTimelineControlHandlers';
import { useTimelineTransform } from './hooks/useTimelineTransform';
import { useTimelineInteraction } from './hooks/useTimelineInteraction';
import { useTimelineHotkeys } from './hooks/useTimelineHotkeys';
import { useTimelineAutoUpdate } from './hooks/useTimelineAutoUpdate';
import { useTimelineTooltip } from './hooks/useTimelineTooltip';
import { useSelectionState } from './hooks/useSelectionState';
import { LOD_SHOW_THUMBNAIL } from './utils/timelineConstants';

// Constants
const HEADER_HEIGHT = 48;
const PADDING_LEFT = 64;
const PADDING_RIGHT = 12;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 12;



import { TrendsFloatingBar } from './TrendsFloatingBar';

interface TimelineCanvasProps {
    videos: TrendVideo[];
    /** Full set of videos for current context (used for consistent density) */
    allVideos?: TrendVideo[];
    isLoading?: boolean;
    percentileMap?: Map<string, string>;
    /** Frozen stats from parent (used when shouldAutoFit is false) */
    frozenStats?: TimelineStats;
    /** Real-time stats from parent (used for initial fit) */
    currentStats?: TimelineStats;
    /** If true, calculate stats from videos; if false, use frozenStats */
    shouldAutoFit?: boolean;
    onRequestStatsRefresh?: () => void;
    /** If true, skip auto-fit on next structure update (for filterMode toggle) */
    skipAutoFitRef?: React.RefObject<boolean>;
    filterHash?: string;
    /** True when on main page and all channels have visibility toggled off */
    allChannelsHidden?: boolean;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
    videos,
    allVideos = [],
    isLoading = false,
    percentileMap,
    frozenStats,
    currentStats,
    shouldAutoFit = false,
    onRequestStatsRefresh,
    skipAutoFitRef,
    filterHash,
    allChannelsHidden = false
}) => {
    const { timelineConfig, setTimelineConfig, setAddChannelModalOpen, clearTrendsFilters, savedConfigs, saveConfigForHash } = useTrendStore();
    const { scalingMode, verticalSpread, timeLinearity, showAverageBaseline } = timelineConfig;

    // Determine effective stats for triggering updates. 
    // In Filtered mode (shouldAutoFit=true), we use undefined to signal real-time Scaling.
    // In Global/Stable mode, we use frozenStats to detect context shifts.
    const triggeringStats = shouldAutoFit ? undefined : frozenStats;

    // 1. Structure Auto-Update Logic
    const { structureVersion, forceStructureUpdate, shouldAutoFit: hookShouldAutoFit } = useTimelineAutoUpdate({
        videos,
        forcedStats: triggeringStats,
        skipAutoFitRef,
        filterHash
    });

    // Determine stats specifically for current structure calculation.
    // If we are currently triggering a fit (hookShouldAutoFit), we MUST use currentStats 
    // to ensure the jump is accurate, even if we are in a "frozen" context.
    const statsForStructure = (shouldAutoFit || hookShouldAutoFit) ? currentStats : frozenStats;

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
        stats: statsForStructure,
        structureVersion,
        timeLinearity,
        isFrozen: !shouldAutoFit
    });

    // 3. Selection State (Moved up for Tooltip dependency)
    const {
        selectionState,
        handleVideoClick,
        clearSelection,
        dockFloatingBar
    } = useSelectionState();

    // 4. Tooltip Logic
    const {
        hoveredVideo,
        isTooltipClosing,
        handleHoverVideo,
        handleTooltipMouseEnter,
        handleTooltipMouseLeave,
        forceCloseTooltip
    } = useTimelineTooltip({
        // If we have selected videos, we delay the tooltip show
        delayShowCondition: selectionState.selectedIds.size > 0
    });

    const selectedVideos = React.useMemo(() => {
        return videos.filter(v => selectionState.selectedIds.has(v.id));
    }, [videos, selectionState.selectedIds]);

    const floatingBarPosition = React.useMemo(() => {
        if (selectionState.selectedIds.size === 0 || !selectionState.lastAnchor) return { x: 0, y: 0 };
        return selectionState.lastAnchor;
    }, [selectionState.lastAnchor, selectionState.selectedIds.size]);

    // Track if FloatingBar has an active dropdown (for hotkey handling)
    const [hasActiveDropdown, setHasActiveDropdown] = React.useState(false);


    // 5. Transform & Interaction
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

    // 6. Data Positions
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
            dockFloatingBar();
        }, [dockFloatingBar])
    });

    const { isPanning, selectionRect, smoothToTransform } = interaction;
    // 9. Manual Fit / Auto Fit Logic
    const appliedStructureVersionRef = useRef(0);
    const shouldAutoFitRef = useRef(false);

    const handleSmoothFit = () => {
        forceCloseTooltip();
        onRequestStatsRefresh?.();
        forceStructureUpdate(true); // Explicitly request fit
        shouldAutoFitRef.current = true;
    };

    // Effect to trigger Auto-Fit when structure updates explicitly
    // WHY: This uses smoothToTransform (animated) for manual reset (double-click/hotkey).
    // Contrast: useTimelineTransform uses instant setTransformState for hash changes.
    // We skip auto-fit if savedConfigs exists (Miro-like: restore saved position instead).
    useEffect(() => {
        if (structureVersion > 0 && structureVersion > appliedStructureVersionRef.current) {
            appliedStructureVersionRef.current = structureVersion;

            // Use declarative flag from hook OR manual override
            // MIRO-LIKE FIX: If we have a saved config, ignore the hook's auto-fit request (which happens on load),
            // unless it's a manual override (shouldAutoFitRef).
            const hasSavedState = !!savedConfigs[currentContentHash];
            const canFit = shouldAutoFitRef.current || (hookShouldAutoFit && !hasSavedState);

            if (canFit) {
                const fitTransform = calculateAutoFitTransform();
                if (fitTransform) {
                    smoothToTransform(fitTransform);
                    const configUpdate = {
                        zoomLevel: fitTransform.scale,
                        offsetX: fitTransform.offsetX,
                        offsetY: fitTransform.offsetY,
                        contentHash: currentContentHash
                    };
                    setTimelineConfig(configUpdate);
                    // Persist immediately to savedConfigs (fixes Z key not saving)
                    saveConfigForHash(currentContentHash, configUpdate);
                }
            }
            shouldAutoFitRef.current = false;
        }
    }, [structureVersion, hookShouldAutoFit, calculateAutoFitTransform, smoothToTransform, setTimelineConfig, currentContentHash, savedConfigs, saveConfigForHash]);

    // Hotkeys (Standard)
    useTimelineHotkeys({
        onAutoFit: handleSmoothFit,
        onEscape: clearSelection,
        hasActiveDropdown
    });

    // 10. Global Hotkeys (Cmd+Shift+L to clear)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCmdShiftL = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l';

            if (isCmdShiftL) {
                e.preventDefault();
                clearSelection();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [clearSelection]);

    // Determine visibility logic
    const showThumbnails = transformState.scale >= LOD_SHOW_THUMBNAIL;

    // Determine if pan is available (not at fit-in state)
    const canPan = transformState.scale > minScale * 1.01; // Small buffer for floating point comparison

    return (
        <div
            ref={containerRef}
            className="w-full h-[calc(100vh-56px)] flex flex-col bg-bg-primary overflow-hidden relative select-none"
            style={{ cursor: isPanning ? 'grabbing' : (canPan ? 'grab' : 'default') }}
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
            {!isLoading && videos.length > 0 && (
                <TimelineBackground
                    monthRegions={monthRegions}
                    transform={transformState}
                    worldWidth={worldWidth}
                    timeLinearity={timeLinearity ?? 1.0}
                />
            )}

            {/* 1.5. Average Baseline Layer (Optional) */}
            {showAverageBaseline && stats && !isLoading && (
                <TimelineAverageLine
                    videos={videos}
                    stats={stats}
                    scalingMode={scalingMode}
                    verticalSpread={verticalSpread ?? 1.0}
                    dynamicWorldHeight={dynamicWorldHeight}
                    transform={transformState}
                    baselineMode={timelineConfig.baselineMode}
                    baselineWindowSize={timelineConfig.baselineWindowSize} // Added
                    worldWidth={worldWidth}
                    monthLayouts={monthLayouts}
                    isVideoLayer={showThumbnails}
                />
            )}

            {/* 2. Video Content (Middle Layer) */}

            {/* Optimized Canvas Layer for Zoomed Out State */}
            {!isLoading && !showThumbnails && (
                <TimelineDotsLayer
                    videoPositions={videoPositions}
                    transform={transformState}
                    worldWidth={worldWidth}
                    worldHeight={dynamicWorldHeight}
                    activeVideoIds={selectionState.selectedIds}
                    getPercentileGroup={getPercentileGroup}
                    verticalSpread={verticalSpread}
                    onHoverVideo={handleHoverVideo}
                    onClickVideo={(video, e) => {
                        forceCloseTooltip();
                        handleVideoClick(video, e.clientX, e.clientY, e.metaKey || e.ctrlKey);
                    }}
                    onDoubleClickVideo={(_video, worldX, worldY, e) => {
                        // Only zoom on Cmd/Ctrl + Double-Click (Figma-style)
                        const isModifier = e.metaKey || e.ctrlKey;
                        if (isModifier) {
                            forceCloseTooltip();
                            interaction.zoomToPoint(worldX, worldY, 1.0);
                        }
                    }}
                    onClickEmpty={() => {
                        clearSelection();
                    }}
                />
            )}

            {/* DOM Layer for Zoomed In State (Thumbnails) */}
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
                isLoading={isLoading}
                isHidden={!showThumbnails}
                onHoverVideo={handleHoverVideo}
                onDoubleClickVideo={(_video, worldX, worldY, e) => {
                    // Only zoom on Cmd/Ctrl + Double-Click (Figma-style)
                    const isModifier = e.metaKey || e.ctrlKey;
                    if (isModifier) {
                        forceCloseTooltip();
                        interaction.zoomToPoint(worldX, worldY, 1.0);
                    }
                }}
                onClickVideo={(video, e) => {
                    const PAN_COOLDOWN_MS = 200;
                    if (Date.now() - interaction.lastPanEndTimeRef.current < PAN_COOLDOWN_MS) {
                        return; // Ignore click if we just finished panning
                    }

                    forceCloseTooltip();
                    handleVideoClick(video, e.clientX, e.clientY, e.metaKey || e.ctrlKey);
                }}
            />

            {/* Empty State (visible regardless of zoom level) */}
            {!isLoading && videos.length === 0 && (
                <TimelineEmptyState
                    variant={allChannelsHidden ? 'channels-hidden' : (allVideos?.length ?? 0) > 0 ? 'filtered' : 'no-data'}
                    onAddChannels={() => setAddChannelModalOpen(true)}
                    onClearFilters={clearTrendsFilters}
                />
            )}

            {/* 3. Headers & UI Overlays (Top Layer) */}
            {isLoading ? (
                <TimelineSkeleton />
            ) : videos.length > 0 ? (
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
            ) : null}

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
                        onClose={clearSelection}
                        isDocked={selectionState.hasDocked}
                        onActiveMenuChange={setHasActiveDropdown}
                    />
                )}
            </div>
        </div>
    );
};


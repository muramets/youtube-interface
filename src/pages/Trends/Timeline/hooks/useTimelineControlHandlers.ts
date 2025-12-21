import { useRef, useCallback } from 'react';
import type { VideoPosition, TimelineStats, MonthLayout } from '../../../../types/trends';
import type { Transform } from './useTimelineTransform';
import { findSmartAnchorTime, getTimeAtWorldX } from '../utils/timelineMath';

interface UseTimelineControlHandlersProps {
    transformState: Transform;
    containerSizeRef: React.MutableRefObject<{ width: number; height: number }>;
    minScale: number;
    videoPositions: VideoPosition[];
    worldWidth: number;
    dynamicWorldHeight: number;
    stats: TimelineStats;
    monthLayouts: MonthLayout[];
    setTimelineConfig: (config: any) => void;
    setTransformState: (transform: Transform) => void;
    anchorToTime: (anchor: number | { time: number; xNorm?: number; yNorm?: number; screenX?: number; screenY?: number }) => void;
    verticalSpread: number;
}

export const useTimelineControlHandlers = ({
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
    verticalSpread
}: UseTimelineControlHandlersProps) => {

    const HEADER_HEIGHT = 48; // Constant from Canvas, could receive as prop if needed

    // Persist anchor video during drag to prevent jumping between videos
    const spreadDragAnchorRef = useRef<string | null>(null);
    const timeDragAnchorRef = useRef<string | null>(null);

    const handleSpreadChange = useCallback((newSpread: number) => {
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
    }, [
        videoPositions, transformState, containerSizeRef, minScale,
        worldWidth, dynamicWorldHeight, stats, verticalSpread,
        setTimelineConfig, setTransformState
    ]);

    const handleTimeLinearityChange = useCallback((level: number) => {
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
    }, [
        videoPositions, transformState, containerSizeRef, minScale,
        worldWidth, dynamicWorldHeight, stats, monthLayouts,
        anchorToTime, setTimelineConfig
    ]);

    return {
        handleSpreadChange,
        handleSpreadDragStart: useCallback(() => { spreadDragAnchorRef.current = null; }, []),
        handleSpreadDragEnd: useCallback(() => { spreadDragAnchorRef.current = null; }, []),
        handleTimeLinearityChange,
        handleTimeDragStart: useCallback(() => { timeDragAnchorRef.current = null; }, []),
        handleTimeDragEnd: useCallback(() => { timeDragAnchorRef.current = null; }, []),
    };
};

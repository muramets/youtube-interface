// =============================================================================
// CANVAS: SnapshotFrame — visual frame rectangle around grouped traffic nodes
// Draggable via title bar — moves all child nodes as a group.
// Bounds are computed reactively from child node positions.
// =============================================================================

import React, { useRef, useCallback } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { getSourceVideoId, getNodeDataType } from '../../../core/types/canvas';
import type { TrafficSourceCardData, TrafficDiscrepancy } from '../../../core/types/appContext';
import { liveZoom } from '../utils/liveZoom';
import { usePointerDrag } from '../hooks/usePointerDrag';
import { useSnap } from '../utils/SnapContext';
import { FrameDiscrepancyTooltip } from './FrameDiscrepancyTooltip';

interface SnapshotFrameProps {
    /** Frame key: "sourceVideoId::snapshotId" */
    frameKey: string;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** Cumulative Long Tail discrepancy (from snapshot Total Row) */
    discrepancy?: TrafficDiscrepancy;
}

/**
 * Renders a labeled frame rectangle on the canvas.
 * Title bar is draggable — drags all child nodes in the frame group.
 */
const SnapshotFrameInner: React.FC<SnapshotFrameProps> = ({ frameKey, label, x, y, w, h, discrepancy }) => {
    const moveNodes = useCanvasStore((s) => s.moveNodes);

    // Parse sourceVideoId and snapshotId from the frame key
    const [sourceVideoId, snapshotId] = frameKey.split('::');

    // Drag ref: stores start positions of all child nodes
    const dragRef = useRef<{
        startClientX: number;
        startClientY: number;
        zoom: number;
        nodeStartPositions: { id: string; x: number; y: number }[];
        frameStartX: number;  // frame origin at drag start
        frameStartY: number;
        frameW: number;
        frameH: number;
        excludeIds: Set<string>;
    } | null>(null);

    const { applySnap, clearGuides } = useSnap();

    const [isDragging, startDrag] = usePointerDrag({
        onMove: (clientX, clientY) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = (clientX - d.startClientX) / d.zoom;
            const dy = (clientY - d.startClientY) / d.zoom;

            // Snap using frame bounds (not child node positions)
            const rawRect = {
                x: d.frameStartX + dx,
                y: d.frameStartY + dy,
                w: d.frameW,
                h: d.frameH,
            };
            const snapped = applySnap(rawRect, d.excludeIds);
            const snapDx = snapped.x - rawRect.x;
            const snapDy = snapped.y - rawRect.y;

            moveNodes(d.nodeStartPositions.map(({ id, x: sx, y: sy }) => ({
                id,
                position: { x: sx + dx + snapDx, y: sy + dy + snapDy },
            })));
        },
        onEnd: () => clearGuides(),
    });

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        // Snapshot undo state before drag
        useCanvasStore.getState()._pushUndo();

        // Find all nodes belonging to this frame group
        const nodes = useCanvasStore.getState().nodes;
        const frameNodes = nodes.filter((n) => {
            if (!n.position) return false;
            if (getNodeDataType(n.data) !== 'traffic-source') return false;
            const srcVid = getSourceVideoId(n.data);
            if (srcVid !== sourceVideoId) return false;
            const data = n.data as TrafficSourceCardData;
            return data.snapshotId === snapshotId;
        });

        const nodeStartPositions = frameNodes.map((n) => ({
            id: n.id,
            x: n.position!.x,
            y: n.position!.y,
        }));

        dragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            zoom: liveZoom.current,
            nodeStartPositions,
            frameStartX: x,
            frameStartY: y,
            frameW: w,
            frameH: h,
            excludeIds: new Set(frameNodes.map((n) => n.id)),
        };
        startDrag();
    }, [sourceVideoId, snapshotId, x, y, w, h, startDrag]);

    return (
        <>
            {isDragging && (
                <div className="fixed inset-0 z-overlay-ui" style={{ cursor: 'grabbing' }} />
            )}
            <div
                className="snapshot-frame"
                style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    pointerEvents: 'none',
                }}
            >
                <div
                    className="snapshot-frame__title"
                    style={{
                        pointerEvents: 'auto',
                        cursor: isDragging ? 'grabbing' : 'grab',
                    }}
                    onMouseDown={handleDragStart}
                >
                    {label}
                    {discrepancy && <FrameDiscrepancyTooltip discrepancy={discrepancy} />}
                </div>
            </div>
        </>
    );
};

export const SnapshotFrame = React.memo(SnapshotFrameInner);
SnapshotFrame.displayName = 'SnapshotFrame';

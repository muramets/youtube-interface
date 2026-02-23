// =============================================================================
// CANVAS: ConnectionHandles — 4 anchor dots per node for creating edges.
// On mousedown: measures the handle's actual DOM center → converts to world coords.
// On mouseenter during drag: measures target handle center → provides snap anchor.
// This guarantees edge lines exit/enter exactly at visible dot centers.
// =============================================================================

import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import type { CanvasNode, HandlePosition } from '../../core/types/canvas';

interface ConnectionHandlesProps {
    node: CanvasNode;
    visible: boolean;
}

const HANDLES: { position: HandlePosition; style: React.CSSProperties }[] = [
    { position: 'top', style: { top: -6, left: '50%', transform: 'translateX(-50%)' } },
    { position: 'right', style: { right: -6, top: '50%', transform: 'translateY(-50%)' } },
    { position: 'bottom', style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' } },
    { position: 'left', style: { left: -6, top: '50%', transform: 'translateY(-50%)' } },
];

/** Convert screen pixel center of a DOMRect to world coordinates */
function screenToWorld(screenX: number, screenY: number) {
    const { viewport } = useCanvasStore.getState();
    return {
        x: (screenX - viewport.x) / viewport.zoom,
        y: (screenY - viewport.y) / viewport.zoom,
    };
}

/** Get the center of an element in world coordinates */
function elementCenterWorld(el: Element) {
    const rect = el.getBoundingClientRect();
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

const ConnectionHandlesInner: React.FC<ConnectionHandlesProps> = ({ node, visible }) => {
    const {
        startPendingEdge,
        updatePendingEdge,
        setSnapTarget,
        clearSnapTarget,
        completePendingEdge,
        cancelPendingEdge,
        pendingEdge,
    } = useCanvasStore(
        useShallow((s) => ({
            startPendingEdge: s.startPendingEdge,
            updatePendingEdge: s.updatePendingEdge,
            setSnapTarget: s.setSnapTarget,
            clearSnapTarget: s.clearSnapTarget,
            completePendingEdge: s.completePendingEdge,
            cancelPendingEdge: s.cancelPendingEdge,
            pendingEdge: s.pendingEdge,
        }))
    );

    const isDraggingEdge = pendingEdge !== null;
    const isTargetNode = isDraggingEdge && pendingEdge.sourceNodeId !== node.id;

    const handleMouseDown = useCallback((e: React.MouseEvent, position: HandlePosition) => {
        e.preventDefault();
        e.stopPropagation();

        // Measure the exact center of THIS handle dot in world coordinates
        const sourceAnchor = elementCenterWorld(e.currentTarget);
        startPendingEdge(node.id, position, sourceAnchor);

        const onMouseMove = (ev: MouseEvent) => {
            const worldPos = screenToWorld(ev.clientX, ev.clientY);
            updatePendingEdge(worldPos.x, worldPos.y);
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const { pendingEdge: pe } = useCanvasStore.getState();
            if (pe?.snapTarget) {
                completePendingEdge(pe.snapTarget.nodeId, pe.snapTarget.handle);
                return;
            }
            cancelPendingEdge();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [node.id, startPendingEdge, updatePendingEdge, completePendingEdge, cancelPendingEdge]);

    const showHandles = visible || isDraggingEdge;

    return (
        <>
            {HANDLES.map(({ position, style }) => {
                const isSnapping =
                    isDraggingEdge &&
                    pendingEdge.snapTarget?.nodeId === node.id &&
                    pendingEdge.snapTarget?.handle === position;

                return (
                    <div
                        key={position}
                        data-canvas-handle="true"
                        data-node-id={node.id}
                        data-handle={position}
                        className={`absolute w-3 h-3 rounded-full shadow-sm transition-all duration-150 z-10
                            ${showHandles ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}
                            ${isSnapping ? 'scale-150' : 'hover:scale-125'}
                            cursor-crosshair`}
                        style={{
                            ...style,
                            background: isSnapping ? '#6366f1' : 'var(--text-tertiary)',
                            opacity: showHandles ? (isSnapping ? 1 : 0.55) : 0,
                        }}
                        onMouseDown={(e) => handleMouseDown(e, position)}
                        onMouseEnter={(e) => {
                            if (!isTargetNode) return;
                            // Measure the exact center of THIS target handle dot
                            const anchor = elementCenterWorld(e.currentTarget);
                            setSnapTarget(node.id, position, anchor);
                        }}
                        onMouseLeave={() => {
                            if (isTargetNode) clearSnapTarget();
                        }}
                    />
                );
            })}
        </>
    );
};

export const ConnectionHandles = React.memo(ConnectionHandlesInner);
ConnectionHandles.displayName = 'ConnectionHandles';

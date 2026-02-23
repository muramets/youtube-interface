// =============================================================================
// CANVAS: CanvasNodeWrapper — positions a node on the canvas transform layer.
// Provides: drag-to-move, shift+click multi-select, group drag, delete (×),
// bring-to-front, connection handles, bottom-right resize handle.
// ResizeObserver reports actual node height to store (used by edge anchor math).
// =============================================================================

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { liveZoom } from './liveZoom';
import { useShallow } from 'zustand/react/shallow';
import { ConnectionHandles } from './ConnectionHandles';
import type { CanvasNode } from '../../core/types/canvas';
import { NODE_WIDTH } from '../../core/stores/canvas/constants';
import { usePointerDrag } from './hooks/usePointerDrag';

interface CanvasNodeWrapperProps {
    node: CanvasNode;
    children: React.ReactNode;
}

export const CanvasNodeWrapper: React.FC<CanvasNodeWrapperProps> = ({ node, children }) => {
    const {
        moveNode, moveNodes, deleteNode, updateNodeSize, resizeNode,
        selectedNodeIds, selectNode, markPlaced,
    } = useCanvasStore(
        useShallow((s) => ({
            moveNode: s.moveNode,
            moveNodes: s.moveNodes,
            deleteNode: s.deleteNode,
            updateNodeSize: s.updateNodeSize,
            resizeNode: s.resizeNode,
            selectedNodeIds: s.selectedNodeIds,
            selectNode: s.selectNode,
            markPlaced: s.markPlaced,
        }))
    );

    const [isHovered, setIsHovered] = useState(false);
    const isSelected = selectedNodeIds.has(node.id);
    const nodeRef = useRef<HTMLDivElement>(null);

    // dragRef stores start info for group drag
    const dragRef = useRef<{
        startClientX: number;
        startClientY: number;
        zoom: number;
        nodeStartPositions: { id: string; x: number; y: number }[];
    } | null>(null);

    // resizeRef stores start info for resize drag
    const resizeRef = useRef<{
        startClientX: number;
        startClientY: number;
        startWidth: number;
        startHeight: number;
        mode: 'corner' | 'right' | 'bottom';
        zoom: number;
    } | null>(null);

    // Observe node height → report to store for edge anchor math
    useEffect(() => {
        const el = nodeRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            updateNodeSize(node.id, entry.contentRect.height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [node.id, updateNodeSize]);

    // --- Drag to move (rAF-throttled) ---
    const [isDragging, startDrag] = usePointerDrag({
        onMove: (clientX, clientY) => {
            const d = dragRef.current;
            if (!d) return;
            const dx = (clientX - d.startClientX) / d.zoom;
            const dy = (clientY - d.startClientY) / d.zoom;
            if (d.nodeStartPositions.length === 1) {
                const { id, x, y } = d.nodeStartPositions[0];
                moveNode(id, { x: x + dx, y: y + dy });
            } else {
                moveNodes(d.nodeStartPositions.map(({ id, x, y }) => ({
                    id,
                    position: { x: x + dx, y: y + dy },
                })));
            }
        },
    });

    // --- Resize (rAF-throttled) ---
    const [isResizing, startResize] = usePointerDrag({
        onMove: (clientX, clientY) => {
            const r = resizeRef.current;
            if (!r) return;
            const dx = (clientX - r.startClientX) / r.zoom;
            const dy = (clientY - r.startClientY) / r.zoom;
            if (r.mode === 'corner') {
                resizeNode(node.id, r.startWidth + dx, r.startHeight + dy);
            } else if (r.mode === 'right') {
                resizeNode(node.id, r.startWidth + dx);
            } else if (r.mode === 'bottom') {
                resizeNode(node.id, r.startWidth, r.startHeight + dy);
            }
        },
    });

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;

        // Dismiss the "new node" indigo glow on first interaction
        markPlaced(node.id);

        if (e.metaKey) {
            selectNode(node.id, true);
            return;
        }

        // Note: bringToFront is intentionally NOT called here.
        // During drag, the node renders at z-index 9999 via the isDragging CSS override,
        // so no persistent zIndex mutation is needed. This preserves user-set z-ordering
        // from the Bring to Front / Send to Back toolbar buttons.

        const currentSelectedIds = useCanvasStore.getState().selectedNodeIds;
        const currentNodes = useCanvasStore.getState().nodes;
        const ids = currentSelectedIds.has(node.id)
            ? Array.from(currentSelectedIds)
            : [node.id];

        if (!currentSelectedIds.has(node.id)) {
            selectNode(node.id, false);
        }

        const nodeStartPositions = ids.map((id) => {
            const n = currentNodes.find((nd) => nd.id === id);
            return { id, x: n?.position?.x ?? 0, y: n?.position?.y ?? 0 };
        });

        dragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            zoom: liveZoom.current,
            nodeStartPositions,
        };
        startDrag();
    }, [node.id, selectNode, startDrag, markPlaced]);

    const isSticky = node.type === 'sticky-note';

    const makeResizeStart = useCallback((mode: 'corner' | 'right' | 'bottom') =>
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const el = nodeRef.current;
            resizeRef.current = {
                startClientX: e.clientX,
                startClientY: e.clientY,
                startWidth: node.size?.w ?? NODE_WIDTH,
                startHeight: el?.offsetHeight ?? 100,
                mode,
                zoom: liveZoom.current,
            };
            startResize();
        }
        , [node.size, startResize]);

    const handleResizeCorner = makeResizeStart('corner');
    const handleResizeRight = makeResizeStart('right');
    const handleResizeBottom = makeResizeStart('bottom');

    // Cursor for the full-screen overlay while resizing
    const resizeCursor = !isResizing ? 'grabbing'
        : resizeRef.current?.mode === 'right' ? 'ew-resize'
            : resizeRef.current?.mode === 'bottom' ? 'ns-resize'
                : 'nwse-resize';

    if (!node.position) return null;

    const nodeWidth = node.size?.w ?? NODE_WIDTH;
    const nodeHeight = (node.size?.h && node.size.h > 0) ? node.size.h : undefined;

    return (
        <>
            {(isDragging || isResizing) && (
                <div className="fixed inset-0 z-overlay-ui" style={{ cursor: isDragging ? 'grabbing' : resizeCursor }} />
            )}

            <div
                ref={nodeRef}
                className={`canvas-node absolute ${!node.isPlaced ? 'canvas-node-pending' : ''} ${isResizing ? 'is-resizing' : ''}`}
                data-node-id={node.id}
                style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: nodeWidth,
                    height: nodeHeight,
                    zIndex: node.zIndex,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    // Selection ring
                    outline: isSelected ? '2px solid #6366f1' : undefined,
                    outlineOffset: isSelected ? '2px' : undefined,
                    borderRadius: isSelected
                        ? (node.type === 'sticky-note' ? '4px' : '14px')
                        : undefined,
                }}
                onMouseDown={handleDragStart}
                onMouseEnter={() => {
                    setIsHovered(true);
                    useCanvasStore.getState().setLastHoveredNodeId(node.id);
                }}
                onMouseLeave={() => setIsHovered(false)}
                onClick={(e) => e.stopPropagation()}
            >
                <ConnectionHandles node={node} visible={isHovered} />

                <button
                    className={`absolute -top-2.5 -right-2.5 z-10 w-5 h-5 rounded-full bg-bg-primary border border-border shadow-md flex items-center justify-center text-text-secondary hover:text-white hover:bg-red-500 hover:border-red-500 transition-all duration-150 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Remove from Canvas"
                >
                    <X size={10} strokeWidth={2.5} />
                </button>

                {/* Corner resize handle — bottom-right. Counter-scales with zoom. */}
                <div
                    className={`absolute transition-opacity duration-150 ${isHovered || isResizing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{
                        cursor: isSticky ? 'nwse-resize' : 'ew-resize',
                        background: 'linear-gradient(135deg, transparent 50%, rgba(99,102,241,0.6) 50%)',
                        borderRadius: '2px',
                        width: 'calc(20px / var(--canvas-zoom, 1))',
                        height: 'calc(20px / var(--canvas-zoom, 1))',
                        bottom: 'calc(-4px / var(--canvas-zoom, 1))',
                        right: 'calc(-4px / var(--canvas-zoom, 1))',
                        zIndex: 20, // Above edge handles (z-10) to prevent interception
                    }}
                    onMouseDown={handleResizeCorner}
                />

                {children}

                {/* Sticky note edge handles — rendered after children so they're on top. Invisible, cursor only. */}
                {isSticky && (
                    <>
                        {/* Right edge */}
                        <div
                            className={`absolute top-0 right-0 h-full ${isHovered || isResizing ? 'pointer-events-auto' : 'pointer-events-none'}`}
                            style={{
                                width: 'calc(8px / var(--canvas-zoom, 1))',
                                cursor: 'ew-resize',
                                zIndex: 10,
                            }}
                            onMouseDown={handleResizeRight}
                        />
                        {/* Bottom edge */}
                        <div
                            className={`absolute bottom-0 left-0 w-full ${isHovered || isResizing ? 'pointer-events-auto' : 'pointer-events-none'}`}
                            style={{
                                height: 'calc(8px / var(--canvas-zoom, 1))',
                                cursor: 'ns-resize',
                                zIndex: 10,
                            }}
                            onMouseDown={handleResizeBottom}
                        />
                    </>
                )}
            </div>
        </>
    );
};

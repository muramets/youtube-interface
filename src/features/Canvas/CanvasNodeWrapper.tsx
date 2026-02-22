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
        moveNode, moveNodes, deleteNode, bringToFront, updateNodeSize, resizeNode,
        selectedNodeIds, selectNode,
    } = useCanvasStore(
        useShallow((s) => ({
            moveNode: s.moveNode,
            moveNodes: s.moveNodes,
            deleteNode: s.deleteNode,
            bringToFront: s.bringToFront,
            updateNodeSize: s.updateNodeSize,
            resizeNode: s.resizeNode,
            selectedNodeIds: s.selectedNodeIds,
            selectNode: s.selectNode,
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
        startWidth: number;
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
        onMove: (clientX) => {
            const r = resizeRef.current;
            if (!r) return;
            const dx = (clientX - r.startClientX) / r.zoom;
            resizeNode(node.id, r.startWidth + dx);
        },
    });

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;

        if (e.metaKey) {
            selectNode(node.id, true);
            return;
        }

        bringToFront(node.id);

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
    }, [node.id, bringToFront, selectNode, startDrag]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        resizeRef.current = {
            startClientX: e.clientX,
            startWidth: node.size?.w ?? NODE_WIDTH,
            zoom: liveZoom.current,
        };
        startResize();
    }, [node.size, startResize]);

    if (!node.position) return null;

    const nodeWidth = node.size?.w ?? NODE_WIDTH;

    return (
        <>
            {(isDragging || isResizing) && (
                <div className="fixed inset-0 z-overlay-ui" style={{ cursor: isResizing ? 'ew-resize' : 'grabbing' }} />
            )}

            <div
                ref={nodeRef}
                className="canvas-node absolute"
                data-node-id={node.id}
                style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: nodeWidth,
                    zIndex: isDragging ? 9999 : node.zIndex,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    // Selection ring
                    outline: isSelected ? '2px solid #6366f1' : undefined,
                    outlineOffset: isSelected ? '2px' : undefined,
                    borderRadius: isSelected ? '14px' : undefined,
                }}
                onMouseDown={handleDragStart}
                onMouseEnter={() => setIsHovered(true)}
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

                {/* Resize handle — bottom-right corner */}
                <div
                    className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-sm transition-opacity duration-150 ${isHovered || isResizing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    style={{
                        cursor: 'ew-resize',
                        background: 'linear-gradient(135deg, transparent 50%, rgba(99,102,241,0.6) 50%)',
                    }}
                    onMouseDown={handleResizeStart}
                />

                {children}
            </div>
        </>
    );
};

// =============================================================================
// CANVAS: CanvasNodeWrapper — positions a node on the canvas transform layer.
// Provides: drag-to-move, shift+click multi-select, group drag, delete (×),
// bring-to-front, connection handles, bottom-right resize handle.
// ResizeObserver reports actual node height to store (used by edge anchor math).
// =============================================================================

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import { liveZoom } from './utils/liveZoom';
import { useShallow } from 'zustand/react/shallow';
import { ConnectionHandles } from './ConnectionHandles';
import SimplifiedNode from './SimplifiedNode';
import MediumLodNode from './MediumLodNode';
import { InsightButtons } from './InsightButtons';
import type { CanvasNode } from '../../core/types/canvas';
import type { TrafficSourceCardData } from '../../core/types/appContext';
import { NODE_WIDTH } from '../../core/stores/canvas/constants';
import { usePointerDrag } from './hooks/usePointerDrag';
import { debug } from '../../core/utils/debug';

export type LodLevel = 'full' | 'medium' | 'minimal';

interface CanvasNodeWrapperProps {
    node: CanvasNode;
    children: React.ReactNode;
    /** Current LOD level: 'full' | 'medium' | 'minimal' */
    lodLevel?: LodLevel;
    /** Measured height from nodeSizes store, for LOD rendering */
    measuredHeight?: number;
}

const CanvasNodeWrapperInner: React.FC<CanvasNodeWrapperProps> = ({ node, children, lodLevel = 'full', measuredHeight }) => {
    debug.canvas('⟳ render', node.type, node.id.slice(0, 8));
    const {
        moveNode, moveNodes, deleteNode, updateNodeSize, resizeNode,
        selectNode, markPlaced, duplicateNodes,
        isDraggingEdge,
    } = useCanvasStore(
        useShallow((s) => ({
            moveNode: s.moveNode,
            moveNodes: s.moveNodes,
            deleteNode: s.deleteNode,
            updateNodeSize: s.updateNodeSize,
            resizeNode: s.resizeNode,
            selectNode: s.selectNode,
            markPlaced: s.markPlaced,
            duplicateNodes: s.duplicateNodes,
            isDraggingEdge: s.pendingEdge !== null,
        }))
    );

    // Subscribe to selection state for THIS node only — avoids re-rendering
    // all 50+ wrappers when a different node is selected (new Set reference).
    const isSelected = useCanvasStore((s) => s.selectedNodeIds.has(node.id));

    // Edge highlight dimming: when an edge is Cmd+Clicked, nodes NOT connected
    // to either endpoint (via any edge) get dimmed.
    const isDimmed = useCanvasStore((s) => {
        if (!s.highlightedEdgeId) return false;
        const hlEdge = s.edges.find((e) => e.id === s.highlightedEdgeId);
        if (!hlEdge) return false;
        // Collect all node IDs connected to the highlighted edge's endpoints
        const endpoints = new Set([hlEdge.sourceNodeId, hlEdge.targetNodeId]);
        if (endpoints.has(node.id)) return false; // this node IS an endpoint
        // Check if this node shares any edge with either endpoint
        for (const e of s.edges) {
            if (endpoints.has(e.sourceNodeId) && e.targetNodeId === node.id) return false;
            if (endpoints.has(e.targetNodeId) && e.sourceNodeId === node.id) return false;
        }
        return true;
    });

    const [isHovered, setIsHovered] = useState(false);
    const [resizeMode, setResizeMode] = useState<'corner' | 'right' | 'bottom' | null>(null);
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
                // Width-only: pass height=0 for non-sticky to reset to auto
                resizeNode(node.id, r.startWidth + dx, isSticky ? undefined : 0);
            } else if (r.mode === 'bottom') {
                resizeNode(node.id, r.startWidth, r.startHeight + dy);
            }
        },
        onEnd: () => setResizeMode(null),
    });

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;

        // Dismiss the "new node" indigo glow on first interaction
        markPlaced(node.id);

        if (e.metaKey) {
            selectNode(node.id, true);
            return;
        }

        // Snapshot for undo before drag begins (after metaKey guard — no undo for selection toggle)
        useCanvasStore.getState()._pushUndo();

        // Note: bringToFront is intentionally NOT called here.
        // During drag, the node renders at z-index 9999 via the isDragging CSS override,
        // so no persistent zIndex mutation is needed. This preserves user-set z-ordering
        // from the Bring to Front / Send to Back toolbar buttons.

        const { selectedNodeIds: currentSelectedIds } = useCanvasStore.getState();
        let ids = currentSelectedIds.has(node.id)
            ? Array.from(currentSelectedIds)
            : [node.id];

        if (!currentSelectedIds.has(node.id)) {
            selectNode(node.id, false);
        }

        // ⌥ Option + Drag → duplicate nodes, then drag the clones
        if (e.altKey) {
            const newIds = duplicateNodes(ids);
            if (newIds.length > 0) {
                ids = newIds;
            }
        }

        // Re-read nodes after potential duplication
        const latestNodes = useCanvasStore.getState().nodes;
        const nodeStartPositions = ids.map((id) => {
            const n = latestNodes.find((nd) => nd.id === id);
            return { id, x: n?.position?.x ?? 0, y: n?.position?.y ?? 0 };
        });

        dragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            zoom: liveZoom.current,
            nodeStartPositions,
        };
        startDrag();
    }, [node.id, selectNode, startDrag, markPlaced, duplicateNodes]);

    const isSticky = node.type === 'sticky-note';
    const isTrafficSource = node.type === 'traffic-source';

    // Subscribe to editing state — auto-expand height when this node is being edited
    const isEditingThis = useCanvasStore((s) => isSticky && s.editingNodeId === node.id);

    const makeResizeStart = useCallback((mode: 'corner' | 'right' | 'bottom') =>
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            // Snapshot for undo before resize begins
            useCanvasStore.getState()._pushUndo();
            const el = nodeRef.current;
            resizeRef.current = {
                startClientX: e.clientX,
                startClientY: e.clientY,
                startWidth: node.size?.w ?? NODE_WIDTH,
                startHeight: el?.offsetHeight ?? 100,
                mode,
                zoom: liveZoom.current,
            };
            setResizeMode(mode);
            startResize();
        }
        , [node.size, startResize]);

    // For non-sticky nodes, corner handle acts as width-only resize.
    // For expanded sticky notes, also width-only (height is auto from content).
    const isStickyExpanded = isSticky && 'isExpanded' in node.data && (node.data as { isExpanded?: boolean }).isExpanded;
    const handleResizeCorner = React.useMemo(
        () => makeResizeStart((isSticky && !isStickyExpanded) ? 'corner' : 'right'),
        [makeResizeStart, isSticky, isStickyExpanded]
    );
    const handleResizeRight = makeResizeStart('right');
    const handleResizeBottom = makeResizeStart('bottom');

    // Cursor for the full-screen overlay while resizing
    const resizeCursor = !isResizing ? 'grabbing'
        : resizeMode === 'right' ? 'ew-resize'
            : resizeMode === 'bottom' ? 'ns-resize'
                : 'nwse-resize';

    if (!node.position) return null;

    const nodeWidth = node.size?.w ?? NODE_WIDTH;
    // In expanded sticky mode or edit mode, let height be auto (content-driven).
    // In compact sticky mode, use explicit height or fallback to 100px so overflow clips.
    const userHeight = isSticky
        ? (node.size?.h && node.size.h > 0) ? node.size.h : 100
        : (node.size?.h && node.size.h > 0) ? node.size.h : undefined;
    const nodeHeight = (isStickyExpanded || isEditingThis) ? undefined : userHeight;
    const nodeMinHeight = isEditingThis ? userHeight : undefined;

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
                    display: 'flex',
                    flexDirection: 'column',
                    left: node.position.x,
                    top: node.position.y,
                    width: nodeWidth,
                    height: nodeHeight,
                    minHeight: nodeMinHeight,
                    zIndex: node.zIndex,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    // Selection ring
                    outline: isSelected ? '2px solid #6366f1' : undefined,
                    outlineOffset: isSelected ? '2px' : undefined,
                    borderRadius: isSelected
                        ? (node.type === 'sticky-note' || node.type === 'image' ? '4px' : '14px')
                        : undefined,
                    // Edge highlight dimming
                    opacity: isDimmed ? 0.2 : undefined,
                    filter: isDimmed ? 'grayscale(0.8)' : undefined,
                    transition: 'opacity 0.2s, filter 0.2s',
                    pointerEvents: isDimmed ? 'none' : undefined,
                }}
                onMouseDown={handleDragStart}
                onMouseEnter={() => {
                    setIsHovered(true);
                    useCanvasStore.getState().setLastHoveredNodeId(node.id);
                }}
                onMouseLeave={(e) => {
                    const related = e.relatedTarget;
                    // Guard: relatedTarget may be an SVG element which isn't a DOM Node
                    if (related instanceof Node && nodeRef.current?.contains(related)) return;
                    setIsHovered(false);
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ConnectionHandles: lazy — only mount when visible or edge drag in progress */}
                {(isHovered || isDraggingEdge) && (
                    <ConnectionHandles node={node} visible />
                )}

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

                {lodLevel === 'minimal' ? (
                    <SimplifiedNode node={node} measuredHeight={measuredHeight} />
                ) : lodLevel === 'medium' ? (
                    <MediumLodNode node={node} />
                ) : (
                    children
                )}

                {/* Insight buttons — always mounted at full LOD so popover survives cursor leaving node */}
                {isTrafficSource && lodLevel === 'full' && (
                    <InsightButtons
                        nodeId={node.id}
                        data={node.data as TrafficSourceCardData}
                        nodeWidth={nodeWidth}
                        isHovered={isHovered}
                    />
                )}

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

/**
 * Custom comparator: node object reference changes on every store write,
 * but we only re-render when visual-affecting fields actually change.
 */
export const CanvasNodeWrapper = React.memo(CanvasNodeWrapperInner, (prev, next) => {
    const a = prev.node;
    const b = next.node;
    return (
        prev.lodLevel === next.lodLevel &&
        prev.measuredHeight === next.measuredHeight &&
        a.id === b.id &&
        a.position === b.position &&
        a.size === b.size &&
        a.data === b.data &&
        a.isPlaced === b.isPlaced &&
        a.zIndex === b.zIndex &&
        a.type === b.type
    );
});

CanvasNodeWrapper.displayName = 'CanvasNodeWrapper';

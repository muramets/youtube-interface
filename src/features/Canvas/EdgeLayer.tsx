// =============================================================================
// CANVAS: EdgeLayer — SVG overlay for edges between nodes.
// Renders inside the canvas transform layer so it auto-pans/zooms with nodes.
//
// Two separate exports to manage z-order:
//   <EdgeLines>   — lines + arrowheads, rendered BEFORE nodes (below cards)
//   <EdgeHandles> — re-wire circles, rendered AFTER nodes (above cards)
// =============================================================================

import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../../core/stores/canvas/canvasStore';
import type { CanvasEdge, CanvasNode, EdgeLineStyle } from '../../core/types/canvas';
import { NODE_HEIGHT_FALLBACK } from '../../core/stores/canvas/constants';
import {
    getAnchorPoint, getLineTarget, getBezierPath,
    getMidPoint, getArrowPath, getControlOffset,
    type Point,
} from './geometry/edgeGeometry';
import { startRewire } from './geometry/rewireLogic';

// --- Constants ---
const DASH_ARRAYS: Record<EdgeLineStyle, string> = {
    solid: 'none',
    dashed: '10 5',
    dotted: '2 5',
};

// --- Edge line component (renders below nodes) ---

interface EdgeLineProps {
    edge: CanvasEdge;
    nodes: CanvasNode[];
    nodeSizes: Record<string, number>;
}

const EdgeLine: React.FC<EdgeLineProps> = ({ edge, nodes, nodeSizes }) => {
    const [hovered, setHovered] = useState(false);
    const deleteEdge = useCanvasStore((s) => s.deleteEdge);

    const srcNode = nodes.find((n) => n.id === edge.sourceNodeId);
    const tgtNode = nodes.find((n) => n.id === edge.targetNodeId);
    if (!srcNode?.position || !tgtNode?.position) return null;

    const srcH = nodeSizes[srcNode.id] ?? NODE_HEIGHT_FALLBACK;
    const tgtH = nodeSizes[tgtNode.id] ?? NODE_HEIGHT_FALLBACK;
    const src = getAnchorPoint(srcNode, edge.sourceHandle, srcH);
    const tgt = getAnchorPoint(tgtNode, edge.targetHandle, tgtH);

    const lineEnd = getLineTarget(tgt, edge.targetHandle);
    const pathD = getBezierPath(src, edge.sourceHandle, lineEnd, edge.targetHandle);
    const arrowD = getArrowPath(tgt, edge.targetHandle);
    const midPoint = getMidPoint(src, edge.sourceHandle, tgt, edge.targetHandle);
    const mid = edge.label ? midPoint : null;

    const color = edge.color ?? '#6366f1';
    const strokeDash = DASH_ARRAYS[edge.lineStyle ?? 'solid'];
    const opacity = hovered ? 1 : 0.7;

    return (
        <g
            style={{ opacity }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Hit area */}
            <path d={pathD} stroke="transparent" strokeWidth={16} fill="none"
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }} />

            {/* Visible line */}
            <path
                d={pathD}
                stroke={color}
                strokeWidth={hovered ? 2.5 : 2}
                strokeDasharray={strokeDash !== 'none' ? strokeDash : undefined}
                strokeLinecap="round"
                fill="none"
                style={{ pointerEvents: 'none' }}
            />

            {/* Arrowhead */}
            <path d={arrowD} fill={color} style={{ pointerEvents: 'none' }} />

            {/* Label */}
            {edge.label && mid && (
                <foreignObject x={mid.x - 50} y={mid.y - 12} width={100} height={24}
                    style={{ pointerEvents: 'none', overflow: 'visible' }}>
                    <div style={{
                        background: 'var(--bg-secondary)', border: `1px solid ${color}`,
                        borderRadius: 6, padding: '1px 6px', fontSize: 10,
                        color: 'var(--text-primary)', textAlign: 'center',
                        whiteSpace: 'nowrap', userSelect: 'none',
                    }}>{edge.label}</div>
                </foreignObject>
            )}

            {/* Delete button */}
            {hovered && (
                <foreignObject x={midPoint.x - 10} y={midPoint.y - 28} width={20} height={36}
                    style={{ overflow: 'visible' }}>
                    <button
                        style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--bg-primary)', border: '1px solid var(--border)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                            fontSize: 10, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', lineHeight: 1,
                        }}
                        onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                        title="Delete connection"
                    >×</button>
                </foreignObject>
            )}
        </g>
    );
};

// --- Edge handle component (re-wire circle, renders ABOVE nodes) ---

const EdgeHandle: React.FC<EdgeLineProps> = ({ edge, nodes, nodeSizes }) => {
    const [hovered, setHovered] = useState(false);

    const srcNode = nodes.find((n) => n.id === edge.sourceNodeId);
    const tgtNode = nodes.find((n) => n.id === edge.targetNodeId);
    if (!srcNode?.position || !tgtNode?.position) return null;

    const srcH = nodeSizes[srcNode.id] ?? NODE_HEIGHT_FALLBACK;
    const tgtH = nodeSizes[tgtNode.id] ?? NODE_HEIGHT_FALLBACK;
    const tgt = getAnchorPoint(tgtNode, edge.targetHandle, tgtH);
    const color = edge.color ?? '#6366f1';

    return (
        <circle
            cx={tgt.x} cy={tgt.y} r={6}
            fill={hovered ? color : 'transparent'}
            stroke={hovered ? 'var(--bg-primary)' : 'transparent'}
            strokeWidth={2}
            style={{ cursor: 'crosshair', pointerEvents: 'all', transition: 'fill 0.15s' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                startRewire(edge, srcNode, srcH, tgt);
            }}
        />
    );
};

// --- Pending Edge (rubber-band while dragging) ---

const PendingEdgePath: React.FC = () => {
    const pendingEdge = useCanvasStore((s) => s.pendingEdge);
    if (!pendingEdge) return null;

    const src = pendingEdge.sourceAnchor;
    const snap = pendingEdge.snapTarget;
    const tgt: Point = snap ? snap.anchor : { x: pendingEdge.x, y: pendingEdge.y };
    const snapped = snap !== null;

    if (!snapped && Math.hypot(tgt.x - src.x, tgt.y - src.y) < 20) return null;

    let pathD: string;
    let arrowD: string;

    if (snapped) {
        const lineEnd = getLineTarget(tgt, snap!.handle);
        pathD = getBezierPath(src, pendingEdge.sourceHandle, lineEnd, snap!.handle);
        arrowD = getArrowPath(tgt, snap!.handle);
    } else {
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const totalDist = Math.hypot(dx, dy);
        const ux = dx / totalDist, uy = dy / totalDist;
        const off = getControlOffset(pendingEdge.sourceHandle, Math.min(80, totalDist * 0.4));
        const cp1 = { x: src.x + off.x, y: src.y + off.y };
        const cp2Offset = Math.min(40, totalDist * 0.25);
        const cp2 = { x: tgt.x - ux * cp2Offset, y: tgt.y - uy * cp2Offset };
        pathD = `M ${src.x} ${src.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${tgt.x} ${tgt.y}`;
        const adx = tgt.x - cp2.x, ady = tgt.y - cp2.y;
        const alen = Math.hypot(adx, ady);
        if (alen < 1) {
            arrowD = '';
        } else {
            const anx = adx / alen, any = ady / alen;
            const bx = tgt.x - anx * 8, by = tgt.y - any * 8;
            arrowD = `M ${tgt.x} ${tgt.y} L ${bx + (-any) * 4} ${by + anx * 4} L ${bx - (-any) * 4} ${by - anx * 4} Z`;
        }
    }

    const color = snapped ? 'var(--text-primary)' : 'var(--text-secondary)';
    return (
        <g style={{ pointerEvents: 'none' }}>
            <path d={pathD} stroke={color} strokeWidth={snapped ? 2 : 1.5}
                strokeDasharray={snapped ? undefined : '6 4'} strokeLinecap="round"
                fill="none" style={{ opacity: snapped ? 0.9 : 0.6 }} />
            {arrowD && <path d={arrowD} fill={color} style={{ opacity: snapped ? 0.9 : 0.5 }} />}
        </g>
    );
};

// --- SVG wrapper styles ---
const SVG_STYLE_LINES: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, width: 1, height: 1,
    overflow: 'visible', pointerEvents: 'none',
    zIndex: 9999,
};

const SVG_STYLE_HANDLES: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, width: 1, height: 1,
    overflow: 'visible', pointerEvents: 'none',
    zIndex: 10000,
};

// --- EdgeLines: lines + arrowheads + rubber-band (rendered BEFORE nodes) ---

export const EdgeLines: React.FC = () => {
    const { edges, nodes, nodeSizes } = useCanvasStore(
        useShallow((s) => ({ edges: s.edges, nodes: s.nodes, nodeSizes: s.nodeSizes }))
    );
    const placedNodes = nodes.filter((n) => n.position !== null);

    return (
        <svg style={SVG_STYLE_LINES}>
            <g style={{ pointerEvents: 'all' }}>
                {edges.map((edge) => (
                    <EdgeLine key={edge.id} edge={edge} nodes={placedNodes} nodeSizes={nodeSizes} />
                ))}
            </g>
            <PendingEdgePath />
        </svg>
    );
};

// --- EdgeHandles: re-wire circles (rendered AFTER nodes, above cards) ---

export const EdgeHandles: React.FC = () => {
    const { edges, nodes, nodeSizes } = useCanvasStore(
        useShallow((s) => ({ edges: s.edges, nodes: s.nodes, nodeSizes: s.nodeSizes }))
    );
    const placedNodes = nodes.filter((n) => n.position !== null);

    return (
        <svg style={SVG_STYLE_HANDLES}>
            <g style={{ pointerEvents: 'all' }}>
                {edges.map((edge) => (
                    <EdgeHandle key={edge.id} edge={edge} nodes={placedNodes} nodeSizes={nodeSizes} />
                ))}
            </g>
        </svg>
    );
};

// Backward-compat alias
export const EdgeLayer = EdgeLines;

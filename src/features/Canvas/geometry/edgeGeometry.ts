// =============================================================================
// Edge Geometry — pure math functions for bezier curves, arrows, anchors
// =============================================================================

import type { CanvasNode, HandlePosition } from '../../../core/types/canvas';
import { NODE_WIDTH } from '../../../core/stores/canvas/constants';

export interface Point { x: number; y: number }

/** Arrowhead length — bezier is shortened by this amount */
export const ARROW_L = 10;

/** Direction vectors pointing INTO the node for each handle */
const INTO_NODE: Record<HandlePosition, [number, number]> = {
    top: [0, 1],
    right: [-1, 0],
    bottom: [0, -1],
    left: [1, 0],
};

/** Anchor: actual center of a handle dot (node boundary) */
export function getAnchorPoint(node: CanvasNode, handle: HandlePosition, h: number): Point {
    const x = node.position!.x, y = node.position!.y;
    const w = node.size?.w ?? NODE_WIDTH;
    switch (handle) {
        case 'top': return { x: x + w / 2, y };
        case 'right': return { x: x + w, y: y + h / 2 };
        case 'bottom': return { x: x + w / 2, y: y + h };
        case 'left': return { x, y: y + h / 2 };
    }
}

/**
 * Bezier target: retract from the anchor by ARROW_L so the line body
 * stops at the arrowhead base and doesn't penetrate the node card.
 */
export function getLineTarget(tgt: Point, handle: HandlePosition): Point {
    const [dx, dy] = INTO_NODE[handle];
    return { x: tgt.x - dx * ARROW_L, y: tgt.y - dy * ARROW_L };
}

export function getControlOffset(handle: HandlePosition, d: number): Point {
    switch (handle) {
        case 'top': return { x: 0, y: -d };
        case 'right': return { x: d, y: 0 };
        case 'bottom': return { x: 0, y: d };
        case 'left': return { x: -d, y: 0 };
    }
}

export function getBezierPath(src: Point, srcHandle: HandlePosition, tgt: Point, tgtHandle: HandlePosition): string {
    const dist = Math.max(60, Math.min(200, Math.hypot(tgt.x - src.x, tgt.y - src.y) * 0.45));
    const so = getControlOffset(srcHandle, dist);
    const to = getControlOffset(tgtHandle, dist);
    return `M ${src.x} ${src.y} C ${src.x + so.x} ${src.y + so.y} ${tgt.x + to.x} ${tgt.y + to.y} ${tgt.x} ${tgt.y}`;
}

export function getMidPoint(src: Point, srcHandle: HandlePosition, tgt: Point, tgtHandle: HandlePosition): Point {
    const dist = Math.max(60, Math.min(200, Math.hypot(tgt.x - src.x, tgt.y - src.y) * 0.45));
    const so = getControlOffset(srcHandle, dist);
    const to = getControlOffset(tgtHandle, dist);
    const cp1 = { x: src.x + so.x, y: src.y + so.y };
    const cp2 = { x: tgt.x + to.x, y: tgt.y + to.y };
    return {
        x: 0.125 * src.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * tgt.x,
        y: 0.125 * src.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * tgt.y,
    };
}

/** Arrowhead triangle, tip at `tgt` (anchor), body extending outside node */
export function getArrowPath(tgt: Point, tgtHandle: HandlePosition): string {
    const L = ARROW_L, W = 5;
    const [dx, dy] = INTO_NODE[tgtHandle];
    const [px, py] = [-dy, dx];
    const bx = tgt.x - dx * L, by = tgt.y - dy * L;
    return `M ${tgt.x} ${tgt.y} L ${bx + px * W} ${by + py * W} L ${bx - px * W} ${by - py * W} Z`;
}

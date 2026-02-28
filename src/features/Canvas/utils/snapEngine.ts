// =============================================================================
// snapEngine — Pure geometry utilities for snap-to-align guides
// =============================================================================
// Zero dependencies on React, store, or DOM. Fully unit-testable.
// Compares 6 reference edges of the dragged rect against all other rects.
// Returns snapped position + guide line descriptors.
// =============================================================================

/** Axis-aligned rectangle in canvas world coordinates */
export interface Rect {
    x: number;      // left
    y: number;      // top
    w: number;      // width
    h: number;      // height
}

/** A visual alignment guide line */
export interface GuideLine {
    /** 'x' = vertical line at a fixed x, 'y' = horizontal line at a fixed y */
    axis: 'x' | 'y';
    /** The coordinate value on the snapped axis (world px) */
    value: number;
    /** Extent of the guide (min/max on the OTHER axis) — for rendering length */
    from: number;
    to: number;
}

/** Result from the snap computation */
export interface SnapResult {
    /** Snapped position (may equal raw position if no snap) */
    x: number;
    y: number;
    /** Guide lines to render (empty if no snap) */
    guides: GuideLine[];
}

/** Default snap threshold in canvas-space pixels */
export const SNAP_THRESHOLD = 6;

/** Fallback height when no measurement is available */
export const NODE_HEIGHT_FALLBACK = 200;

// --- Node dimension helpers (shared with useSnapGuides + CanvasNodeWrapper) ---

import type { CanvasNode } from '../../../core/types/canvas';
import {
    NODE_WIDTH,
    TRAFFIC_NODE_WIDTH,
    IMAGE_NODE_WIDTH,
} from '../../../core/stores/canvas/constants';

/** Get the effective width of a canvas node */
export function getNodeWidth(node: CanvasNode): number {
    if (node.size?.w) return node.size.w;
    switch (node.type) {
        case 'traffic-source': return TRAFFIC_NODE_WIDTH;
        case 'image': return IMAGE_NODE_WIDTH;
        default: return NODE_WIDTH;
    }
}

/** Get the effective height of a canvas node */
export function getNodeHeight(node: CanvasNode, nodeSizes: Record<string, number>): number {
    return nodeSizes[node.id] || node.size?.h || NODE_HEIGHT_FALLBACK;
}

/** Build a Rect from a canvas node */
export function nodeToRect(node: CanvasNode, nodeSizes: Record<string, number>): Rect | null {
    if (!node.position) return null;
    return {
        x: node.position.x,
        y: node.position.y,
        w: getNodeWidth(node),
        h: getNodeHeight(node, nodeSizes),
    };
}

/** State exposed by useSnapGuides for rendering */
export interface SnapGuideState {
    guides: GuideLine[];
}

// --- Internal helpers ---

interface EdgeSet {
    left: number;
    centerX: number;
    right: number;
    top: number;
    centerY: number;
    bottom: number;
}

function edges(r: Rect): EdgeSet {
    return {
        left: r.x,
        centerX: r.x + r.w / 2,
        right: r.x + r.w,
        top: r.y,
        centerY: r.y + r.h / 2,
        bottom: r.y + r.h,
    };
}

/**
 * Compute the snapped position + alignment guides for a dragged rectangle.
 *
 * Compares left/center/right and top/center/bottom edges of `dragged`
 * against the same edges of each rect in `others`.
 * If within `threshold`, snaps to the closest edge on each axis independently.
 *
 * @param dragged  - The rectangle being dragged (raw position)
 * @param others   - All other visible rectangles to snap against
 * @param threshold - Maximum snap distance in canvas pixels (default: 6)
 * @returns Snapped position and guide line descriptors
 */
export function computeSnap(
    dragged: Rect,
    others: Rect[],
    threshold: number = SNAP_THRESHOLD,
): SnapResult {
    const d = edges(dragged);

    // --- Pass 1: find best snap delta per axis ---
    let bestDx: number | null = null;
    let bestDistX = threshold + 1;
    let bestDy: number | null = null;
    let bestDistY = threshold + 1;

    const dragXEdges = [d.left, d.centerX, d.right] as const;
    const dragYEdges = [d.top, d.centerY, d.bottom] as const;

    for (const other of others) {
        const o = edges(other);
        const otherXEdges = [o.left, o.centerX, o.right];
        const otherYEdges = [o.top, o.centerY, o.bottom];

        for (const dx of dragXEdges) {
            for (const ox of otherXEdges) {
                const dist = Math.abs(dx - ox);
                if (dist < bestDistX) {
                    bestDistX = dist;
                    bestDx = ox - dx;
                }
            }
        }

        for (const dy of dragYEdges) {
            for (const oy of otherYEdges) {
                const dist = Math.abs(dy - oy);
                if (dist < bestDistY) {
                    bestDistY = dist;
                    bestDy = oy - dy;
                }
            }
        }
    }

    // Apply snaps
    const snappedX = bestDx !== null && bestDistX <= threshold ? dragged.x + bestDx : dragged.x;
    const snappedY = bestDy !== null && bestDistY <= threshold ? dragged.y + bestDy : dragged.y;

    // --- Pass 2: collect ALL matching edges at the snapped position for guide lines ---
    const snappedDragged = { ...dragged, x: snappedX, y: snappedY };
    const sd = edges(snappedDragged);
    const sdXEdges = [sd.left, sd.centerX, sd.right];
    const sdYEdges = [sd.top, sd.centerY, sd.bottom];
    const guides: GuideLine[] = [];

    // Tolerance for "aligned" after snap (sub-pixel)
    const EPS = 0.5;

    // Collect unique x-axis guide values
    const seenX = new Set<number>();
    // Collect unique y-axis guide values
    const seenY = new Set<number>();

    for (const other of others) {
        const o = edges(other);
        const otherXEdges = [o.left, o.centerX, o.right];
        const otherYEdges = [o.top, o.centerY, o.bottom];

        // X-axis: find all aligned edges
        if (bestDx !== null && bestDistX <= threshold) {
            for (const sx of sdXEdges) {
                for (const ox of otherXEdges) {
                    if (Math.abs(sx - ox) < EPS && !seenX.has(Math.round(ox))) {
                        seenX.add(Math.round(ox));
                        guides.push({
                            axis: 'x',
                            value: ox,
                            from: Math.min(sd.top, o.top),
                            to: Math.max(sd.bottom, o.bottom),
                        });
                    }
                }
            }
        }

        // Y-axis: find all aligned edges
        if (bestDy !== null && bestDistY <= threshold) {
            for (const sy of sdYEdges) {
                for (const oy of otherYEdges) {
                    if (Math.abs(sy - oy) < EPS && !seenY.has(Math.round(oy))) {
                        seenY.add(Math.round(oy));
                        guides.push({
                            axis: 'y',
                            value: oy,
                            from: Math.min(sd.left, o.left),
                            to: Math.max(sd.right, o.right),
                        });
                    }
                }
            }
        }
    }

    return { x: snappedX, y: snappedY, guides };
}

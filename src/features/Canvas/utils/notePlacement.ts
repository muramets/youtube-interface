// =============================================================================
// Note Placement — computes "append-after" position for new sticky notes.
//
// Strategy:
// 1. Among all placed nodes, find the rightmost ones (max X).
// 2. Among those, pick the bottommost one (max Y + height).
// 3. Place the new note directly below it, aligned on X.
// If the canvas is empty, fall back to (100, 100).
// =============================================================================

import type { CanvasNode } from '../../../core/types/canvas';
import {
    PLACEMENT_GAP,
    STICKY_NOTE_HEIGHT_ESTIMATE,
} from '../../../core/stores/canvas/constants';

const DEFAULT_POSITION = { x: 100, y: 100 };

/**
 * Compute the next note position based on existing nodes.
 *
 * @param nodes       All nodes on the current canvas page
 * @param nodeSizes   Measured heights per nodeId (from ResizeObserver)
 */
export function computeNextNotePosition(
    nodes: CanvasNode[],
    nodeSizes: Record<string, number>,
): { x: number; y: number } {
    // Only consider placed nodes with a known position
    const placed = nodes.filter((n) => n.position != null);
    if (placed.length === 0) return DEFAULT_POSITION;

    // 1. Find the maximum X (rightmost column)
    const maxX = Math.max(...placed.map((n) => n.position!.x));

    // 2. Among rightmost nodes, find the bottommost (max bottom edge)
    const rightmostNodes = placed.filter((n) => n.position!.x === maxX);

    let bottommost = rightmostNodes[0];
    let bottommostEdge = bottomEdge(bottommost, nodeSizes);

    for (const n of rightmostNodes) {
        const edge = bottomEdge(n, nodeSizes);
        if (edge > bottommostEdge) {
            bottommost = n;
            bottommostEdge = edge;
        }
    }

    // 3. Place new note below the bottommost, same X
    return {
        x: bottommost.position!.x,
        y: bottommostEdge + PLACEMENT_GAP,
    };
}

/** Bottom edge of a node: position.y + measured height (or estimate). */
function bottomEdge(
    node: CanvasNode,
    nodeSizes: Record<string, number>,
): number {
    const h = nodeSizes[node.id] ?? node.size?.h ?? STICKY_NOTE_HEIGHT_ESTIMATE;
    return node.position!.y + h;
}

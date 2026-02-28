// =============================================================================
// Grow-Up — bottom-left anchor displacement for parent nodes
// =============================================================================
//
// When a parent node with frame children grows taller (e.g. due to width
// reflow causing text wrap), its bottom edge stays fixed and the top edge
// shifts upward. All nodes above the parent are displaced upward by the
// same delta.
//
// Pure function — no side effects, no Zustand, no DOM.
// =============================================================================

import type { CanvasNode } from '../../../core/types/canvas';
import { getVideoId, getSourceVideoId, getNodeDataType } from '../../../core/types/canvas';
import type { TrafficSourceCardData } from '../../../core/types/appContext';

/**
 * Compute position updates for the "grow-up" behavior:
 * parent nodes with frame children grow upward (bottom stays fixed).
 *
 * @param sizeChanges  Batch of new heights: nodeId → newHeight
 * @param oldSizes     Previous heights: nodeId → oldHeight
 * @param nodes        All canvas nodes (for parent/child detection)
 * @returns            Map of nodeId → new position (only for nodes that moved)
 */
export function computeGrowUpDisplacements(
    sizeChanges: Record<string, number>,
    oldSizes: Record<string, number>,
    nodes: CanvasNode[],
): Map<string, { x: number; y: number }> {
    const positionUpdates = new Map<string, { x: number; y: number }>();

    for (const [nodeId, newH] of Object.entries(sizeChanges)) {
        const oldH = oldSizes[nodeId];
        if (oldH === undefined || newH <= oldH) continue;

        const node = nodes.find((n) => n.id === nodeId);
        if (!node?.position) continue;

        // Is this node a parent of frame children?
        const videoId = getVideoId(node.data);
        if (!videoId) continue;

        const hasFrameChildren = nodes.some((n) => {
            if (getNodeDataType(n.data) !== 'traffic-source') return false;
            const srcVid = getSourceVideoId(n.data);
            if (srcVid !== videoId) return false;
            return (n.data as TrafficSourceCardData).snapshotId != null;
        });
        if (!hasFrameChildren) continue;

        const deltaH = newH - oldH;

        // Shift parent upward
        positionUpdates.set(nodeId, {
            x: node.position.x,
            y: node.position.y - deltaH,
        });

        // Shift all nodes above the parent upward
        for (const n of nodes) {
            if (n.id === nodeId || !n.position) continue;
            if (positionUpdates.has(n.id)) continue; // already shifted
            if (n.position.y < node.position.y) {
                positionUpdates.set(n.id, {
                    x: n.position.x,
                    y: n.position.y - deltaH,
                });
            }
        }
    }

    return positionUpdates;
}

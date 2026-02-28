// =============================================================================
// Frame Placement Engine — orchestrates frame-aware placement for pending nodes
// =============================================================================
//
// Handles the full workflow of placing traffic-source nodes into frames:
// 1. Groups pending nodes by parent
// 2. Discovers existing frames under each parent
// 3. Appends to existing frame columns
// 4. Creates new frame columns (aligned to last existing frame)
//
// Pure function — no side effects, no Zustand, no DOM.
// =============================================================================

import type { CanvasNode } from '../../../core/types/canvas';
import { getSourceVideoId, getNodeDataType } from '../../../core/types/canvas';
import type { TrafficSourceCardData } from '../../../core/types/appContext';
import {
    PLACEMENT_GAP,
    TRAFFIC_NODE_HEIGHT_ESTIMATE, TRAFFIC_NODE_WIDTH,
    FRAME_PADDING, FRAME_TITLE_HEIGHT, FRAME_GAP,
} from '../../../core/stores/canvas/constants';
import { buildFrameGroups, frameKey } from './frameLayout';
import type { FrameGroup } from './frameLayout';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface FramePlacementResult {
    /** nodeId → position for each pending node that belongs to a frame */
    placements: Map<string, { x: number; y: number }>;
    /** Set of parent videoIds that had frame children placed */
    parentsSeen: Set<string>;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute positions for all pending frame-grouped traffic nodes.
 *
 * @param pendingNodes     Nodes with position === null
 * @param placed           Nodes with position !== null
 * @param nodeSizes        Measured heights: nodeId → height
 * @param videoIdToNode    Lookup: videoId → parent CanvasNode (only placed parents)
 * @param nodeHeightFn     Function to get effective height of a node
 */
export function computeAllFramePlacements(
    pendingNodes: CanvasNode[],
    placed: CanvasNode[],
    nodeSizes: Record<string, number>,
    videoIdToNode: Map<string, CanvasNode>,
    nodeHeightFn: (node: CanvasNode) => number,
): FramePlacementResult {
    const placements = new Map<string, { x: number; y: number }>();
    const parentsSeen = new Set<string>();

    const frameGroups = buildFrameGroups(pendingNodes);

    // Group frameGroups by sourceVideoId to batch per parent
    const groupsByParent = new Map<string, FrameGroup[]>();
    for (const fg of frameGroups) {
        const arr = groupsByParent.get(fg.sourceVideoId) || [];
        arr.push(fg);
        groupsByParent.set(fg.sourceVideoId, arr);
    }

    for (const [srcVid, groups] of groupsByParent) {
        const parent = videoIdToNode.get(srcVid);
        if (!parent?.position) continue;
        parentsSeen.add(srcVid);

        // Discover existing frame columns under this parent
        const existingFrameNodes = placed.filter((n) => {
            const sv = getSourceVideoId(n.data);
            if (sv !== srcVid || getNodeDataType(n.data) !== 'traffic-source') return false;
            return (n.data as TrafficSourceCardData).snapshotId != null;
        });

        const existingFrameKeys = new Set<string>();
        for (const n of existingFrameNodes) {
            const d = n.data as TrafficSourceCardData;
            if (d.snapshotId) existingFrameKeys.add(frameKey(srcVid, d.snapshotId));
        }

        // Compute where existing frames end (for placing new frames after them)
        let existingMaxRight = parent.position.x;
        for (const n of existingFrameNodes) {
            if (!n.position) continue;
            const nw = n.size?.w ?? TRAFFIC_NODE_WIDTH;
            existingMaxRight = Math.max(existingMaxRight, n.position.x + nw + FRAME_PADDING + FRAME_GAP);
        }

        // Split: append (existing frame columns) vs new (fresh columns)
        const appendGroups: FrameGroup[] = [];
        const newGroups: FrameGroup[] = [];
        for (const g of groups) {
            const key = frameKey(g.sourceVideoId, g.snapshotId);
            if (existingFrameKeys.has(key)) {
                appendGroups.push(g);
            } else {
                newGroups.push(g);
            }
        }

        // --- Append groups: stack below existing nodes in the same frame column ---
        for (const ag of appendGroups) {
            const sameFrameNodes = existingFrameNodes.filter((n) => {
                const d = n.data as TrafficSourceCardData;
                return d.snapshotId === ag.snapshotId;
            });

            let refX = parent.position.x;
            let bottomY = parent.position.y + nodeHeightFn(parent) + PLACEMENT_GAP
                + FRAME_TITLE_HEIGHT + FRAME_PADDING;
            for (const sn of sameFrameNodes) {
                if (!sn.position) continue;
                refX = sn.position.x; // All share same X within a frame
                const snH = nodeSizes[sn.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
                bottomY = Math.max(bottomY, sn.position.y + snH + PLACEMENT_GAP);
            }
            let yOff = 0;
            for (const node of ag.pendingNodes) {
                placements.set(node.id, { x: refX, y: bottomY + yOff });
                const h = nodeSizes[node.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
                yOff += h + PLACEMENT_GAP;
            }
        }

        // --- New groups: place as new frame columns to the right ---
        // Align top Y to last existing frame (if any), otherwise below parent
        const parentH = nodeHeightFn(parent);
        let baseY = parent.position.y + parentH + PLACEMENT_GAP;
        if (existingFrameNodes.length > 0) {
            let lastFrameY = Infinity;
            let lastFrameX = -Infinity;
            for (const n of existingFrameNodes) {
                if (!n.position) continue;
                if (n.position.x > lastFrameX) {
                    lastFrameX = n.position.x;
                    lastFrameY = n.position.y - FRAME_TITLE_HEIGHT - FRAME_PADDING;
                }
            }
            if (lastFrameY < Infinity) baseY = lastFrameY;
        }

        let cursorX = existingFrameNodes.length > 0 ? existingMaxRight : parent.position.x;

        for (const ng of newGroups) {
            const contentX = cursorX + FRAME_PADDING;
            const contentY = baseY + FRAME_TITLE_HEIGHT + FRAME_PADDING;
            let yOff = 0;
            for (const node of ng.pendingNodes) {
                placements.set(node.id, { x: contentX, y: contentY + yOff });
                const h = nodeSizes[node.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
                yOff += h + PLACEMENT_GAP;
            }
            const frameW = TRAFFIC_NODE_WIDTH + FRAME_PADDING * 2;
            cursorX += frameW + FRAME_GAP;
        }
    }

    return { placements, parentsSeen };
}

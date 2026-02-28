// =============================================================================
// Parent Reflow — auto-width expansion & neighbor displacement
// =============================================================================
//
// When frame children are added under a parent node, the parent may need to
// expand its width to span all frame columns. Unrelated nodes to the right
// of the parent are displaced accordingly.
//
// Pure function — no side effects, no Zustand, no DOM.
// =============================================================================

import type { CanvasNode } from '../../../core/types/canvas';
import { getVideoId, getSourceVideoId } from '../../../core/types/canvas';
import {
    NODE_WIDTH,
    FRAME_PADDING,
} from '../../../core/stores/canvas/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChildPosition {
    id: string;
    x: number;
    w: number;
}

export interface ReflowResult {
    /** parentNodeId → new width */
    widthUpdates: Map<string, number>;
    /** nodeId → cumulative horizontal displacement */
    displacements: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Core reflow computation
// ---------------------------------------------------------------------------

/**
 * Compute parent width expansions and neighbor displacements.
 *
 * Works with any source of child positions — during initial placement
 * (from framePlacementMap) or during relayout (from corrected positions).
 *
 * @param parentVideoIds   Set of videoIds that need reflow check
 * @param videoIdToNode    Lookup: videoId → parent CanvasNode
 * @param getChildPositions  For a given parent videoId, return all child positions
 *                           (both new and existing) with their X and width
 * @param allNodes         All canvas nodes (for displacement scanning)
 * @param childExclusions  nodeIds to exclude from displacement (children of each parent)
 */
export function computeParentReflow(
    parentVideoIds: Set<string>,
    videoIdToNode: Map<string, CanvasNode>,
    getChildPositions: (parentVideoId: string) => ChildPosition[],
    allNodes: CanvasNode[],
    childExclusions: Map<string, Set<string>>,
): ReflowResult {
    const widthUpdates = new Map<string, number>();
    const displacements = new Map<string, number>();

    // Sort parents left-to-right so cascading displacements accumulate correctly
    const sortedParents = Array.from(parentVideoIds)
        .map((vid) => videoIdToNode.get(vid)!)
        .filter((p) => p?.position)
        .sort((a, b) => a.position!.x - b.position!.x);

    for (const parent of sortedParents) {
        const srcVid = getVideoId(parent.data);
        if (!srcVid) continue;

        const oldParentW = parent.size?.w ?? NODE_WIDTH;
        let frameMaxRight = parent.position!.x;

        // Find rightmost edge from all child positions
        const childPositions = getChildPositions(srcVid);
        for (const cp of childPositions) {
            frameMaxRight = Math.max(frameMaxRight, cp.x + cp.w);
        }

        // Add frame padding to get the total visual span
        const totalFrameSpan = frameMaxRight - parent.position!.x + FRAME_PADDING;
        const newParentW = Math.max(oldParentW, totalFrameSpan);
        const deltaX = newParentW - oldParentW;

        if (deltaX > 0) {
            widthUpdates.set(parent.id, newParentW);
            const excludedIds = childExclusions.get(srcVid);

            // Displace all nodes right of this parent (excluding parent + its children)
            for (const n of allNodes) {
                if (!n.position || n.id === parent.id) continue;
                if (excludedIds?.has(n.id)) continue;
                if (n.position.x > parent.position!.x) {
                    const prev = displacements.get(n.id) ?? 0;
                    displacements.set(n.id, prev + deltaX);
                }
            }
        }
    }

    return { widthUpdates, displacements };
}

// ---------------------------------------------------------------------------
// Helper: collect child exclusion sets from node arrays
// ---------------------------------------------------------------------------

/**
 * Build a map of parentVideoId → Set of child nodeIds.
 * Used to exclude children from displacement when their parent expands.
 */
export function buildChildExclusions(
    nodes: CanvasNode[],
    parentVideoIds: Set<string>,
): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const n of nodes) {
        if (!n.position) continue;
        const srcVid = getSourceVideoId(n.data);
        if (srcVid && parentVideoIds.has(srcVid)) {
            let ids = result.get(srcVid);
            if (!ids) { ids = new Set(); result.set(srcVid, ids); }
            ids.add(n.id);
        }
    }
    return result;
}

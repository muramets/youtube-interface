// =============================================================================
// Node Placement Strategies — pure position calculators for pending nodes
// =============================================================================
//
// Each function computes a position for a specific node type.
// No side effects, no Zustand, no DOM.
// =============================================================================

import type { CanvasNode } from '../../../core/types/canvas';
import { getSourceVideoId, getNodeDataType } from '../../../core/types/canvas';
import {
    NODE_WIDTH, NODE_HEIGHT_FALLBACK, PLACEMENT_GAP,
    TRAFFIC_NODE_HEIGHT_ESTIMATE,
    STICKY_NOTE_HEIGHT_ESTIMATE,
} from '../../../core/stores/canvas/constants';
import { findFreeSpot } from './collisionUtils';
import type { Rect } from './collisionUtils';

// ---------------------------------------------------------------------------
// Layout baselines — computed once per placement pass
// ---------------------------------------------------------------------------

export interface PlacementBaselines {
    shelfBaseX: number;
    shelfBaseY: number;
    rightLaneX: number;
    rightLaneY: number;
}

/**
 * Compute baselines for shelf (top) and right-lane zones from placed nodes.
 */
export function computeBaselines(
    placed: CanvasNode[],
    viewportCenter: { x: number; y: number },
    widthUpdates: Map<string, number>,
    displacements: Map<string, number>,
): PlacementBaselines {
    const SHELF_GAP = 120;
    let minX = Infinity;
    let minY = Infinity;
    let maxRight = -Infinity;

    for (const n of placed) {
        const dx = displacements.get(n.id) ?? 0;
        minX = Math.min(minX, n.position!.x + dx);
        minY = Math.min(minY, n.position!.y);
        const nodeW = widthUpdates.get(n.id) ?? n.size?.w ?? NODE_WIDTH;
        maxRight = Math.max(maxRight, n.position!.x + dx + nodeW);
    }

    const hasPlaced = placed.length > 0;
    return {
        shelfBaseX: hasPlaced ? minX : viewportCenter.x - NODE_WIDTH / 2,
        shelfBaseY: hasPlaced ? minY - SHELF_GAP - NODE_HEIGHT_FALLBACK : viewportCenter.y - 94,
        rightLaneX: hasPlaced ? maxRight + PLACEMENT_GAP : viewportCenter.x - NODE_WIDTH / 2,
        rightLaneY: hasPlaced ? minY : viewportCenter.y - 94,
    };
}

// ---------------------------------------------------------------------------
// Non-framed child stacking
// ---------------------------------------------------------------------------

/**
 * Place a non-framed child below its parent node.
 * Returns the position and the updated offset for the next child.
 */
export function placeNonFramedChild(
    node: CanvasNode,
    parent: CanvasNode,
    parentHeight: number,
    currentOffset: number,
): { position: { x: number; y: number }; nextOffset: number } {
    const isTraffic = getNodeDataType(node.data) === 'traffic-source';
    const childH = isTraffic ? TRAFFIC_NODE_HEIGHT_ESTIMATE : NODE_HEIGHT_FALLBACK;

    return {
        position: {
            x: parent.position!.x,
            y: parent.position!.y + parentHeight + PLACEMENT_GAP + currentOffset,
        },
        nextOffset: currentOffset + childH + PLACEMENT_GAP,
    };
}

// ---------------------------------------------------------------------------
// Sticky note placement
// ---------------------------------------------------------------------------

/**
 * Find a free position for a sticky note near a preferred location.
 */
export function placeStickyNote(
    noteW: number,
    lastHoveredNode: CanvasNode | null | undefined,
    lastCanvasWorldPos: { x: number; y: number } | null,
    placed: CanvasNode[],
    shelfBaseX: number,
    shelfBaseY: number,
    stickyIndex: number,
): { x: number; y: number } {
    const noteH = STICKY_NOTE_HEIGHT_ESTIMATE;

    let preferred: { x: number; y: number };
    if (lastHoveredNode?.position) {
        const nW = lastHoveredNode.size?.w ?? NODE_WIDTH;
        preferred = {
            x: lastHoveredNode.position.x + nW + PLACEMENT_GAP,
            y: lastHoveredNode.position.y,
        };
    } else if (lastCanvasWorldPos) {
        preferred = {
            x: lastCanvasWorldPos.x - noteW / 2,
            y: lastCanvasWorldPos.y - noteH / 2,
        };
    } else {
        preferred = {
            x: shelfBaseX + stickyIndex * (noteW + PLACEMENT_GAP),
            y: shelfBaseY,
        };
    }

    const occupiedRects: Rect[] = placed.map((p) => ({
        x: p.position!.x,
        y: p.position!.y,
        w: p.size?.w ?? NODE_WIDTH,
        h: p.size?.h && p.size.h > 0 ? p.size.h : NODE_HEIGHT_FALLBACK,
    }));

    return findFreeSpot(preferred, occupiedRects, noteW, noteH, PLACEMENT_GAP);
}

// ---------------------------------------------------------------------------
// Right-lane (own-channel) placement
// ---------------------------------------------------------------------------

export function placeInRightLane(
    nodeW: number,
    pendingIndex: number,
    baselines: PlacementBaselines,
): { x: number; y: number } {
    return {
        x: baselines.rightLaneX + pendingIndex * (nodeW + PLACEMENT_GAP),
        y: baselines.rightLaneY,
    };
}

// ---------------------------------------------------------------------------
// Top-shelf (competitor / fallback) placement
// ---------------------------------------------------------------------------

export function placeOnShelf(
    nodeW: number,
    pendingIndex: number,
    baselines: PlacementBaselines,
): { x: number; y: number } {
    return {
        x: baselines.shelfBaseX + pendingIndex * (nodeW + PLACEMENT_GAP),
        y: baselines.shelfBaseY,
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a node is own-channel based on its ownership field. */
export function isOwnChannel(node: CanvasNode): boolean {
    const ownership = 'ownership' in node.data ? node.data.ownership : undefined;
    return ownership === 'own-draft' || ownership === 'own-published';
}

/** Check if a node has a parent among the placed nodes. */
export function hasParent(node: CanvasNode, videoIdToNode: Map<string, CanvasNode>): boolean {
    const srcVid = getSourceVideoId(node.data);
    return !!srcVid && videoIdToNode.has(srcVid);
}

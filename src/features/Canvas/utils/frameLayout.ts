// =============================================================================
// Frame Layout — pure utility for snapshot-frame-aware placement
// =============================================================================
//
// Groups traffic-source nodes by (sourceVideoId, snapshotId) and computes
// per-frame column positions so each snapshot gets its own visual frame.
// Pure functions — no side effects, no Zustand dependency.
// =============================================================================

import type { CanvasNode } from '../../../core/types/canvas';
import { getSourceVideoId, getNodeDataType } from '../../../core/types/canvas';
import type { TrafficSourceCardData, TrafficDiscrepancy } from '../../../core/types/appContext';
import type { SnapshotMeta } from '../../../core/stores/canvas/types';
import {
    TRAFFIC_NODE_WIDTH,
    TRAFFIC_NODE_HEIGHT_ESTIMATE,
    PLACEMENT_GAP,
    FRAME_PADDING,
    FRAME_TITLE_HEIGHT,
    FRAME_GAP,
} from '../../../core/stores/canvas/constants';

// ---------------------------------------------------------------------------
// Frame key — composite key for (sourceVideoId, snapshotId) grouping
// ---------------------------------------------------------------------------

/** Build a stable key for frame identity */
export function frameKey(sourceVideoId: string, snapshotId: string): string {
    return `${sourceVideoId}::${snapshotId}`;
}

// ---------------------------------------------------------------------------
// Frame map builder — groups pending traffic nodes by snapshot
// ---------------------------------------------------------------------------

export interface FrameGroup {
    sourceVideoId: string;
    snapshotId: string;
    snapshotLabel: string;
    /** Pending nodes to place inside this frame */
    pendingNodes: CanvasNode[];
}

/**
 * Groups pending traffic-source nodes by (sourceVideoId, snapshotId).
 * Returns only groups with a valid snapshotId — nodes without snapshot
 * metadata fall through to the default placement logic.
 */
export function buildFrameGroups(pendingNodes: CanvasNode[]): FrameGroup[] {
    const map = new Map<string, FrameGroup>();

    for (const n of pendingNodes) {
        if (getNodeDataType(n.data) !== 'traffic-source') continue;
        const srcVid = getSourceVideoId(n.data);
        if (!srcVid) continue;

        const data = n.data as TrafficSourceCardData;
        if (!data.snapshotId) continue;

        const key = frameKey(srcVid, data.snapshotId);
        let group = map.get(key);
        if (!group) {
            group = {
                sourceVideoId: srcVid,
                snapshotId: data.snapshotId,
                snapshotLabel: data.snapshotLabel || data.snapshotId.slice(0, 8),
                pendingNodes: [],
            };
            map.set(key, group);
        }
        group.pendingNodes.push(n);
    }

    return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Frame position computation
// ---------------------------------------------------------------------------

export interface FramePlacement {
    /** Frame key (sourceVideoId::snapshotId) */
    key: string;
    /** Frame origin (top-left corner, including title bar) */
    frameX: number;
    frameY: number;
    /** Frame dimensions (computed from content + padding) */
    frameW: number;
    frameH: number;
    /** Node placements: nodeId → position */
    nodePlacements: Map<string, { x: number; y: number }>;
}

/**
 * Compute positions for frame groups under a given parent node.
 *
 * @param parent        The parent video node (must have position)
 * @param parentH       Measured height of the parent node
 * @param groups        Frame groups to position (all for the same sourceVideoId)
 * @param existingFrames Already-placed frames for this parent (from prior batches)
 * @param nodeHeights   Measured node heights (from nodeSizes)
 */
export function computeFramePlacements(
    parent: CanvasNode,
    parentH: number,
    groups: FrameGroup[],
    existingFrames: FramePlacement[],
    nodeHeights: Record<string, number>,
): FramePlacement[] {
    if (!parent.position) return [];

    // Start Y: below parent
    const baseY = parent.position.y + parentH + PLACEMENT_GAP;

    // Start X: after existing frames (if any), else at parent.x
    let cursorX = parent.position.x;
    for (const ef of existingFrames) {
        cursorX = Math.max(cursorX, ef.frameX + ef.frameW + FRAME_GAP);
    }

    const results: FramePlacement[] = [];

    for (const group of groups) {
        const contentX = cursorX + FRAME_PADDING;
        const contentY = baseY + FRAME_TITLE_HEIGHT + FRAME_PADDING;
        const nodePlacements = new Map<string, { x: number; y: number }>();

        let yOffset = 0;
        for (const node of group.pendingNodes) {
            nodePlacements.set(node.id, {
                x: contentX,
                y: contentY + yOffset,
            });
            const h = nodeHeights[node.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
            yOffset += h + PLACEMENT_GAP;
        }

        // Remove trailing gap
        const contentH = yOffset > 0 ? yOffset - PLACEMENT_GAP : 0;

        const frameW = TRAFFIC_NODE_WIDTH + FRAME_PADDING * 2;
        const frameH = FRAME_TITLE_HEIGHT + FRAME_PADDING * 2 + contentH;

        results.push({
            key: frameKey(group.sourceVideoId, group.snapshotId),
            frameX: cursorX,
            frameY: baseY,
            frameW,
            frameH,
            nodePlacements,
        });

        cursorX += frameW + FRAME_GAP;
    }

    return results;
}

// ---------------------------------------------------------------------------
// Relayout correction — recalculate Y positions for placed frame columns
// ---------------------------------------------------------------------------

export interface FrameColumn {
    srcVid: string;
    nodes: CanvasNode[];
}

export interface CorrectionResult {
    updates: Map<string, { x: number; y: number }>;
    framedNodeIds: Set<string>;
    frameColumns: Map<string, FrameColumn>;
    changed: boolean;
}

/**
 * Correct positions of placed frame-column children.
 * Recalculates Y from parent's measured height to handle resized parents.
 *
 * @param nodes           All canvas nodes
 * @param nodeSizes       Measured heights: nodeId → height
 * @param videoIdToNode   Lookup: videoId → parent CanvasNode
 */
export function correctFrameColumns(
    nodes: CanvasNode[],
    nodeSizes: Record<string, number>,
    videoIdToNode: Map<string, CanvasNode>,
): CorrectionResult {
    const updates = new Map<string, { x: number; y: number }>();
    const framedNodeIds = new Set<string>();
    const frameColumns = new Map<string, FrameColumn>();
    let changed = false;

    // Group placed traffic-source nodes by (sourceVideoId, snapshotId)
    for (const n of nodes) {
        if (!n.position) continue;
        if (getNodeDataType(n.data) !== 'traffic-source') continue;
        const srcVid = getSourceVideoId(n.data);
        if (!srcVid || !videoIdToNode.has(srcVid)) continue;
        const data = n.data as TrafficSourceCardData;
        if (!data.snapshotId) continue;

        const key = frameKey(srcVid, data.snapshotId);
        let entry = frameColumns.get(key);
        if (!entry) {
            entry = { srcVid, nodes: [] };
            frameColumns.set(key, entry);
        }
        entry.nodes.push(n);
        framedNodeIds.add(n.id);
    }

    for (const [, column] of frameColumns) {
        if (column.nodes.length === 0) continue;

        const parent = videoIdToNode.get(column.srcVid);
        if (!parent?.position) continue;

        const parentH = nodeSizes[parent.id];
        if (parentH === undefined) continue; // Wait for measurement

        // All nodes in a frame column share the same X
        const refX = column.nodes[0].position!.x;

        column.nodes.sort((a, b) => a.position!.y - b.position!.y);

        // Compute content Y from parent's measured height
        const contentStartY = parent.position.y + parentH + PLACEMENT_GAP
            + FRAME_TITLE_HEIGHT + FRAME_PADDING;

        let cumulativeY = contentStartY;
        for (const child of column.nodes) {
            if (child.position!.x !== refX || Math.abs(child.position!.y - cumulativeY) > 1) {
                updates.set(child.id, { x: refX, y: cumulativeY });
                changed = true;
            }
            const childH = nodeSizes[child.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
            cumulativeY += childH + PLACEMENT_GAP;
        }
    }

    return { updates, framedNodeIds, frameColumns, changed };
}

/**
 * Correct positions of non-framed children (legacy stacking below parent).
 *
 * @param nodes            All canvas nodes
 * @param nodeSizes        Measured node heights
 * @param videoIdToNode    Parent lookup
 * @param framedNodeIds    IDs to exclude (already handled by correctFrameColumns)
 * @param updates          Map to accumulate position updates into
 */
export function correctNonFramedChildren(
    nodes: CanvasNode[],
    nodeSizes: Record<string, number>,
    videoIdToNode: Map<string, CanvasNode>,
    framedNodeIds: Set<string>,
    updates: Map<string, { x: number; y: number }>,
    nodeWidth: number,
): { childrenByParent: Map<string, CanvasNode[]>; changed: boolean } {
    const childrenByParent = new Map<string, CanvasNode[]>();
    let changed = false;

    for (const n of nodes) {
        if (!n.position) continue;
        if (framedNodeIds.has(n.id)) continue;
        const srcVid = getSourceVideoId(n.data);
        if (srcVid && videoIdToNode.has(srcVid)) {
            const parent = videoIdToNode.get(srcVid)!;
            const parentW = parent.size?.w ?? nodeWidth;
            if (Math.abs(n.position.x - parent.position!.x) > parentW * 0.5) continue;
            const arr = childrenByParent.get(srcVid) || [];
            arr.push(n);
            childrenByParent.set(srcVid, arr);
        }
    }

    for (const [srcVid, children] of childrenByParent) {
        const parent = videoIdToNode.get(srcVid)!;
        const parentH = nodeSizes[parent.id];
        if (parentH === undefined) continue;

        children.sort((a, b) => a.position!.y - b.position!.y);

        let cumulativeY = parent.position!.y + parentH + PLACEMENT_GAP;
        for (const child of children) {
            const expectedX = parent.position!.x;
            if (child.position!.x !== expectedX || Math.abs(child.position!.y - cumulativeY) > 1) {
                updates.set(child.id, { x: expectedX, y: cumulativeY });
                changed = true;
            }
            const childH = nodeSizes[child.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
            cumulativeY += childH + PLACEMENT_GAP;
        }
    }

    return { childrenByParent, changed };
}

// ---------------------------------------------------------------------------
// Derive frame bounds from already-placed nodes (for rendering)
// ---------------------------------------------------------------------------

export interface FrameBounds {
    key: string;
    snapshotLabel: string;
    x: number;
    y: number;
    w: number;
    h: number;
    /** Cumulative Long Tail discrepancy from snapshot Total Row (if available) */
    discrepancy?: TrafficDiscrepancy;
}

/**
 * Compute visual frame bounds from placed traffic-source nodes.
 * Used by the rendering layer to draw frame rectangles.
 */
export function deriveFrameBounds(
    nodes: CanvasNode[],
    nodeHeights: Record<string, number>,
    snapshotMeta?: Record<string, SnapshotMeta>,
): FrameBounds[] {
    // Group placed traffic-source nodes by (sourceVideoId, snapshotId)
    const groups = new Map<string, {
        snapshotLabel: string;
        nodes: CanvasNode[];
    }>();

    for (const n of nodes) {
        if (!n.position || getNodeDataType(n.data) !== 'traffic-source') continue;
        const srcVid = getSourceVideoId(n.data);
        if (!srcVid) continue;

        const data = n.data as TrafficSourceCardData;
        if (!data.snapshotId) continue;

        const key = frameKey(srcVid, data.snapshotId);
        let group = groups.get(key);
        if (!group) {
            group = {
                snapshotLabel: data.snapshotLabel || data.snapshotId.slice(0, 8),
                nodes: [],
            };
            groups.set(key, group);
        }
        group.nodes.push(n);
    }

    const result: FrameBounds[] = [];

    for (const [key, group] of groups) {
        if (group.nodes.length === 0) continue;

        // Compute bounding box of all nodes in this group
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const n of group.nodes) {
            const nx = n.position!.x;
            const ny = n.position!.y;
            const nw = n.size?.w ?? TRAFFIC_NODE_WIDTH;
            const nh = nodeHeights[n.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;

            minX = Math.min(minX, nx);
            minY = Math.min(minY, ny);
            maxX = Math.max(maxX, nx + nw);
            maxY = Math.max(maxY, ny + nh);
        }

        const disc = snapshotMeta?.[key]?.discrepancy;
        result.push({
            key,
            snapshotLabel: group.snapshotLabel,
            x: minX - FRAME_PADDING,
            y: minY - FRAME_PADDING - FRAME_TITLE_HEIGHT,
            w: (maxX - minX) + FRAME_PADDING * 2,
            h: (maxY - minY) + FRAME_PADDING * 2 + FRAME_TITLE_HEIGHT,
            discrepancy: disc,
        });
    }

    return result;
}

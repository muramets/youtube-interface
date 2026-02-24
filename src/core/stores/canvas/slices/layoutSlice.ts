// =============================================================================
// Layout Slice — node placement, relayout, and size tracking
// =============================================================================

import type { CanvasNode } from '../../../types/canvas';
import { getVideoId, getSourceVideoId, getNodeDataType } from '../../../types/canvas';
import type { TrafficSourceCardData } from '../../../types/appContext';
import {
    NODE_WIDTH, NODE_HEIGHT_FALLBACK, PLACEMENT_GAP,
    TRAFFIC_NODE_HEIGHT_ESTIMATE, TRAFFIC_NODE_WIDTH,
    STICKY_NOTE_HEIGHT_ESTIMATE,
    FRAME_PADDING, FRAME_TITLE_HEIGHT, FRAME_GAP,
} from '../constants';
import type { CanvasSlice, CanvasState } from '../types';
import { buildFrameGroups, frameKey } from '../../../../features/Canvas/utils/frameLayout';

// ---------------------------------------------------------------------------
// Free-spot finder — spiral grid search for a non-overlapping position
// ---------------------------------------------------------------------------

interface Rect { x: number; y: number; w: number; h: number; }

/** Returns true if two rects overlap (with an extra gap padding). */
function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
    return (
        a.x < b.x + b.w + gap &&
        a.x + a.w + gap > b.x &&
        a.y < b.y + b.h + gap &&
        a.y + a.h + gap > b.y
    );
}

/**
 * Starting from `preferred`, searches in an expanding spiral grid for the
 * first cell that does not overlap any of `occupied`. Returns the free position.
 */
function findFreeSpot(
    preferred: { x: number; y: number },
    occupied: Rect[],
    nodeW: number,
    nodeH: number,
    gap: number,
): { x: number; y: number } {
    const stepX = nodeW + gap;
    const stepY = nodeH + gap;
    // Spiral: (0,0), then rings 1, 2, 3 …  up to radius 4 (~25 positions)
    const MAX_RING = 4;
    for (let ring = 0; ring <= MAX_RING; ring++) {
        if (ring === 0) {
            const candidate = { x: preferred.x, y: preferred.y, w: nodeW, h: nodeH };
            if (!occupied.some((o) => rectsOverlap(candidate, o, gap))) {
                return { x: preferred.x, y: preferred.y };
            }
        } else {
            // Walk the perimeter of a (2*ring+1)×(2*ring+1) grid
            for (let dx = -ring; dx <= ring; dx++) {
                for (let dy = -ring; dy <= ring; dy++) {
                    if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue; // only perimeter
                    const cx = preferred.x + dx * stepX;
                    const cy = preferred.y + dy * stepY;
                    const candidate = { x: cx, y: cy, w: nodeW, h: nodeH };
                    if (!occupied.some((o) => rectsOverlap(candidate, o, gap))) {
                        return { x: cx, y: cy };
                    }
                }
            }
        }
    }
    // Fallback: place to the right of everything (canvas is extremely crowded)
    return { x: preferred.x + (MAX_RING + 1) * stepX, y: preferred.y };
}

export interface LayoutSlice {
    nodeSizes: Record<string, number>;
    updateNodeSize: CanvasState['updateNodeSize'];
    placePendingNodes: CanvasState['placePendingNodes'];
    relayoutChildren: CanvasState['relayoutChildren'];
}
// Batched node-size updates: accumulate in a map, flush once per rAF frame.
// This prevents "Maximum update depth exceeded" when many ResizeObservers
// fire synchronously (e.g. on initial mount or page switch).
const _pendingSizes: Record<string, number> = {};
let _sizeFlushId: number | null = null;

export const createLayoutSlice: CanvasSlice<LayoutSlice> = (set, get) => ({
    nodeSizes: {},

    updateNodeSize: (id, height) => {
        if (get().nodeSizes[id] === height) return;
        _pendingSizes[id] = height;
        if (_sizeFlushId === null) {
            _sizeFlushId = requestAnimationFrame(() => {
                _sizeFlushId = null;
                const batch = { ..._pendingSizes };
                // Clear pending before set() to avoid stale reads
                for (const k of Object.keys(_pendingSizes)) delete _pendingSizes[k];
                set((s) => ({ nodeSizes: { ...s.nodeSizes, ...batch } }));
            });
        }
    },

    placePendingNodes: (viewportCenter) => {
        const nodes = get().nodes;
        const placed = nodes.filter((n) => n.position !== null);
        const nodeSizes = get().nodeSizes;

        const nodeH = (n: CanvasNode) => nodeSizes[n.id] ?? NODE_HEIGHT_FALLBACK;

        // Build a lookup: videoId → placed canvas node
        const videoIdToNode = new Map<string, CanvasNode>();
        for (const n of placed) {
            const vid = getVideoId(n.data);
            if (vid) videoIdToNode.set(vid, n);
        }

        // ---------------------------------------------------------------
        // Frame-aware placement: group pending traffic nodes by snapshot
        // ---------------------------------------------------------------
        const pendingNodes = nodes.filter((n) => n.position === null);
        const frameGroups = buildFrameGroups(pendingNodes);

        // Pre-compute frame placements for all groups under each parent
        const framePlacementMap = new Map<string, { x: number; y: number }>();
        const parentsSeen = new Set<string>();

        // Group frameGroups by sourceVideoId to batch per parent
        const groupsByParent = new Map<string, typeof frameGroups>();
        for (const fg of frameGroups) {
            const arr = groupsByParent.get(fg.sourceVideoId) || [];
            arr.push(fg);
            groupsByParent.set(fg.sourceVideoId, arr);
        }

        for (const [srcVid, groups] of groupsByParent) {
            const parent = videoIdToNode.get(srcVid);
            if (!parent?.position) continue;
            parentsSeen.add(srcVid);

            // Find existing frame columns (already-placed nodes in frames under this parent)
            const existingFrameNodes = placed.filter((n) => {
                const sv = getSourceVideoId(n.data);
                if (sv !== srcVid || getNodeDataType(n.data) !== 'traffic-source') return false;
                return (n.data as TrafficSourceCardData).snapshotId != null;
            });

            // Discover existing frame columns by snapshotId
            const existingFrameKeys = new Set<string>();
            for (const n of existingFrameNodes) {
                const d = n.data as TrafficSourceCardData;
                if (d.snapshotId) existingFrameKeys.add(frameKey(srcVid, d.snapshotId));
            }

            // Compute where existing frames end (to place new frames after them)
            let existingMaxRight = parent.position.x;
            for (const n of existingFrameNodes) {
                if (!n.position) continue;
                const nw = n.size?.w ?? TRAFFIC_NODE_WIDTH;
                existingMaxRight = Math.max(existingMaxRight, n.position.x + nw + FRAME_PADDING + FRAME_GAP);
            }

            // Split groups: existing frames (append nodes) vs new frames
            const appendGroups: typeof groups = [];
            const newGroups: typeof groups = [];
            for (const g of groups) {
                const key = frameKey(g.sourceVideoId, g.snapshotId);
                if (existingFrameKeys.has(key)) {
                    appendGroups.push(g);
                } else {
                    newGroups.push(g);
                }
            }

            // For append groups: stack below existing nodes in the same frame column
            for (const ag of appendGroups) {
                const sameFrameNodes = existingFrameNodes.filter((n) => {
                    const d = n.data as TrafficSourceCardData;
                    return d.snapshotId === ag.snapshotId;
                });
                // Find the reference X and bottom Y of existing nodes in this frame
                let refX = parent.position.x;
                let bottomY = parent.position.y + nodeH(parent) + PLACEMENT_GAP + FRAME_TITLE_HEIGHT + FRAME_PADDING;
                for (const sn of sameFrameNodes) {
                    if (!sn.position) continue;
                    refX = sn.position.x; // All share same X within a frame
                    const snH = nodeSizes[sn.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
                    bottomY = Math.max(bottomY, sn.position.y + snH + PLACEMENT_GAP);
                }
                let yOff = 0;
                for (const node of ag.pendingNodes) {
                    framePlacementMap.set(node.id, { x: refX, y: bottomY + yOff });
                    const h = nodeSizes[node.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
                    yOff += h + PLACEMENT_GAP;
                }
            }

            // For new groups: place as new frame columns to the right
            const parentH = nodeH(parent);
            const baseY = parent.position.y + parentH + PLACEMENT_GAP;
            let cursorX = existingMaxRight;
            // If no existing frames, start at parent.x
            if (existingFrameNodes.length === 0) cursorX = parent.position.x;

            for (const ng of newGroups) {
                const contentX = cursorX + FRAME_PADDING;
                const contentY = baseY + FRAME_TITLE_HEIGHT + FRAME_PADDING;
                let yOff = 0;
                for (const node of ng.pendingNodes) {
                    framePlacementMap.set(node.id, { x: contentX, y: contentY + yOff });
                    const h = nodeSizes[node.id] ?? TRAFFIC_NODE_HEIGHT_ESTIMATE;
                    yOff += h + PLACEMENT_GAP;
                }
                const frameW = TRAFFIC_NODE_WIDTH + FRAME_PADDING * 2;
                cursorX += frameW + FRAME_GAP;
            }
        }

        // Fallback offset tracker for non-framed children
        const sourceChildOffsets = new Map<string, number>();

        // --- Shelf zone (top): competitor nodes ---
        const SHELF_GAP = 120;
        let minX = Infinity;
        let minY = Infinity;
        let maxRight = -Infinity; // rightmost edge of any placed node (for own-channel lane)
        for (const n of placed) {
            minX = Math.min(minX, n.position!.x);
            minY = Math.min(minY, n.position!.y);
            const nodeW = n.size?.w ?? NODE_WIDTH;
            maxRight = Math.max(maxRight, n.position!.x + nodeW);
        }

        const hasPlaced = placed.length > 0;

        // Top-shelf baseline (for competitor / fallback nodes)
        const shelfBaseX = hasPlaced ? minX : viewportCenter.x - NODE_WIDTH / 2;
        const shelfBaseY = hasPlaced ? minY - SHELF_GAP - NODE_HEIGHT_FALLBACK : viewportCenter.y - 94;

        // Right-lane baseline (for own-channel nodes)
        const rightLaneX = hasPlaced ? maxRight + PLACEMENT_GAP : viewportCenter.x - NODE_WIDTH / 2;
        const rightLaneY = hasPlaced ? minY : viewportCenter.y - 94;

        let shelfPending = 0;
        let rightPending = 0;
        let stickyPending = 0;

        set((s) => ({
            nodes: s.nodes.map((n) => {
                if (n.position !== null) return n;

                // Frame-placed nodes: use pre-computed positions
                const framePos = framePlacementMap.get(n.id);
                if (framePos) {
                    return { ...n, position: framePos };
                }

                // Non-framed children of traffic-source parents: stack below parent
                const srcVideoId = getSourceVideoId(n.data);
                if (srcVideoId && videoIdToNode.has(srcVideoId)) {
                    const parent = videoIdToNode.get(srcVideoId)!;
                    const parentH = nodeH(parent);
                    const currentOffset = sourceChildOffsets.get(srcVideoId) ?? 0;
                    const isTraffic = getNodeDataType(n.data) === 'traffic-source';
                    const childH = isTraffic ? TRAFFIC_NODE_HEIGHT_ESTIMATE : NODE_HEIGHT_FALLBACK;
                    sourceChildOffsets.set(srcVideoId, currentOffset + childH + PLACEMENT_GAP);
                    return {
                        ...n,
                        position: {
                            x: parent.position!.x,
                            y: parent.position!.y + parentH + PLACEMENT_GAP + currentOffset,
                        },
                    };
                }

                const pendingW = n.size?.w ?? NODE_WIDTH;
                const ownership = 'ownership' in n.data ? n.data.ownership : undefined;
                const isOwn = ownership === 'own-draft' || ownership === 'own-published';

                // Sticky notes: place near the last node the cursor hovered over
                if (n.type === 'sticky-note') {
                    const noteW = pendingW;
                    const noteH = STICKY_NOTE_HEIGHT_ESTIMATE;

                    // Primary intent signal: last node the cursor hovered
                    const lastNodeId = get().lastHoveredNodeId;
                    const lastNode = lastNodeId ? placed.find((p) => p.id === lastNodeId) : null;

                    let preferred: { x: number; y: number };
                    if (lastNode?.position) {
                        // Place to the right of the last hovered node
                        const nW = lastNode.size?.w ?? NODE_WIDTH;
                        preferred = {
                            x: lastNode.position.x + nW + PLACEMENT_GAP,
                            y: lastNode.position.y,
                        };
                    } else {
                        // Fallback: last raw canvas cursor position
                        const lastPos = get().lastCanvasWorldPos;
                        preferred = lastPos
                            ? { x: lastPos.x - noteW / 2, y: lastPos.y - noteH / 2 }
                            : { x: shelfBaseX + stickyPending * (noteW + PLACEMENT_GAP), y: shelfBaseY };
                    }

                    // Build occupied rects from all already-placed nodes
                    const occupiedRects: Rect[] = placed.map((p) => ({
                        x: p.position!.x,
                        y: p.position!.y,
                        w: p.size?.w ?? NODE_WIDTH,
                        h: p.size?.h && p.size.h > 0 ? p.size.h : NODE_HEIGHT_FALLBACK,
                    }));

                    const freePos = findFreeSpot(preferred, occupiedRects, noteW, noteH, PLACEMENT_GAP);
                    stickyPending++;
                    return { ...n, position: freePos };
                }

                if (isOwn) {
                    // Right-lane: place to the right of the rightmost existing node
                    const pos = {
                        x: rightLaneX + rightPending * (pendingW + PLACEMENT_GAP),
                        y: rightLaneY,
                    };
                    rightPending++;
                    return { ...n, position: pos };
                }

                // Top-shelf: competitor nodes and all other fallback types
                const pos = {
                    x: shelfBaseX + shelfPending * (pendingW + PLACEMENT_GAP),
                    y: shelfBaseY,
                };
                shelfPending++;
                return { ...n, position: pos };
            }),
        }));
        if (shelfPending > 0 || rightPending > 0 || stickyPending > 0 || sourceChildOffsets.size > 0) get()._save();
    },

    relayoutChildren: () => {
        const nodes = get().nodes;
        const nodeSizes = get().nodeSizes;

        const videoIdToNode = new Map<string, CanvasNode>();
        for (const n of nodes) {
            if (n.position) {
                const vid = getVideoId(n.data);
                if (vid) videoIdToNode.set(vid, n);
            }
        }

        let changed = false;
        const updates = new Map<string, { x: number; y: number }>();

        // ---------------------------------------------------------------
        // Pass 1: Frame-grouped children (traffic-source with snapshotId)
        // Each frame column is corrected independently.
        // Recalculates Y from parent's measured height to handle resized parents.
        // ---------------------------------------------------------------
        const framedNodeIds = new Set<string>();
        // Group by (sourceVideoId, snapshotId)
        const frameColumns = new Map<string, { srcVid: string; nodes: CanvasNode[] }>();
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

        // ---------------------------------------------------------------
        // Pass 2: Non-framed children (legacy stacking below parent)
        // ---------------------------------------------------------------
        const childrenByParent = new Map<string, CanvasNode[]>();
        for (const n of nodes) {
            if (!n.position) continue;
            if (framedNodeIds.has(n.id)) continue; // Skip framed nodes
            const srcVid = getSourceVideoId(n.data);
            if (srcVid && videoIdToNode.has(srcVid)) {
                const parent = videoIdToNode.get(srcVid)!;
                const parentW = parent.size?.w ?? NODE_WIDTH;
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

        if (!changed) return;

        set((s) => ({
            nodes: s.nodes.map((n) => {
                const newPos = updates.get(n.id);
                return newPos ? { ...n, position: newPos } : n;
            }),
        }));
        get()._save();
    },
});

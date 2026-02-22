// =============================================================================
// Layout Slice — node placement, relayout, and size tracking
// =============================================================================

import type { CanvasNode } from '../../../types/canvas';
import { getVideoId, getSourceVideoId, getNodeDataType } from '../../../types/canvas';
import { NODE_WIDTH, NODE_HEIGHT_FALLBACK, PLACEMENT_GAP, TRAFFIC_NODE_HEIGHT_ESTIMATE } from '../constants';
import type { CanvasSlice, CanvasState } from '../types';

export interface LayoutSlice {
    nodeSizes: Record<string, number>;
    updateNodeSize: CanvasState['updateNodeSize'];
    placePendingNodes: CanvasState['placePendingNodes'];
    relayoutChildren: CanvasState['relayoutChildren'];
}

export const createLayoutSlice: CanvasSlice<LayoutSlice> = (set, get) => ({
    nodeSizes: {},

    updateNodeSize: (id, height) => {
        set((s) => ({ nodeSizes: { ...s.nodeSizes, [id]: height } }));
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

        // No pre-seeding — relayoutChildren correction pass will re-stack
        // ALL children (old + new) with measured heights after rendering.
        const sourceChildOffsets = new Map<string, number>();

        let genericPending = 0;

        // Place new nodes above all existing content — a visual shelf zone
        const SHELF_GAP = 120;
        let minX = Infinity;
        let minY = Infinity;
        for (const n of placed) {
            minX = Math.min(minX, n.position!.x);
            minY = Math.min(minY, n.position!.y);
        }

        const baseX = placed.length > 0 ? minX : viewportCenter.x - NODE_WIDTH / 2;
        const baseY = placed.length > 0 ? minY - SHELF_GAP - NODE_HEIGHT_FALLBACK : viewportCenter.y - 94;

        set((s) => ({
            nodes: s.nodes.map((n) => {
                if (n.position !== null) return n;

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
                const pos = {
                    x: baseX + genericPending * (pendingW + PLACEMENT_GAP),
                    y: baseY,
                };
                genericPending++;
                return { ...n, position: pos };
            }),
        }));
        if (genericPending > 0 || sourceChildOffsets.size > 0) get()._save();
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

        // Only children aligned with parent (not manually moved)
        const childrenByParent = new Map<string, CanvasNode[]>();
        for (const n of nodes) {
            if (!n.position) continue;
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

        if (childrenByParent.size === 0) return;

        let changed = false;
        const updates = new Map<string, { x: number; y: number }>();

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

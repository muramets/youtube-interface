// =============================================================================
// Layout Slice — node placement, relayout, and size tracking
// =============================================================================

import type { CanvasNode } from '../../../types/canvas';
import { getVideoId, getSourceVideoId } from '../../../types/canvas';
import {
    NODE_WIDTH, NODE_HEIGHT_FALLBACK,
    TRAFFIC_NODE_WIDTH,
} from '../constants';
import type { CanvasSlice, CanvasState } from '../types';
import { correctFrameColumns, correctNonFramedChildren } from '../../../../features/Canvas/utils/frameLayout';
import { computeGrowUpDisplacements } from '../../../../features/Canvas/utils/growUp';
import { computeParentReflow, buildChildExclusions } from '../../../../features/Canvas/utils/parentReflow';
import type { ChildPosition } from '../../../../features/Canvas/utils/parentReflow';
import {
    computeBaselines, placeNonFramedChild, placeStickyNote,
    placeInRightLane, placeOnShelf, isOwnChannel, hasParent,
} from '../../../../features/Canvas/utils/nodePlacement';
import { computeAllFramePlacements } from '../../../../features/Canvas/utils/framePlacementEngine';

export interface LayoutSlice {
    nodeSizes: Record<string, number>;
    updateNodeSize: CanvasState['updateNodeSize'];
    onNextSizeFlush: CanvasState['onNextSizeFlush'];
    placePendingNodes: CanvasState['placePendingNodes'];
    relayoutChildren: CanvasState['relayoutChildren'];
}
// Batched node-size updates via SizeBatcher class
import { SizeBatcher } from '../../../../features/Canvas/utils/SizeBatcher';

export const createLayoutSlice: CanvasSlice<LayoutSlice> = (set, get) => {
    // Flag: only compute grow-up displacements after placement, not on scroll/LOD
    let growUpPending = false;

    // Create batcher with closure access to get/set
    const sizeBatcher = new SizeBatcher((batch) => {
        // Grow-up: only compute when flagged by placePendingNodes
        let positionUpdates = new Map<string, { x: number; y: number }>();
        if (growUpPending) {
            growUpPending = false;
            const { nodes, nodeSizes: oldSizes } = get();
            positionUpdates = computeGrowUpDisplacements(batch, oldSizes, nodes);
        }

        if (positionUpdates.size > 0) {
            set((s) => ({
                nodeSizes: { ...s.nodeSizes, ...batch },
                nodes: s.nodes.map((n) => {
                    const newPos = positionUpdates.get(n.id);
                    return newPos ? { ...n, position: newPos } : n;
                }),
            }));
            get()._save();
        } else {
            set((s) => ({ nodeSizes: { ...s.nodeSizes, ...batch } }));
        }
    });

    return {
        nodeSizes: {},

        updateNodeSize: (id, height) => {
            // Ignore 0-height: ResizeObserver fires 0 during mount/unmount
            if (height <= 0) return;
            if (get().nodeSizes[id] === height) return;
            sizeBatcher.schedule(id, height);
        },

        onNextSizeFlush: (cb) => sizeBatcher.onNextFlush(cb),

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
            // Frame-aware placement (via pure engine)
            // ---------------------------------------------------------------
            const pendingNodes = nodes.filter((n) => n.position === null);
            const { placements: framePlacementMap, parentsSeen } =
                computeAllFramePlacements(pendingNodes, placed, nodeSizes, videoIdToNode, nodeH);

            // Flag grow-up for the next SizeBatcher flush (parent may grow taller from width reflow)
            if (parentsSeen.size > 0) growUpPending = true;

            // ---------------------------------------------------------------
            // Reflow pass: auto-width parents + uniform displacement
            // ---------------------------------------------------------------
            // Build child exclusions from both pending placements and existing nodes
            const childExclusions = buildChildExclusions(placed, parentsSeen);
            for (const [nodeId] of framePlacementMap) {
                const node = nodes.find((n) => n.id === nodeId);
                if (!node) continue;
                const srcVid = getSourceVideoId(node.data);
                if (!srcVid) continue;
                let ids = childExclusions.get(srcVid);
                if (!ids) { ids = new Set(); childExclusions.set(srcVid, ids); }
                ids.add(nodeId);
            }

            // Provide child positions from both pending frame placements and existing placed children
            const getChildPositions = (parentVideoId: string): ChildPosition[] => {
                const positions: ChildPosition[] = [];
                // From pending frame placements
                for (const [cid, pos] of framePlacementMap) {
                    const node = nodes.find((n) => n.id === cid);
                    if (!node) continue;
                    const srcVid = getSourceVideoId(node.data);
                    if (srcVid === parentVideoId) {
                        positions.push({ id: cid, x: pos.x, w: TRAFFIC_NODE_WIDTH });
                    }
                }
                // From already-placed frame children
                for (const n of placed) {
                    const sv = getSourceVideoId(n.data);
                    if (sv !== parentVideoId || !n.position) continue;
                    positions.push({ id: n.id, x: n.position.x, w: n.size?.w ?? TRAFFIC_NODE_WIDTH });
                }
                return positions;
            };

            const { widthUpdates: parentWidthUpdates, displacements: nodeDisplacements } =
                computeParentReflow(parentsSeen, videoIdToNode, getChildPositions, placed, childExclusions);

            // Fallback offset tracker for non-framed children
            const sourceChildOffsets = new Map<string, number>();

            // --- Compute layout baselines from placed nodes ---
            const baselines = computeBaselines(placed, viewportCenter, parentWidthUpdates, nodeDisplacements);

            // Read Zustand state once for sticky note placement
            const lastHoveredNodeId = get().lastHoveredNodeId;
            const lastHoveredNode = lastHoveredNodeId ? placed.find((p) => p.id === lastHoveredNodeId) : null;
            const lastCanvasWorldPos = get().lastCanvasWorldPos;

            let shelfPending = 0;
            let rightPending = 0;
            let stickyPending = 0;

            set((s) => ({
                nodes: s.nodes.map((n) => {
                    // Apply reflow: parent width updates + displacement for already-placed nodes
                    if (n.position !== null) {
                        const newW = parentWidthUpdates.get(n.id);
                        const dx = nodeDisplacements.get(n.id);
                        if (newW || dx) {
                            return {
                                ...n,
                                ...(newW ? { size: { w: newW, h: n.size?.h ?? 0 } } : {}),
                                ...(dx ? { position: { x: n.position.x + dx, y: n.position.y } } : {}),
                            };
                        }
                        return n;
                    }

                    // Frame-placed nodes: use pre-computed positions
                    const framePos = framePlacementMap.get(n.id);
                    if (framePos) {
                        return { ...n, position: framePos };
                    }

                    // Non-framed children of traffic-source parents: stack below parent
                    if (hasParent(n, videoIdToNode)) {
                        const srcVideoId = getSourceVideoId(n.data)!;
                        const parent = videoIdToNode.get(srcVideoId)!;
                        const currentOffset = sourceChildOffsets.get(srcVideoId) ?? 0;
                        const { position, nextOffset } = placeNonFramedChild(n, parent, nodeH(parent), currentOffset);
                        sourceChildOffsets.set(srcVideoId, nextOffset);
                        return { ...n, position };
                    }

                    const pendingW = n.size?.w ?? NODE_WIDTH;

                    // Sticky notes: place near the last node the cursor hovered over
                    if (n.type === 'sticky-note') {
                        const pos = placeStickyNote(
                            pendingW, lastHoveredNode, lastCanvasWorldPos,
                            placed, baselines.shelfBaseX, baselines.shelfBaseY, stickyPending,
                        );
                        stickyPending++;
                        return { ...n, position: pos };
                    }

                    if (isOwnChannel(n)) {
                        const pos = placeInRightLane(pendingW, rightPending, baselines);
                        rightPending++;
                        return { ...n, position: pos };
                    }

                    // Top-shelf: competitor nodes and all other fallback types
                    const pos = placeOnShelf(pendingW, shelfPending, baselines);
                    shelfPending++;
                    return { ...n, position: pos };
                }),
            }));
            if (shelfPending > 0 || rightPending > 0 || stickyPending > 0 || sourceChildOffsets.size > 0 || parentWidthUpdates.size > 0) get()._save();
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

            // Pass 1: Frame-grouped children correction (via pure function)
            const { updates, framedNodeIds, frameColumns, changed: frameChanged } =
                correctFrameColumns(nodes, nodeSizes, videoIdToNode);
            let changed = frameChanged;

            // Pass 2: Non-framed children correction (via pure function)
            const { childrenByParent, changed: nonFrameChanged } =
                correctNonFramedChildren(nodes, nodeSizes, videoIdToNode, framedNodeIds, updates, NODE_WIDTH);
            if (nonFrameChanged) changed = true;

            // ---------------------------------------------------------------
            // Pass 3: Parent auto-width reflow (via shared pure function)
            // ---------------------------------------------------------------
            const parentVids = new Set<string>();
            for (const [, column] of frameColumns) parentVids.add(column.srcVid);

            // Build child exclusions from frame columns + non-framed children
            const reflowExclusions = new Map<string, Set<string>>();
            for (const [, column] of frameColumns) {
                let cids = reflowExclusions.get(column.srcVid);
                if (!cids) { cids = new Set(); reflowExclusions.set(column.srcVid, cids); }
                for (const cn of column.nodes) cids.add(cn.id);
            }
            for (const [srcVid, children] of childrenByParent) {
                let cids = reflowExclusions.get(srcVid);
                if (!cids) { cids = new Set(); reflowExclusions.set(srcVid, cids); }
                for (const cn of children) cids.add(cn.id);
            }

            // Provide child positions using corrected positions from Pass 1/2
            const getRelayoutChildPositions = (parentVideoId: string): ChildPosition[] => {
                const positions: ChildPosition[] = [];
                for (const n of nodes) {
                    if (!n.position) continue;
                    const sv = getSourceVideoId(n.data);
                    if (sv !== parentVideoId) continue;
                    const correctedPos = updates.get(n.id);
                    positions.push({
                        id: n.id,
                        x: correctedPos?.x ?? n.position.x,
                        w: n.size?.w ?? TRAFFIC_NODE_WIDTH,
                    });
                }
                return positions;
            };

            const { widthUpdates: parentWidthUpdates, displacements: nodeDisplacements } =
                computeParentReflow(parentVids, videoIdToNode, getRelayoutChildPositions, nodes, reflowExclusions);

            if (parentWidthUpdates.size > 0 || nodeDisplacements.size > 0) changed = true;

            if (!changed) return;

            set((s) => ({
                nodes: s.nodes.map((n) => {
                    const newPos = updates.get(n.id);
                    const newW = parentWidthUpdates.get(n.id);
                    const dx = nodeDisplacements.get(n.id);

                    if (!newPos && !newW && !dx) return n;

                    return {
                        ...n,
                        ...(newPos ? { position: newPos } : {}),
                        ...(newW ? { size: { w: newW, h: n.size?.h ?? 0 } } : {}),
                        ...(dx && n.position ? {
                            position: {
                                x: (newPos?.x ?? n.position.x) + dx,
                                y: newPos?.y ?? n.position.y,
                            },
                        } : {}),
                    };
                }),
            }));
            get()._save();
        },
    };
};

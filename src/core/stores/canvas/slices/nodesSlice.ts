// =============================================================================
// Nodes Slice — CRUD operations for canvas nodes
// =============================================================================

import type { CanvasNode, CanvasNodeData } from '../../../types/canvas';
import { Timestamp } from 'firebase/firestore';
import { TRAFFIC_NODE_WIDTH, STICKY_NOTE_HEIGHT_ESTIMATE, NODE_HEIGHT_FALLBACK } from '../constants';
import type { CanvasSlice, CanvasState } from '../types';

// ---------------------------------------------------------------------------
// Node factory — consolidates type mapping and default sizes for addNode/addNodeAt
// ---------------------------------------------------------------------------
function createCanvasNode(
    data: CanvasNodeData,
    position: { x: number; y: number } | null,
    existingNodes: CanvasNode[],
): CanvasNode {
    const maxZ = existingNodes.reduce((m, n) => Math.max(m, n.zIndex), 0);

    let nodeType: CanvasNode['type'] = 'sticky-note';
    if (data.type === 'video-card') nodeType = 'video-card';
    else if (data.type === 'suggested-traffic') nodeType = 'suggested-traffic';
    else if (data.type === 'traffic-source') nodeType = 'traffic-source';

    return {
        id: crypto.randomUUID(),
        type: nodeType,
        data,
        position,
        // Traffic-source nodes are auto-positioned; skip the pending glow
        isPlaced: position !== null ? true : (nodeType === 'traffic-source' ? true : undefined),
        zIndex: maxZ + 1,
        ...(nodeType === 'traffic-source' ? { size: { w: TRAFFIC_NODE_WIDTH, h: 0 } } : {}),
        ...(nodeType === 'sticky-note' ? { size: { w: 200, h: 0 } } : {}),
        createdAt: Timestamp.now(),
    };
}
export interface NodesSlice {
    nodes: CanvasNode[];
    lastCanvasWorldPos: { x: number; y: number } | null;
    lastHoveredNodeId: string | null;
    addNode: CanvasState['addNode'];
    addNodeAt: CanvasState['addNodeAt'];
    updateNodeData: CanvasState['updateNodeData'];
    moveNode: CanvasState['moveNode'];
    moveNodes: CanvasState['moveNodes'];
    markPlaced: CanvasState['markPlaced'];
    deleteNode: CanvasState['deleteNode'];
    deleteNodes: CanvasState['deleteNodes'];
    alignNodesTop: CanvasState['alignNodesTop'];
    alignNodesCenterY: CanvasState['alignNodesCenterY'];
    duplicateNodes: CanvasState['duplicateNodes'];
    resizeNode: CanvasState['resizeNode'];
    bringToFront: CanvasState['bringToFront'];
    sendToBack: CanvasState['sendToBack'];
    bringNodesToFront: CanvasState['bringNodesToFront'];
    sendNodesToBack: CanvasState['sendNodesToBack'];
    setLastCanvasWorldPos: CanvasState['setLastCanvasWorldPos'];
    setLastHoveredNodeId: CanvasState['setLastHoveredNodeId'];
}

export const createNodesSlice: CanvasSlice<NodesSlice> = (set, get) => ({
    nodes: [],
    lastCanvasWorldPos: null,
    lastHoveredNodeId: null,

    setLastCanvasWorldPos: (pos) => set({ lastCanvasWorldPos: pos }),
    setLastHoveredNodeId: (id) => set({ lastHoveredNodeId: id }),

    addNode: (data) => {
        get()._pushUndo();
        const newNode = createCanvasNode(data, null, get().nodes);
        set((s) => ({ nodes: [...s.nodes, newNode] }));
        get()._save();
    },

    addNodeAt: (data, position) => {
        get()._pushUndo();
        const newNode = createCanvasNode(data, position, get().nodes);
        set((s) => ({ nodes: [...s.nodes, newNode] }));
        get()._save();
    },

    updateNodeData: (id, partialData) => {
        get()._markDirty(id);
        set((s) => ({
            nodes: s.nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, ...partialData } as CanvasNodeData } : n
            ),
        }));
        get()._save();
    },

    moveNode: (id, position) => {
        set((s) => ({
            nodes: s.nodes.map((n) => n.id === id ? { ...n, position, isPlaced: true } : n),
        }));
        get()._save();
    },

    moveNodes: (updates) => {
        const byId = new Map(updates.map((u) => [u.id, u.position]));
        set((s) => ({
            nodes: s.nodes.map((n) => {
                const pos = byId.get(n.id);
                return pos ? { ...n, position: pos, isPlaced: true } : n;
            }),
        }));
        get()._save();
    },

    markPlaced: (id) => {
        const node = get().nodes.find((n) => n.id === id);
        if (!node || node.isPlaced) return;
        set((s) => ({
            nodes: s.nodes.map((n) => n.id === id ? { ...n, isPlaced: true } : n),
        }));
        get()._save();
    },

    deleteNode: (id) => {
        get()._pushUndo();
        set((s) => ({
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id),
        }));
        get()._markDeleted([id]);
        get()._save();
    },

    deleteNodes: (ids) => {
        get()._pushUndo();
        const idSet = new Set(ids);
        set((s) => ({
            nodes: s.nodes.filter((n) => !idSet.has(n.id)),
            edges: s.edges.filter((e) => !idSet.has(e.sourceNodeId) && !idSet.has(e.targetNodeId)),
            selectedNodeIds: new Set<string>(),
        }));
        get()._markDeleted(ids);
        get()._save();
    },

    alignNodesTop: (ids) => {
        get()._pushUndo();
        const idSet = new Set(ids);
        const targets = get().nodes.filter((n) => idSet.has(n.id) && n.position);
        if (targets.length < 2) return;
        ids.forEach((id) => get()._markDirty(id));
        const minY = Math.min(...targets.map((n) => n.position!.y));
        set((s) => ({
            nodes: s.nodes.map((n) =>
                idSet.has(n.id) && n.position
                    ? { ...n, position: { ...n.position, y: minY } }
                    : n
            ),
        }));
        get()._save();
    },

    alignNodesCenterY: (ids) => {
        get()._pushUndo();
        const idSet = new Set(ids);
        const targets = get().nodes.filter((n) => idSet.has(n.id) && n.position);
        if (targets.length < 2) return;
        ids.forEach((id) => get()._markDirty(id));

        const nodeSizes = get().nodeSizes;
        const nodeH = (n: CanvasNode) => nodeSizes[n.id] ?? n.size?.h ?? NODE_HEIGHT_FALLBACK;

        // Find the tallest node
        let tallest = targets[0];
        let tallestH = nodeH(tallest);
        for (const n of targets) {
            const h = nodeH(n);
            if (h > tallestH) { tallest = n; tallestH = h; }
        }

        // Vertical center of the tallest node
        const centerY = tallest.position!.y + tallestH / 2;

        set((s) => ({
            nodes: s.nodes.map((n) => {
                if (!idSet.has(n.id) || !n.position) return n;
                const h = nodeH(n);
                const newY = centerY - h / 2;
                return { ...n, position: { ...n.position, y: newY } };
            }),
        }));
        get()._save();
    },

    duplicateNodes: (ids) => {
        const idSet = new Set(ids);
        const sources = get().nodes.filter((n) => idSet.has(n.id) && n.position);
        if (sources.length === 0) return [];

        const maxZ = get().nodes.reduce((m, n) => Math.max(m, n.zIndex), 0);
        // Map old ID → new ID for edge remapping
        const idMap = new Map<string, string>();
        const clones: CanvasNode[] = sources.map((n, i) => {
            const newId = crypto.randomUUID();
            idMap.set(n.id, newId);
            return {
                ...n,
                id: newId,
                position: { ...n.position! },
                size: n.size ? { ...n.size } : undefined,
                data: { ...n.data } as CanvasNodeData,
                zIndex: maxZ + 1 + i,
                isPlaced: true,
                createdAt: Timestamp.now(),
            };
        });

        // Clone edges where both endpoints are in the selection
        const edgeClones = get().edges
            .filter((e) => idSet.has(e.sourceNodeId) && idSet.has(e.targetNodeId))
            .map((e) => ({
                ...e,
                id: crypto.randomUUID(),
                sourceNodeId: idMap.get(e.sourceNodeId)!,
                targetNodeId: idMap.get(e.targetNodeId)!,
                createdAt: Date.now(),
            }));

        const newIds = clones.map((c) => c.id);

        set((s) => ({
            nodes: [...s.nodes, ...clones],
            edges: [...s.edges, ...edgeClones],
            selectedNodeIds: new Set(newIds),
        }));
        get()._save();
        return newIds;
    },

    resizeNode: (id, width, height) => {
        set((s) => ({
            nodes: s.nodes.map((n) => {
                if (n.id !== id) return n;
                // Sticky notes cannot shrink below their default creation size
                const minW = n.type === 'sticky-note' ? 200 : 40;
                const minH = n.type === 'sticky-note' ? STICKY_NOTE_HEIGHT_ESTIMATE : 40;
                const w = Math.max(minW, width);
                const existingH = n.size?.h ?? 0;
                // height=0 means "auto" (determined by content, e.g. video card)
                const h = height === 0 ? 0
                    : height != null ? Math.max(minH, height)
                        : existingH;
                return { ...n, size: { w, h } };
            }),
        }));
        get()._save();
    },

    bringToFront: (id) => {
        const maxZ = get().nodes.reduce((m, n) => Math.max(m, n.zIndex), 0);
        set((s) => ({
            nodes: s.nodes.map((n) => n.id === id ? { ...n, zIndex: maxZ + 1 } : n),
        }));
        get()._save();
    },

    sendToBack: (id) => {
        const minZ = get().nodes.reduce((m, n) => Math.min(m, n.zIndex), Infinity);
        set((s) => ({
            nodes: s.nodes.map((n) => n.id === id ? { ...n, zIndex: minZ - 1 } : n),
        }));
        get()._save();
    },

    bringNodesToFront: (ids) => {
        const idSet = new Set(ids);
        // Sort by current zIndex so relative order is preserved
        const sorted = get().nodes
            .filter((n) => idSet.has(n.id))
            .sort((a, b) => a.zIndex - b.zIndex);
        const maxZ = get().nodes.reduce((m, n) => Math.max(m, n.zIndex), 0);
        const newZ = new Map(sorted.map((n, i) => [n.id, maxZ + 1 + i]));
        set((s) => ({
            nodes: s.nodes.map((n) => newZ.has(n.id) ? { ...n, zIndex: newZ.get(n.id)! } : n),
        }));
        get()._save();
    },

    sendNodesToBack: (ids) => {
        const idSet = new Set(ids);
        const sorted = get().nodes
            .filter((n) => idSet.has(n.id))
            .sort((a, b) => a.zIndex - b.zIndex);
        const minZ = get().nodes.reduce((m, n) => Math.min(m, n.zIndex), Infinity);
        const newZ = new Map(sorted.map((n, i) => [n.id, minZ - ids.length + i]));
        set((s) => ({
            nodes: s.nodes.map((n) => newZ.has(n.id) ? { ...n, zIndex: newZ.get(n.id)! } : n),
        }));
        get()._save();
    },
});

// =============================================================================
// Nodes Slice — CRUD operations for canvas nodes
// =============================================================================

import type { CanvasNode, CanvasNodeData } from '../../../types/canvas';
import { Timestamp } from 'firebase/firestore';
import { TRAFFIC_NODE_WIDTH } from '../constants';
import type { CanvasSlice, CanvasState } from '../types';

export interface NodesSlice {
    nodes: CanvasNode[];
    addNode: CanvasState['addNode'];
    updateNodeData: CanvasState['updateNodeData'];
    moveNode: CanvasState['moveNode'];
    moveNodes: CanvasState['moveNodes'];
    deleteNode: CanvasState['deleteNode'];
    deleteNodes: CanvasState['deleteNodes'];
    alignNodesTop: CanvasState['alignNodesTop'];
    resizeNode: CanvasState['resizeNode'];
    bringToFront: CanvasState['bringToFront'];
}

export const createNodesSlice: CanvasSlice<NodesSlice> = (set, get) => ({
    nodes: [],

    addNode: (data) => {
        const maxZ = get().nodes.reduce((m, n) => Math.max(m, n.zIndex), 0);

        let nodeType: CanvasNode['type'] = 'sticky-note';
        if (data.type === 'video-card') nodeType = 'video-card';
        else if (data.type === 'suggested-traffic') nodeType = 'suggested-traffic';
        else if (data.type === 'traffic-source') nodeType = 'traffic-source';

        const newNode: CanvasNode = {
            id: crypto.randomUUID(),
            type: nodeType,
            data,
            position: null,
            zIndex: maxZ + 1,
            ...(nodeType === 'traffic-source' ? { size: { w: TRAFFIC_NODE_WIDTH, h: 0 } } : {}),
            createdAt: Timestamp.now(),
        };
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
            nodes: s.nodes.map((n) => n.id === id ? { ...n, position } : n),
        }));
        get()._save();
    },

    moveNodes: (updates) => {
        const byId = new Map(updates.map((u) => [u.id, u.position]));
        set((s) => ({
            nodes: s.nodes.map((n) => {
                const pos = byId.get(n.id);
                return pos ? { ...n, position: pos } : n;
            }),
        }));
        get()._save();
    },

    deleteNode: (id) => {
        set((s) => ({
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id),
        }));
        get()._save();
    },

    deleteNodes: (ids) => {
        const idSet = new Set(ids);
        set((s) => ({
            nodes: s.nodes.filter((n) => !idSet.has(n.id)),
            edges: s.edges.filter((e) => !idSet.has(e.sourceNodeId) && !idSet.has(e.targetNodeId)),
            selectedNodeIds: new Set<string>(),
        }));
        get()._save();
    },

    alignNodesTop: (ids) => {
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

    resizeNode: (id, width) => {
        const clamped = Math.max(160, Math.min(600, width));
        set((s) => ({
            nodes: s.nodes.map((n) =>
                n.id === id ? { ...n, size: { w: clamped, h: 0 } } : n
            ),
        }));
        get()._save();
    },

    bringToFront: (id) => {
        const maxZ = get().nodes.reduce((m, n) => Math.max(m, n.zIndex), 0);
        set((s) => ({
            nodes: s.nodes.map((n) => n.id === id ? { ...n, zIndex: maxZ + 1 } : n),
        }));
    },
});

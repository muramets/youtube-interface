// =============================================================================
// Edges Slice — edge CRUD + pending edge (rubber-band) management
// =============================================================================

import type { CanvasEdge } from '../../../types/canvas';
import type { CanvasSlice, CanvasState, PendingEdge } from '../types';

export interface EdgesSlice {
    edges: CanvasEdge[];
    pendingEdge: PendingEdge | null;
    addEdge: CanvasState['addEdge'];
    deleteEdge: CanvasState['deleteEdge'];
    startPendingEdge: CanvasState['startPendingEdge'];
    updatePendingEdge: CanvasState['updatePendingEdge'];
    setSnapTarget: CanvasState['setSnapTarget'];
    clearSnapTarget: CanvasState['clearSnapTarget'];
    completePendingEdge: CanvasState['completePendingEdge'];
    cancelPendingEdge: CanvasState['cancelPendingEdge'];
}

export const createEdgesSlice: CanvasSlice<EdgesSlice> = (set, get) => ({
    edges: [],
    pendingEdge: null,

    addEdge: (edgeData) => {
        const exists = get().edges.some(
            (e) => e.sourceNodeId === edgeData.sourceNodeId &&
                e.targetNodeId === edgeData.targetNodeId &&
                e.sourceHandle === edgeData.sourceHandle &&
                e.targetHandle === edgeData.targetHandle
        );
        if (exists) return;

        get()._pushUndo();

        const newEdge: CanvasEdge = {
            ...edgeData,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
        };
        set((s) => ({ edges: [...s.edges, newEdge] }));
        get()._save();
    },

    deleteEdge: (id) => {
        get()._pushUndo();
        set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }));
        get()._save();
    },

    startPendingEdge: (sourceNodeId, sourceHandle, sourceAnchor) => {
        set({ pendingEdge: { sourceNodeId, sourceHandle, sourceAnchor, x: sourceAnchor.x, y: sourceAnchor.y, snapTarget: null } });
    },

    updatePendingEdge: (x, y) => {
        set((s) => s.pendingEdge ? { pendingEdge: { ...s.pendingEdge, x, y } } : {});
    },

    setSnapTarget: (nodeId, handle, anchor) => {
        set((s) => s.pendingEdge ? { pendingEdge: { ...s.pendingEdge, snapTarget: { nodeId, handle, anchor } } } : {});
    },

    clearSnapTarget: () => {
        set((s) => s.pendingEdge ? { pendingEdge: { ...s.pendingEdge, snapTarget: null } } : {});
    },

    completePendingEdge: (targetNodeId, targetHandle) => {
        const pe = get().pendingEdge;
        if (!pe) return;
        set({ pendingEdge: null });
        get().addEdge({
            sourceNodeId: pe.sourceNodeId,
            targetNodeId,
            sourceHandle: pe.sourceHandle,
            targetHandle,
        });
    },

    cancelPendingEdge: () => set({ pendingEdge: null }),
});

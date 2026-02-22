// =============================================================================
// Selection Slice — node selection state
// =============================================================================

import type { CanvasSlice, CanvasState } from '../types';

export interface SelectionSlice {
    selectedNodeIds: Set<string>;
    selectNode: CanvasState['selectNode'];
    setSelectedNodeIds: CanvasState['setSelectedNodeIds'];
    clearSelection: CanvasState['clearSelection'];
}

export const createSelectionSlice: CanvasSlice<SelectionSlice> = (set) => ({
    selectedNodeIds: new Set<string>(),

    selectNode: (id, multi) => {
        set((s) => {
            if (multi) {
                const next = new Set(s.selectedNodeIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return { selectedNodeIds: next };
            } else {
                return { selectedNodeIds: new Set([id]) };
            }
        });
    },

    clearSelection: () => set({ selectedNodeIds: new Set() }),

    setSelectedNodeIds: (ids) => set({ selectedNodeIds: new Set(ids) }),
});

// =============================================================================
// Knowledge Selection Store — Selection state for Knowledge Page (Zustand)
// =============================================================================
//
// Single-scope selection for KI export. Simpler than videoSelectionStore
// (no multi-scope, no persist) — just a flat Set<string> of selected KI IDs.
// =============================================================================

import { create } from 'zustand';

interface KnowledgeSelectionState {
    /** Set of selected Knowledge Item IDs. */
    selectedIds: Set<string>;

    /** Toggle a KI in/out of selection. */
    toggle: (id: string) => void;

    /** Select all provided IDs (replaces current selection). */
    selectAll: (ids: string[]) => void;

    /** Clear selection. */
    clear: () => void;
}

const EMPTY_SET = new Set<string>();

export const useKnowledgeSelectionStore = create<KnowledgeSelectionState>((set) => ({
    selectedIds: EMPTY_SET,

    toggle: (id) => set(state => {
        const next = new Set(state.selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        return { selectedIds: next.size > 0 ? next : EMPTY_SET };
    }),

    selectAll: (ids) => set({
        selectedIds: ids.length > 0 ? new Set(ids) : EMPTY_SET,
    }),

    clear: () => set({ selectedIds: EMPTY_SET }),
}));

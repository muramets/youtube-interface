// =============================================================================
// Knowledge Store — UI state for Lab Page (channel-level Knowledge Items)
//
// Manages: category filter, sort order, expanded item ID.
// =============================================================================

import { create } from 'zustand';

interface KnowledgeState {
    /** Selected category filter (null = show all) */
    selectedCategory: string | null;
    /** Sort order for KI list */
    sortOrder: 'newest' | 'oldest';
    /** Currently expanded item ID (for single-expand behavior) */
    expandedItemId: string | null;

    // Actions
    setCategory: (category: string | null) => void;
    setSortOrder: (order: 'newest' | 'oldest') => void;
    toggleExpand: (itemId: string) => void;
}

export const useKnowledgeStore = create<KnowledgeState>()((set, get) => ({
    selectedCategory: null,
    sortOrder: 'newest',
    expandedItemId: null,

    setCategory: (category) => set({ selectedCategory: category }),
    setSortOrder: (order) => set({ sortOrder: order }),
    toggleExpand: (itemId) => {
        const current = get().expandedItemId;
        set({ expandedItemId: current === itemId ? null : itemId });
    },
}));

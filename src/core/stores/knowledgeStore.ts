import { create } from 'zustand';

interface KnowledgeState {
    /** Active category filter slug, or null for "All" */
    selectedCategory: string | null;
    /** Sort order for KI list */
    sortOrder: 'newest' | 'oldest';
}

interface KnowledgeActions {
    setCategory: (category: string | null) => void;
    setSortOrder: (order: 'newest' | 'oldest') => void;
}

export const useKnowledgeStore = create<KnowledgeState & KnowledgeActions>((set) => ({
    selectedCategory: null,
    sortOrder: 'newest',

    setCategory: (category) => set({ selectedCategory: category }),
    setSortOrder: (order) => set({ sortOrder: order }),
}));

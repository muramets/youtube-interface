import { create } from 'zustand';

export type KnowledgeScopeFilter = 'all' | 'channel' | 'video';

interface KnowledgeState {
    /** Scope filter: all, channel-only, or video-only */
    scopeFilter: KnowledgeScopeFilter;
    /** Active category filter slug, or null for "All" */
    selectedCategory: string | null;
    /** Sort order for KI list */
    sortOrder: 'newest' | 'oldest';
}

interface KnowledgeActions {
    setScopeFilter: (scope: KnowledgeScopeFilter) => void;
    setCategory: (category: string | null) => void;
    setSortOrder: (order: 'newest' | 'oldest') => void;
}

export const useKnowledgeStore = create<KnowledgeState & KnowledgeActions>((set) => ({
    scopeFilter: 'all',
    selectedCategory: null,
    sortOrder: 'newest',

    setScopeFilter: (scopeFilter) => set({ scopeFilter, selectedCategory: null }),
    setCategory: (category) => set({ selectedCategory: category }),
    setSortOrder: (order) => set({ sortOrder: order }),
}));

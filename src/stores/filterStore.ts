import { create } from 'zustand';

export type FilterOperator = 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
export type FilterType = 'channel' | 'playlist' | 'title' | 'duration' | 'date' | 'views' | 'videoType';

export interface FilterItem {
    id: string;
    type: FilterType;
    operator: FilterOperator;
    value: any; // string, number, [start, end], etc.
    label?: string; // e.g. "Views > 1000" for display chip
}

interface FilterState {
    searchQuery: string;
    selectedChannel: string | null; // Legacy simple filter (can be kept for backward compat or migrated)
    homeSortBy: 'default' | 'views' | 'date';

    activeFilters: FilterItem[];

    // Actions
    setSearchQuery: (query: string) => void;
    setSelectedChannel: (channel: string | null) => void;
    setHomeSortBy: (sort: 'default' | 'views' | 'date') => void;

    addFilter: (filter: Omit<FilterItem, 'id'>) => void;
    removeFilter: (id: string) => void;
    updateFilter: (id: string, updates: Partial<FilterItem>) => void;
    clearFilters: () => void;
}

import { persist } from 'zustand/middleware';

export const useFilterStore = create<FilterState>()(
    persist(
        (set) => ({
            searchQuery: '',
            selectedChannel: null,
            homeSortBy: 'default',
            activeFilters: [],

            setSearchQuery: (query) => set({ searchQuery: query }),
            setSelectedChannel: (channel) => set({ selectedChannel: channel }),
            setHomeSortBy: (sort) => set({ homeSortBy: sort }),

            addFilter: (filter) => set((state) => ({
                activeFilters: [...state.activeFilters, { ...filter, id: crypto.randomUUID() }]
            })),
            removeFilter: (id) => set((state) => ({
                activeFilters: state.activeFilters.filter((f) => f.id !== id)
            })),
            updateFilter: (id, updates) => set((state) => ({
                activeFilters: state.activeFilters.map((f) => f.id === id ? { ...f, ...updates } : f)
            })),
            clearFilters: () => set({ activeFilters: [] })
        }),
        {
            name: 'filter-storage',
            partialize: (state) => ({
                homeSortBy: state.homeSortBy,
                activeFilters: state.activeFilters,
                selectedChannel: state.selectedChannel // optional, but requested "filters should be remembered"
            })
        }
    )
);

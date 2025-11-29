import { create } from 'zustand';

interface FilterState {
    searchQuery: string;
    selectedChannel: string | null;
    homeSortBy: 'default' | 'views' | 'date';

    // Actions
    setSearchQuery: (query: string) => void;
    setSelectedChannel: (channel: string | null) => void;
    setHomeSortBy: (sort: 'default' | 'views' | 'date') => void;
}

export const useFilterStore = create<FilterState>((set) => ({
    searchQuery: '',
    selectedChannel: null,
    homeSortBy: 'default',

    setSearchQuery: (query) => set({ searchQuery: query }),
    setSelectedChannel: (channel) => set({ selectedChannel: channel }),
    setHomeSortBy: (sort) => set({ homeSortBy: sort })
}));

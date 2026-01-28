import { create } from 'zustand';

export type FilterOperator = 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
export type FilterType = 'channel' | 'playlist' | 'title' | 'duration' | 'date' | 'views' | 'videoType';

export type FilterValue = string | number | [number, number] | string[];

export interface FilterItem {
    id: string;
    type: FilterType;
    operator: FilterOperator;
    value: FilterValue; // string, number, [start, end], etc.
    label?: string; // e.g. "Views > 1000" for display chip
}

interface FilterState {
    searchQuery: string;
    selectedChannel: string | null; // Legacy simple filter (can be kept for backward compat or migrated)
    homeSortBy: 'default' | 'views' | 'date' | 'recently_added';

    activeFilters: FilterItem[];
    channelFilters: Record<string, FilterItem[]>;
    currentChannelId: string | null;

    // Actions
    setSearchQuery: (query: string) => void;
    setSelectedChannel: (channel: string | null) => void;
    setHomeSortBy: (sort: 'default' | 'views' | 'date' | 'recently_added') => void;

    addFilter: (filter: Omit<FilterItem, 'id'>) => void;
    removeFilter: (id: string) => void;
    updateFilter: (id: string, updates: Partial<FilterItem>) => void;
    clearFilters: () => void;

    // New action to handle channel switching
    // New action to handle channel switching
    switchChannel: (channelId: string | null) => void;

    // Auth State
    userId: string | null;
    setUserId: (id: string | null) => void;
}

import { persist } from 'zustand/middleware';

export const useFilterStore = create<FilterState>()(
    persist(
        (set) => ({
            searchQuery: '',
            selectedChannel: null,
            homeSortBy: 'default',
            activeFilters: [],
            channelFilters: {},
            currentChannelId: null,
            userId: null,

            setUserId: (id) => set((state) => {
                if (state.userId === id) return {};

                // User changed! Reset ALL filters
                return {
                    userId: id,
                    activeFilters: [],
                    channelFilters: {}, // Clear all channel presets
                    currentChannelId: null,
                    selectedChannel: null,
                    searchQuery: ''
                };
            }),

            setSearchQuery: (query) => set({ searchQuery: query }),
            setSelectedChannel: (channel) => set({ selectedChannel: channel }),
            setHomeSortBy: (sort) => set({ homeSortBy: sort }),

            addFilter: (filter) => {
                const newFilter = { ...filter, id: crypto.randomUUID() };
                set((state) => {
                    const newFilters = [...state.activeFilters, newFilter];
                    // Also update the stored filters for current channel immediately
                    const newChannelFilters = state.currentChannelId
                        ? { ...state.channelFilters, [state.currentChannelId]: newFilters }
                        : state.channelFilters;

                    return {
                        activeFilters: newFilters,
                        channelFilters: newChannelFilters
                    };
                });
            },
            removeFilter: (id) => set((state) => {
                const newFilters = state.activeFilters.filter((f) => f.id !== id);
                const newChannelFilters = state.currentChannelId
                    ? { ...state.channelFilters, [state.currentChannelId]: newFilters }
                    : state.channelFilters;
                return {
                    activeFilters: newFilters,
                    channelFilters: newChannelFilters
                };
            }),
            updateFilter: (id, updates) => set((state) => {
                const newFilters = state.activeFilters.map((f) => f.id === id ? { ...f, ...updates } : f);
                const newChannelFilters = state.currentChannelId
                    ? { ...state.channelFilters, [state.currentChannelId]: newFilters }
                    : state.channelFilters;
                return {
                    activeFilters: newFilters,
                    channelFilters: newChannelFilters
                };
            }),
            clearFilters: () => set((state) => {
                const newChannelFilters = state.currentChannelId
                    ? { ...state.channelFilters, [state.currentChannelId]: [] }
                    : state.channelFilters;
                return {
                    activeFilters: [],
                    channelFilters: newChannelFilters
                };
            }),

            switchChannel: (channelId) => set((state) => {
                // If we are already on this channel, do nothing
                if (state.currentChannelId === channelId) {
                    return {};
                }

                // Save current filters to the old channel ID if it exists AND we have filters
                const updatedChannelFilters = { ...state.channelFilters };
                if (state.currentChannelId && state.activeFilters.length > 0) {
                    updatedChannelFilters[state.currentChannelId] = state.activeFilters;
                }

                // Load filters for the new channel
                const newFilters = (channelId && updatedChannelFilters[channelId]) || [];

                return {
                    currentChannelId: channelId,
                    channelFilters: updatedChannelFilters,
                    activeFilters: newFilters,
                    // Reset legacy selectedChannel filter when switching app channels
                    selectedChannel: null
                };
            })
        }),
        {
            name: 'filter-storage',
            partialize: (state) => ({
                homeSortBy: state.homeSortBy,
                activeFilters: state.activeFilters, // Persist current active filters too
                channelFilters: state.channelFilters, // Persist all channel filters
                selectedChannel: state.selectedChannel,
                currentChannelId: state.currentChannelId,
                userId: state.userId
            })
        }
    )
);

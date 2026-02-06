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
    playlistVideoSortBy: 'default' | 'views' | 'date' | 'delta24h' | 'delta7d' | 'delta30d'; // Persistent sort for videos INSIDE a playlist
    playlistsSortBy: 'default' | 'views' | 'updated' | 'created'; // Persistent sort for the LIST of playlists

    activeFilters: FilterItem[];
    channelFilters: Record<string, FilterItem[]>;
    channelPlaylistsSorts: Record<string, 'default' | 'views' | 'updated' | 'created'>; // Per-channel playlist sort settings
    currentChannelId: string | null;

    // Actions
    setSearchQuery: (query: string) => void;
    setSelectedChannel: (channel: string | null) => void;
    setHomeSortBy: (sort: 'default' | 'views' | 'date' | 'recently_added') => void;
    setPlaylistVideoSortBy: (sort: 'default' | 'views' | 'date' | 'delta24h' | 'delta7d' | 'delta30d') => void;
    setPlaylistsSortBy: (sort: 'default' | 'views' | 'updated' | 'created') => void;

    addFilter: (filter: Omit<FilterItem, 'id'>) => void;
    removeFilter: (id: string) => void;
    updateFilter: (id: string, updates: Partial<FilterItem>) => void;
    clearFilters: () => void;

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
            playlistVideoSortBy: 'default',
            playlistsSortBy: 'default',
            activeFilters: [],
            channelFilters: {},
            channelPlaylistsSorts: {},
            currentChannelId: null,
            userId: null,

            setUserId: (id) => set((state) => {
                if (state.userId === id) return {};

                // User changed! Reset ALL filters
                return {
                    userId: id,
                    activeFilters: [],
                    channelFilters: {}, // Clear all channel presets
                    channelPlaylistsSorts: {},
                    currentChannelId: null,
                    selectedChannel: null,
                    searchQuery: ''
                };
            }),

            setSearchQuery: (query) => set({ searchQuery: query }),
            setSelectedChannel: (channel) => set({ selectedChannel: channel }),
            setHomeSortBy: (sort) => set({ homeSortBy: sort }),
            setPlaylistVideoSortBy: (sort) => set({ playlistVideoSortBy: sort }),
            setPlaylistsSortBy: (sort) => set({ playlistsSortBy: sort }),

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

                // Save current filters & sort to the old channel ID if it exists
                const updatedChannelFilters = { ...state.channelFilters };
                const updatedChannelPlaylistsSorts = { ...state.channelPlaylistsSorts };

                if (state.currentChannelId) {
                    if (state.activeFilters.length > 0) {
                        updatedChannelFilters[state.currentChannelId] = state.activeFilters;
                    }
                    updatedChannelPlaylistsSorts[state.currentChannelId] = state.playlistsSortBy;
                }

                // Load filters & sort for the new channel
                const newFilters = (channelId && updatedChannelFilters[channelId]) || [];
                const newPlaylistsSort = (channelId && updatedChannelPlaylistsSorts[channelId]) || 'default';

                return {
                    currentChannelId: channelId,
                    channelFilters: updatedChannelFilters,
                    channelPlaylistsSorts: updatedChannelPlaylistsSorts,
                    activeFilters: newFilters,
                    playlistsSortBy: newPlaylistsSort,
                    // Reset legacy selectedChannel filter when switching app channels
                    selectedChannel: null
                };
            })
        }),
        {
            name: 'filter-storage',
            partialize: (state) => ({
                homeSortBy: state.homeSortBy,
                playlistVideoSortBy: state.playlistVideoSortBy,
                playlistsSortBy: state.playlistsSortBy,
                channelPlaylistsSorts: state.channelPlaylistsSorts,
                activeFilters: state.activeFilters, // Persist current active filters too
                channelFilters: state.channelFilters, // Persist all channel filters
                selectedChannel: state.selectedChannel,
                currentChannelId: state.currentChannelId,
                userId: state.userId
            })
        }
    )
);

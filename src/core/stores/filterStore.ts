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

/** Per-channel snapshot of music page filter state */
export interface ChannelMusicFilters {
    genreFilters: string[];
    tagFilters: string[];
    bpmFilter: [number, number] | null;
}

// Per-page saved filter/sort/channel state
export interface PageFilterState {
    selectedChannel: string | null;
    sortBy: string;
    filters: FilterItem[];
    freshnessMode?: boolean;
}

interface FilterState {
    searchQuery: string;
    selectedChannel: string | null; // Legacy simple filter (can be kept for backward compat or migrated)
    homeSortBy: 'default' | 'views' | 'date' | 'recently_added';
    playlistVideoSortBy: 'default' | 'views' | 'date' | 'delta24h' | 'delta7d' | 'delta30d'; // Persistent sort for videos INSIDE a playlist
    playlistsSortBy: 'default' | 'views' | 'updated' | 'created'; // Persistent sort for the LIST of playlists
    musicSortBy: string; // 'default' or 'tag:CategoryName'
    musicSortAsc: boolean;
    musicGenreFilters: string[];
    musicTagFilters: string[];
    musicBpmFilter: [number, number] | null;

    activeFilters: FilterItem[];
    channelFilters: Record<string, FilterItem[]>;
    channelPlaylistsSorts: Record<string, 'default' | 'views' | 'updated' | 'created'>; // Per-channel playlist sort settings
    channelMusicFilters: Record<string, ChannelMusicFilters>; // Per-channel music filter snapshots
    currentChannelId: string | null;

    // Per-page state persistence (keyed by pageId: 'home', 'playlists-list', 'playlist:{id}')
    pageStates: Record<string, PageFilterState>;

    // Freshness visualization toggle (per-page, persisted)
    freshnessMode: boolean;
    setFreshnessMode: (enabled: boolean) => void;

    // Actions
    setSearchQuery: (query: string) => void;
    setSelectedChannel: (channel: string | null) => void;
    setHomeSortBy: (sort: 'default' | 'views' | 'date' | 'recently_added') => void;
    setPlaylistVideoSortBy: (sort: 'default' | 'views' | 'date' | 'delta24h' | 'delta7d' | 'delta30d') => void;
    setPlaylistsSortBy: (sort: 'default' | 'views' | 'updated' | 'created') => void;
    setMusicSortBy: (sort: string) => void;
    setMusicSortAsc: (asc: boolean) => void;
    toggleMusicGenreFilter: (genreId: string) => void;
    toggleMusicTagFilter: (tagId: string) => void;
    setMusicBpmFilter: (range: [number, number] | null) => void;
    clearMusicFilters: () => void;

    addFilter: (filter: Omit<FilterItem, 'id'>) => void;
    removeFilter: (id: string) => void;
    updateFilter: (id: string, updates: Partial<FilterItem>) => void;
    clearFilters: () => void;

    // Per-page state save/load
    savePageState: (pageId: string) => void;
    loadPageState: (pageId: string) => void;

    // New action to handle channel switching
    switchChannel: (channelId: string | null) => void;

    // Auth State
    userId: string | null;
    setUserId: (id: string | null) => void;
}

import { persist } from 'zustand/middleware';

export const useFilterStore = create<FilterState>()(
    persist(
        (set, get) => ({
            searchQuery: '',
            selectedChannel: null,
            homeSortBy: 'default',
            playlistVideoSortBy: 'default',
            playlistsSortBy: 'default',
            musicSortBy: 'default',
            musicSortAsc: true,
            musicGenreFilters: [],
            musicTagFilters: [],
            musicBpmFilter: null,
            freshnessMode: false,
            activeFilters: [],
            channelFilters: {},
            channelPlaylistsSorts: {},
            channelMusicFilters: {},
            pageStates: {},
            currentChannelId: null,
            userId: null,

            setUserId: (id) => set((state) => {
                if (state.userId === id) return {};

                // User changed! Reset ALL filters
                return {
                    userId: id,
                    activeFilters: [],
                    channelFilters: {},
                    channelPlaylistsSorts: {},
                    channelMusicFilters: {},
                    pageStates: {},
                    currentChannelId: null,
                    selectedChannel: null,
                    searchQuery: '',
                    musicGenreFilters: [],
                    musicTagFilters: [],
                    musicBpmFilter: null,
                };
            }),

            setSearchQuery: (query) => set({ searchQuery: query }),
            setSelectedChannel: (channel) => set({ selectedChannel: channel }),
            setHomeSortBy: (sort) => set({ homeSortBy: sort }),
            setPlaylistVideoSortBy: (sort) => set({ playlistVideoSortBy: sort }),
            setPlaylistsSortBy: (sort) => set({ playlistsSortBy: sort }),
            setMusicSortBy: (sort) => set({ musicSortBy: sort }),
            setMusicSortAsc: (asc) => set({ musicSortAsc: asc }),

            toggleMusicGenreFilter: (genreId) => set((state) => {
                const exists = state.musicGenreFilters.includes(genreId);
                const nextGenreFilters = exists
                    ? state.musicGenreFilters.filter((g) => g !== genreId)
                    : [...state.musicGenreFilters, genreId];
                const channelMusicFilters = state.currentChannelId
                    ? { ...state.channelMusicFilters, [state.currentChannelId]: { genreFilters: nextGenreFilters, tagFilters: state.musicTagFilters, bpmFilter: state.musicBpmFilter } }
                    : state.channelMusicFilters;
                return { musicGenreFilters: nextGenreFilters, channelMusicFilters };
            }),
            toggleMusicTagFilter: (tagId) => set((state) => {
                const exists = state.musicTagFilters.includes(tagId);
                const nextTagFilters = exists
                    ? state.musicTagFilters.filter((t) => t !== tagId)
                    : [...state.musicTagFilters, tagId];
                const channelMusicFilters = state.currentChannelId
                    ? { ...state.channelMusicFilters, [state.currentChannelId]: { genreFilters: state.musicGenreFilters, tagFilters: nextTagFilters, bpmFilter: state.musicBpmFilter } }
                    : state.channelMusicFilters;
                return { musicTagFilters: nextTagFilters, channelMusicFilters };
            }),
            setMusicBpmFilter: (range) => set((state) => {
                const channelMusicFilters = state.currentChannelId
                    ? { ...state.channelMusicFilters, [state.currentChannelId]: { genreFilters: state.musicGenreFilters, tagFilters: state.musicTagFilters, bpmFilter: range } }
                    : state.channelMusicFilters;
                return { musicBpmFilter: range, channelMusicFilters };
            }),
            clearMusicFilters: () => set((state) => {
                const channelMusicFilters = state.currentChannelId
                    ? { ...state.channelMusicFilters, [state.currentChannelId]: { genreFilters: [], tagFilters: [], bpmFilter: null } }
                    : state.channelMusicFilters;
                return { musicGenreFilters: [], musicTagFilters: [], musicBpmFilter: null, channelMusicFilters };
            }),
            setFreshnessMode: (enabled) => set({ freshnessMode: enabled }),

            // Per-page state: snapshot current state into pageStates[pageId]
            savePageState: (pageId: string) => {
                const state = get();
                // Determine which sort key to save based on pageId
                let sortBy: string;
                if (pageId === 'home') sortBy = state.homeSortBy;
                else if (pageId === 'playlists-list') sortBy = state.playlistsSortBy;
                else sortBy = state.playlistVideoSortBy; // playlist:{id}

                set({
                    pageStates: {
                        ...state.pageStates,
                        [pageId]: {
                            selectedChannel: state.selectedChannel,
                            sortBy,
                            filters: state.activeFilters,
                            freshnessMode: state.freshnessMode,
                        }
                    }
                });
            },

            // Per-page state: restore saved state from pageStates[pageId] into current fields
            loadPageState: (pageId: string) => {
                const state = get();
                const saved = state.pageStates[pageId];

                if (!saved) {
                    // No saved state — reset to defaults
                    const defaults: Partial<FilterState> = {
                        selectedChannel: null,
                        activeFilters: [],
                        freshnessMode: false,
                    };
                    if (pageId === 'home') defaults.homeSortBy = 'default';
                    else if (pageId === 'playlists-list') defaults.playlistsSortBy = 'default';
                    else defaults.playlistVideoSortBy = 'default';
                    set(defaults);
                    return;
                }

                // Restore saved state
                const restored: Partial<FilterState> = {
                    selectedChannel: saved.selectedChannel,
                    activeFilters: saved.filters,
                    freshnessMode: saved.freshnessMode ?? false,
                };
                if (pageId === 'home') restored.homeSortBy = saved.sortBy as FilterState['homeSortBy'];
                else if (pageId === 'playlists-list') restored.playlistsSortBy = saved.sortBy as FilterState['playlistsSortBy'];
                else restored.playlistVideoSortBy = saved.sortBy as FilterState['playlistVideoSortBy'];
                set(restored);
            },

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
                const updatedChannelMusicFilters = { ...state.channelMusicFilters };

                if (state.currentChannelId) {
                    if (state.activeFilters.length > 0) {
                        updatedChannelFilters[state.currentChannelId] = state.activeFilters;
                    }
                    updatedChannelPlaylistsSorts[state.currentChannelId] = state.playlistsSortBy;
                    // Always save music filters snapshot (even if all empty — that IS the desired state)
                    updatedChannelMusicFilters[state.currentChannelId] = {
                        genreFilters: state.musicGenreFilters,
                        tagFilters: state.musicTagFilters,
                        bpmFilter: state.musicBpmFilter,
                    };
                }

                // Load filters & sort for the new channel
                const newFilters = (channelId && updatedChannelFilters[channelId]) || [];
                const newPlaylistsSort = (channelId && updatedChannelPlaylistsSorts[channelId]) || 'default';
                const newMusicFilters: ChannelMusicFilters | null = channelId ? (updatedChannelMusicFilters[channelId] ?? null) : null;

                return {
                    currentChannelId: channelId,
                    channelFilters: updatedChannelFilters,
                    channelPlaylistsSorts: updatedChannelPlaylistsSorts,
                    channelMusicFilters: updatedChannelMusicFilters,
                    activeFilters: newFilters,
                    playlistsSortBy: newPlaylistsSort,
                    // Restore music filters for new channel, or reset to empty
                    musicGenreFilters: newMusicFilters?.genreFilters ?? [],
                    musicTagFilters: newMusicFilters?.tagFilters ?? [],
                    musicBpmFilter: newMusicFilters?.bpmFilter ?? null,
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
                musicSortBy: state.musicSortBy,
                musicSortAsc: state.musicSortAsc,
                musicGenreFilters: state.musicGenreFilters,
                musicTagFilters: state.musicTagFilters,
                musicBpmFilter: state.musicBpmFilter,
                channelPlaylistsSorts: state.channelPlaylistsSorts,
                channelMusicFilters: state.channelMusicFilters,
                activeFilters: state.activeFilters,
                channelFilters: state.channelFilters,
                pageStates: state.pageStates,
                selectedChannel: state.selectedChannel,
                currentChannelId: state.currentChannelId,
                userId: state.userId
            })
        }
    )
);

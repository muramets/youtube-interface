import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendChannel, TrendNiche, TimelineConfig, TrendVideo } from '../types/trends';
import type { FilterOperator } from './filterStore';

// Trends-specific filter item (date, views, percentile)
export interface TrendsFilterItem {
    id: string;
    type: 'date' | 'views' | 'percentile';
    operator: FilterOperator;
    value: any;
    label: string;
}

// Available percentile groups
export const PERCENTILE_GROUPS = [
    'Top 1%',
    'Top 5%',
    'Top 20%',
    'Middle 60%',
    'Bottom 20%'
] as const;

export type PercentileGroup = typeof PERCENTILE_GROUPS[number];

const DEFAULT_TIMELINE_CONFIG: TimelineConfig = {
    zoomLevel: 1,
    offsetX: 0,
    offsetY: 0,
    isCustomView: false,
    startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // Default last 30 days
    endDate: Date.now(),
    viewMode: 'per-channel',
    scalingMode: 'log',
    verticalSpread: 1.0, // Default 1.0 (Fit), range 0.0 to 1.0
    timeLinearity: 1.0 // Default 1.0 (Compact)
};

interface TrendStore {
    // Data
    channels: TrendChannel[];
    niches: TrendNiche[];

    // UI State
    timelineConfig: TimelineConfig;
    filterMode: 'global' | 'filtered';
    savedConfigs: Record<string, TimelineConfig>; // Keyed by channelId or 'global'
    activeNicheId: string | null; // Filter by niche
    selectedChannelId: string | null; // null = Trends Overview, else = Single Channel View
    selectedVideo: TrendVideo | null; // For floating bar
    hoveredVideo: TrendVideo | null; // For tooltip
    isAddChannelModalOpen: boolean;
    isLoadingChannels: boolean; // Loading state for channels list
    trendsFilters: TrendsFilterItem[]; // Filters for trends page

    // Actions
    setChannels: (channels: TrendChannel[]) => void;
    updateChannel: (id: string, updates: Partial<TrendChannel>) => void;
    setNiches: (niches: TrendNiche[]) => void;
    setTimelineConfig: (config: Partial<TimelineConfig>) => void;
    setActiveNicheId: (id: string | null) => void;
    setSelectedChannelId: (id: string | null) => void;
    setSelectedVideo: (video: TrendVideo | null) => void;
    setHoveredVideo: (video: TrendVideo | null) => void;
    setAddChannelModalOpen: (isOpen: boolean) => void;
    setIsLoadingChannels: (isLoading: boolean) => void;
    setFilterMode: (mode: 'global' | 'filtered') => void;

    // Trends filter actions
    addTrendsFilter: (filter: Omit<TrendsFilterItem, 'id'>) => void;
    removeTrendsFilter: (id: string) => void;
    clearTrendsFilters: () => void;

    // Helpers
    toggleChannelVisibility: (id: string) => void;
}

export const useTrendStore = create<TrendStore>()(
    persist(
        (set) => ({
            channels: [],
            niches: [],

            timelineConfig: { ...DEFAULT_TIMELINE_CONFIG },
            filterMode: 'global', // Default to global Scaling
            savedConfigs: {},

            activeNicheId: null,
            selectedChannelId: null,
            selectedVideo: null,
            hoveredVideo: null,
            isAddChannelModalOpen: false,
            isLoadingChannels: true, // Start as loading
            trendsFilters: [],

            setChannels: (channels) => set({ channels }),

            updateChannel: (id, updates) => set((state) => ({
                channels: state.channels.map(c => c.id === id ? { ...c, ...updates } : c)
            })),

            setNiches: (niches) => set({ niches }),

            setTimelineConfig: (config) => set((state) => ({
                timelineConfig: { ...state.timelineConfig, ...config }
            })),

            setActiveNicheId: (id) => set({ activeNicheId: id }),

            setSelectedChannelId: (id) => set((state) => {
                // Save current config
                const currentKey = state.selectedChannelId || 'global';
                const nextKey = id || 'global';

                const updatedSavedConfigs = {
                    ...state.savedConfigs,
                    [currentKey]: state.timelineConfig
                };

                // Load next config or default
                // Ensure we clone the default to avoid mutation issues
                const nextConfig = updatedSavedConfigs[nextKey] || { ...DEFAULT_TIMELINE_CONFIG };

                return {
                    selectedChannelId: id,
                    savedConfigs: updatedSavedConfigs,
                    timelineConfig: nextConfig
                };
            }),

            setSelectedVideo: (video) => set({ selectedVideo: video }),

            setHoveredVideo: (video) => set({ hoveredVideo: video }),

            setAddChannelModalOpen: (isOpen) => set({ isAddChannelModalOpen: isOpen }),

            setIsLoadingChannels: (isLoading) => set({ isLoadingChannels: isLoading }),
            setFilterMode: (mode) => set({ filterMode: mode }),

            addTrendsFilter: (filter) => set((state) => ({
                trendsFilters: [...state.trendsFilters, { ...filter, id: crypto.randomUUID() }]
            })),

            removeTrendsFilter: (id) => set((state) => ({
                trendsFilters: state.trendsFilters.filter((f) => f.id !== id)
            })),

            clearTrendsFilters: () => set({ trendsFilters: [] }),

            toggleChannelVisibility: (id) => set((state) => ({
                channels: state.channels.map(c =>
                    c.id === id ? { ...c, isVisible: !c.isVisible } : c
                )
            }))
        }),
        {
            name: 'trend-store',
            partialize: (state) => ({
                timelineConfig: state.timelineConfig,
                savedConfigs: state.savedConfigs,
                selectedChannelId: state.selectedChannelId
            }),
        }
    )
);

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
    videoNicheAssignments: Record<string, string>; // videoId -> nicheId assignment overrides

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

    // Niche Actions
    addNiche: (niche: Omit<TrendNiche, 'createdAt' | 'viewCount'>) => void;
    updateNiche: (id: string, updates: Partial<TrendNiche>) => void;
    deleteNiche: (id: string) => void;
    assignVideoToNiche: (videoId: string, nicheId: string) => void;
    removeVideoFromNiche: (videoId: string) => void;

    // Helpers
    toggleChannelVisibility: (id: string) => void;
}

export const useTrendStore = create<TrendStore>()(
    persist(
        (set) => ({
            channels: [],
            niches: [],
            videoNicheAssignments: {},

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
            })),

            // Niche Actions
            addNiche: (niche) => set((state) => ({
                niches: [...state.niches, {
                    ...niche,
                    viewCount: 0,
                    createdAt: Date.now()
                }]
            })),

            updateNiche: (id, updates) => set((state) => ({
                niches: state.niches.map(n => n.id === id ? { ...n, ...updates } : n)
            })),

            deleteNiche: (id) => set((state) => {
                // Also remove assignments for this niche
                const newAssignments = { ...state.videoNicheAssignments };
                Object.keys(newAssignments).forEach(vid => {
                    if (newAssignments[vid] === id) {
                        delete newAssignments[vid];
                    }
                });
                return {
                    niches: state.niches.filter(n => n.id !== id),
                    videoNicheAssignments: newAssignments
                };
            }),

            assignVideoToNiche: (videoId, nicheId) => set((state) => ({
                videoNicheAssignments: {
                    ...state.videoNicheAssignments,
                    [videoId]: nicheId
                }
            })),

            removeVideoFromNiche: (videoId) => set((state) => {
                const newAssignments = { ...state.videoNicheAssignments };
                delete newAssignments[videoId];
                return { videoNicheAssignments: newAssignments };
            }),
        }),
        {
            name: 'trend-store',
            partialize: (state) => ({
                timelineConfig: state.timelineConfig,
                savedConfigs: state.savedConfigs,
                selectedChannelId: state.selectedChannelId,
                niches: state.niches,
                videoNicheAssignments: state.videoNicheAssignments
            }),
        }
    )
);

// Helper to generate premium colors
export const generateNicheColor = (existingColors: string[]): string => {
    const PREMIUM_PALETTE = [
        '#6366F1', // Indigo
        '#8B5CF6', // Violet
        '#EC4899', // Pink
        '#F43F5E', // Rose
        '#F97316', // Orange
        '#F59E0B', // Amber
        '#10B981', // Emerald
        '#06B6D4', // Cyan
        '#3B82F6', // Blue
        '#A855F7', // Purple
    ];

    // Simple round-robin or random avoiding recent
    const lastColor = existingColors[existingColors.length - 1];
    let candidate = PREMIUM_PALETTE[existingColors.length % PREMIUM_PALETTE.length];

    if (candidate === lastColor) {
        candidate = PREMIUM_PALETTE[(existingColors.length + 1) % PREMIUM_PALETTE.length];
    }

    return candidate;
};

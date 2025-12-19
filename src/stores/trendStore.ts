import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrendChannel, TrendNiche, TimelineConfig, TrendVideo } from '../types/trends';
import type { FilterOperator } from './filterStore';
import { TrendService } from '../services/trendService';
import { useChannelStore } from './channelStore';

// Trends-specific filter item (date, views, percentile)
export interface TrendsFilterItem {
    id: string;
    type: 'date' | 'views' | 'percentile' | 'niche';
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

export interface HiddenVideo {
    id: string;
    channelId: string;
    hiddenAt: number;
}

interface TrendStore {
    // Data
    userId: string | null;
    videos: TrendVideo[];
    channels: TrendChannel[];
    niches: TrendNiche[];
    videoNicheAssignments: Record<string, { nicheId: string; addedAt: number }[]>; // videoId -> array of niche assignments with timestamps
    channelFilters: Record<string, TrendsFilterItem[]>;
    channelRootFilters: Record<string, TrendsFilterItem[]>; // Stashed filters for channel root
    nicheFilters: Record<string, TrendsFilterItem[]>; // Stashed filters for specific niches (nicheId -> filters)
    hiddenVideos: HiddenVideo[]; // Videos moved to trash

    // UI State
    timelineConfig: TimelineConfig;
    filterMode: 'global' | 'filtered';
    savedConfigs: Record<string, TimelineConfig>; // Keyed by channelId or 'global'
    selectedChannelId: string | null; // null = Trends Overview, else = Single Channel View
    selectedVideo: TrendVideo | null; // For floating bar
    hoveredVideo: TrendVideo | null; // For tooltip
    isAddChannelModalOpen: boolean;
    isLoadingChannels: boolean; // Loading state for channels list
    trendsFilters: TrendsFilterItem[]; // Filters for trends page

    // Actions
    setUserId: (id: string | null) => void;
    setVideos: (videos: TrendVideo[]) => void;
    setChannels: (channels: TrendChannel[]) => void;
    updateChannel: (id: string, updates: Partial<TrendChannel>) => void;
    setNiches: (niches: TrendNiche[]) => void;
    setVideoNicheAssignments: (assignments: Record<string, { nicheId: string; addedAt: number }[]>) => void;
    setTimelineConfig: (config: Partial<TimelineConfig>) => void;
    setHiddenVideos: (hidden: HiddenVideo[]) => void;
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
    setTrendsFilters: (filters: TrendsFilterItem[]) => void;
    setChannelRootFilters: (channelId: string, filters: TrendsFilterItem[]) => void;
    setNicheFilters: (nicheId: string, filters: TrendsFilterItem[]) => void;

    // Niche Actions
    addNiche: (niche: Omit<TrendNiche, 'createdAt' | 'viewCount'>) => Promise<void>;
    updateNiche: (id: string, updates: Partial<TrendNiche>) => Promise<void>;
    deleteNiche: (id: string) => Promise<void>;
    assignVideoToNiche: (videoId: string, nicheId: string, viewCount: number) => Promise<void>;
    removeVideoFromNiche: (videoId: string, nicheId: string, viewCount: number) => Promise<void>;

    // Hidden Videos Actions
    hideVideos: (videos: { id: string; channelId: string }[]) => void;
    restoreVideos: (ids: string[]) => void;

    // Helpers
    toggleChannelVisibility: (id: string) => void;
}

export const useTrendStore = create<TrendStore>()(
    persist(
        (set, get) => ({
            userId: null,
            videos: [],
            channels: [],
            niches: [],
            videoNicheAssignments: {},
            channelFilters: {},
            channelRootFilters: {},
            nicheFilters: {},
            hiddenVideos: [],

            timelineConfig: { ...DEFAULT_TIMELINE_CONFIG },
            filterMode: 'global', // Default to global Scaling
            savedConfigs: {},

            selectedChannelId: null,
            selectedVideo: null,
            hoveredVideo: null,
            isAddChannelModalOpen: false,
            isLoadingChannels: true, // Start as loading
            trendsFilters: [],

            setUserId: (id) => set((state) => {
                if (state.userId === id) return {};

                // User changed! Reset sensitive state to default
                return {
                    userId: id,
                    trendsFilters: [],
                    channelFilters: {},
                    channelRootFilters: {},
                    nicheFilters: {},
                    hiddenVideos: [], // Reset hidden videos too
                    filterMode: 'global',
                    savedConfigs: {},
                    selectedChannelId: null,
                    timelineConfig: { ...DEFAULT_TIMELINE_CONFIG }
                };
            }),

            setVideos: (videos) => set({ videos }),

            setChannels: (channels) => set({ channels }),

            updateChannel: (id, updates) => set((state) => ({
                channels: state.channels.map(c => c.id === id ? { ...c, ...updates } : c)
            })),

            setNiches: (niches) => set({ niches }),

            setVideoNicheAssignments: (videoNicheAssignments) => set({ videoNicheAssignments }),

            setTimelineConfig: (config) => set((state) => ({
                timelineConfig: { ...state.timelineConfig, ...config }
            })),

            setHiddenVideos: (hiddenVideos) => set({ hiddenVideos }),
            setSelectedChannelId: (id) => set((state) => {
                // Save current config
                const currentKey = state.selectedChannelId || 'global';
                const nextKey = id || 'global';

                const updatedSavedConfigs = {
                    ...state.savedConfigs,
                    [currentKey]: state.timelineConfig
                };

                // Save current filters
                const updatedChannelFilters = {
                    ...state.channelFilters,
                    [currentKey]: state.trendsFilters
                };

                // Load next config or default
                // Ensure we clone the default to avoid mutation issues
                const nextConfig = updatedSavedConfigs[nextKey] || { ...DEFAULT_TIMELINE_CONFIG };

                // Load next filters or default
                const nextFilters = updatedChannelFilters[nextKey] || [];

                return {
                    selectedChannelId: id,
                    savedConfigs: updatedSavedConfigs,
                    channelFilters: updatedChannelFilters,
                    timelineConfig: nextConfig,
                    trendsFilters: nextFilters
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

            setTrendsFilters: (filters) => set({ trendsFilters: filters }),

            setChannelRootFilters: (channelId, filters) => set((state) => ({
                channelRootFilters: {
                    ...state.channelRootFilters,
                    [channelId]: filters
                }
            })),

            setNicheFilters: (nicheId, filters) => set((state) => ({
                nicheFilters: {
                    ...state.nicheFilters,
                    [nicheId]: filters
                }
            })),

            toggleChannelVisibility: (id) => set((state) => ({
                channels: state.channels.map(c =>
                    c.id === id ? { ...c, isVisible: !c.isVisible } : c
                )
            })),

            // Niche Actions (now with optimistic updates)
            addNiche: async (niche) => {
                const { userId, niches } = get();
                const userChannelId = useChannelStore.getState().currentChannel?.id;
                if (!userId || !userChannelId) return;

                // Optimistic Update
                const fullNiche: TrendNiche = {
                    ...niche,
                    id: niche.id || crypto.randomUUID(),
                    viewCount: 0,
                    createdAt: Date.now()
                };
                set({ niches: [...niches, fullNiche] });

                await TrendService.addNiche(userId, userChannelId, niche);
            },

            updateNiche: async (id, updates) => {
                const { userId, niches } = get();
                const userChannelId = useChannelStore.getState().currentChannel?.id;
                if (!userId || !userChannelId) return;

                // Optimistic Update
                set({
                    niches: niches.map(n => n.id === id ? { ...n, ...updates } : n)
                });

                await TrendService.updateNiche(userId, userChannelId, id, updates);
            },

            deleteNiche: async (id) => {
                const { userId, niches } = get();
                const userChannelId = useChannelStore.getState().currentChannel?.id;
                if (!userId || !userChannelId) return;

                // Optimistic Update
                set({
                    niches: niches.filter(n => n.id !== id)
                });

                await TrendService.deleteNiche(userId, userChannelId, id);
            },

            assignVideoToNiche: async (videoId, nicheId, viewCount) => {
                const { userId, videoNicheAssignments } = get();
                const userChannelId = useChannelStore.getState().currentChannel?.id;
                if (!userId || !userChannelId) return;

                // Optimistic Update
                const current = videoNicheAssignments[videoId] || [];
                if (!current.some(a => a.nicheId === nicheId)) {
                    set({
                        videoNicheAssignments: {
                            ...videoNicheAssignments,
                            [videoId]: [...current, { nicheId, addedAt: Date.now() }]
                        }
                    });
                }

                await TrendService.assignVideoToNiche(userId, userChannelId, videoId, nicheId, viewCount);
            },

            removeVideoFromNiche: async (videoId, nicheId, viewCount) => {
                const { userId, videoNicheAssignments } = get();
                const userChannelId = useChannelStore.getState().currentChannel?.id;
                if (!userId || !userChannelId) return;

                // Optimistic Update
                const current = videoNicheAssignments[videoId] || [];
                const filtered = current.filter(a => a.nicheId !== nicheId);

                set({
                    videoNicheAssignments: {
                        ...videoNicheAssignments,
                        [videoId]: filtered
                    }
                });

                await TrendService.removeVideoFromNiche(userId, userChannelId, videoId, nicheId, viewCount);
            },

            // Hidden Videos Actions
            hideVideos: async (videos) => {
                const { userId } = get();
                const userChannelId = useChannelStore.getState().currentChannel?.id;
                if (!userId || !userChannelId) return;
                await TrendService.hideVideos(userId, userChannelId, videos);
            },

            restoreVideos: async (ids) => {
                const { userId } = get();
                const userChannelId = useChannelStore.getState().currentChannel?.id;
                if (!userId || !userChannelId) return;
                await TrendService.restoreVideos(userId, userChannelId, ids);
            },
        }),
        {
            name: 'trend-store',
            partialize: (state) => ({
                timelineConfig: state.timelineConfig,
                savedConfigs: state.savedConfigs,
                selectedChannelId: state.selectedChannelId,
                // niches: state.niches, // Moved to Firestore
                // videoNicheAssignments: state.videoNicheAssignments, // Moved to Firestore
                channelFilters: state.channelFilters,
                channelRootFilters: state.channelRootFilters,
                nicheFilters: state.nicheFilters,
                trendsFilters: state.trendsFilters,
                // hiddenVideos: state.hiddenVideos, // Moved to Firestore
                filterMode: state.filterMode,
                userId: state.userId
            }),
        }
    )
);

// Manual Palette for user selection (10 distinct colors)
export const MANUAL_NICHE_PALETTE = [
    '#EF4444',
    '#F97316',
    '#F59E0B',
    '#84CC16',
    '#10B981',
    '#06B6D4',
    '#3B82F6',
    '#6366F1',
    '#8B5CF6',
    '#EC4899',
];

// Auto Palette
const AUTO_NICHE_PALETTE = [
    '#F87171', '#FB923C', '#FBBF24', '#A3E635', '#34D399', '#22D3EE', '#60A5FA', '#818CF8', '#A78BFA', '#F472B6',
    '#B91C1C', '#C2410C', '#B45309', '#4D7C0F', '#047857', '#0E7490', '#1D4ED8', '#4338CA', '#5B21B6', '#BE185D',
    '#991B1B', '#9A3412', '#92400E', '#3F6212', '#065F46', '#155E75', '#1E40AF', '#3730A3', '#4C1D95', '#9D174D',
];

// Helper to generate premium colors
export const generateNicheColor = (existingColors: string[]): string => {
    const available = AUTO_NICHE_PALETTE.filter(c => !existingColors.includes(c));

    if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
    }

    const recent = new Set(existingColors.slice(-5));
    const candidates = AUTO_NICHE_PALETTE.filter(c => !recent.has(c));

    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    return AUTO_NICHE_PALETTE[Math.floor(Math.random() * AUTO_NICHE_PALETTE.length)];
};

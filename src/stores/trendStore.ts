import { create } from 'zustand';
import type { TrendChannel, TrendNiche, TimelineConfig, TrendVideo } from '../types/trends';

interface TrendStore {
    // Data
    channels: TrendChannel[];
    niches: TrendNiche[];

    // UI State
    timelineConfig: TimelineConfig;
    activeNicheId: string | null; // Filter by niche
    selectedChannelId: string | null; // null = Trends Overview, else = Single Channel View
    selectedVideo: TrendVideo | null; // For floating bar
    hoveredVideo: TrendVideo | null; // For tooltip
    isAddChannelModalOpen: boolean;

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

    // Helpers
    toggleChannelVisibility: (id: string) => void;
}

export const useTrendStore = create<TrendStore>((set) => ({
    channels: [],
    niches: [],

    timelineConfig: {
        zoomLevel: 1,
        startDate: Date.now() - 30 * 24 * 60 * 60 * 1000, // Default last 30 days
        endDate: Date.now(),
        viewMode: 'per-channel',
        scalingMode: 'log' // Default to log for less extreme size differences
    },

    activeNicheId: null,
    selectedChannelId: null,
    selectedVideo: null,
    hoveredVideo: null,
    isAddChannelModalOpen: false,

    setChannels: (channels) => set({ channels }),

    updateChannel: (id, updates) => set((state) => ({
        channels: state.channels.map(c => c.id === id ? { ...c, ...updates } : c)
    })),

    setNiches: (niches) => set({ niches }),

    setTimelineConfig: (config) => set((state) => ({
        timelineConfig: { ...state.timelineConfig, ...config }
    })),

    setActiveNicheId: (id) => set({ activeNicheId: id }),

    setSelectedChannelId: (id) => set({ selectedChannelId: id }),

    setSelectedVideo: (video) => set({ selectedVideo: video }),

    setHoveredVideo: (video) => set({ hoveredVideo: video }),

    setAddChannelModalOpen: (isOpen) => set({ isAddChannelModalOpen: isOpen }),

    toggleChannelVisibility: (id) => set((state) => ({
        channels: state.channels.map(c =>
            c.id === id ? { ...c, isVisible: !c.isVisible } : c
        )
    }))
}));

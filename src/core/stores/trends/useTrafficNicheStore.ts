import { create } from 'zustand';
import { TrafficNicheService } from '../../services/TrafficNicheService';
import type { SuggestedTrafficNiche, TrafficNicheAssignment } from '../../types/suggestedTrafficNiches';
import { generateNicheColor } from './trendStore'; // Reusing color generator

interface TrafficNicheState {
    niches: SuggestedTrafficNiche[];
    assignments: TrafficNicheAssignment[];
    isLoading: boolean;

    // Subscriptions
    unsubscribeNiches: () => void;
    unsubscribeAssignments: () => void;

    // Actions
    initializeSubscriptions: (userId: string, channelId: string) => void;
    cleanup: () => void;

    addTrafficNiche: (niche: Omit<SuggestedTrafficNiche, 'createdAt' | 'color'> & { color?: string }, userId: string, channelId: string) => Promise<void>;
    updateTrafficNiche: (nicheId: string, updates: Partial<SuggestedTrafficNiche>, userId: string, channelId: string) => Promise<void>;
    deleteTrafficNiche: (nicheId: string, userId: string, channelId: string) => Promise<void>;

    assignVideoToTrafficNiche: (videoId: string, nicheId: string, userId: string, channelId: string) => Promise<void>;
    removeVideoFromTrafficNiche: (videoId: string, nicheId: string, userId: string, channelId: string) => Promise<void>;

    // Helpers
    getVideoAssignments: (videoId: string) => TrafficNicheAssignment[];
}

export const useTrafficNicheStore = create<TrafficNicheState>((set, get) => ({
    niches: [],
    assignments: [],
    isLoading: false,
    unsubscribeNiches: () => { },
    unsubscribeAssignments: () => { },

    initializeSubscriptions: (userId: string, channelId: string) => {
        // Cleanup previous if any (though usually component unmount handles this via cleanup)
        get().cleanup();

        set({ isLoading: true });

        const unsubNiches = TrafficNicheService.subscribeToTrafficNiches(userId, channelId, (niches) => {
            set({ niches });
            // If assignments also loaded, stop loading. Simplified logic: stop loading when at least niches return.
            set({ isLoading: false });
        });

        const unsubAssignments = TrafficNicheService.subscribeToTrafficAssignments(userId, channelId, (assignments) => {
            set({ assignments });
        });

        set({
            unsubscribeNiches: unsubNiches,
            unsubscribeAssignments: unsubAssignments
        });
    },

    cleanup: () => {
        get().unsubscribeNiches();
        get().unsubscribeAssignments();
        set({
            niches: [],
            assignments: [],
            isLoading: false,
            unsubscribeNiches: () => { },
            unsubscribeAssignments: () => { }
        });
    },

    addTrafficNiche: async (nicheData, userId, channelId) => {
        const existingColors = get().niches.map(n => n.color);
        const color = nicheData.color || generateNicheColor(existingColors);

        const newNiche: Omit<SuggestedTrafficNiche, 'createdAt'> = {
            ...nicheData,
            color
        };
        await TrafficNicheService.addTrafficNiche(userId, channelId, newNiche);
    },

    updateTrafficNiche: async (nicheId, updates, userId, channelId) => {
        await TrafficNicheService.updateTrafficNiche(userId, channelId, nicheId, updates);
    },

    deleteTrafficNiche: async (nicheId, userId, channelId) => {
        await TrafficNicheService.deleteTrafficNiche(userId, channelId, nicheId, get().assignments);
    },

    assignVideoToTrafficNiche: async (videoId, nicheId, userId, channelId) => {
        await TrafficNicheService.assignVideoToTrafficNiche(userId, channelId, videoId, nicheId);
    },

    removeVideoFromTrafficNiche: async (videoId, nicheId, userId, channelId) => {
        await TrafficNicheService.removeVideoFromTrafficNiche(userId, channelId, videoId, nicheId);
    },

    getVideoAssignments: (videoId: string) => {
        return get().assignments.filter(a => a.videoId === videoId);
    }
}));

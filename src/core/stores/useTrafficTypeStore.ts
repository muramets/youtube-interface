import { create } from 'zustand';
import { TrafficTypeService } from '../services/TrafficTypeService';
import type { TrafficType } from '../types/videoTrafficType';

interface TrafficTypeState {
    // Map of sourceVideoId -> TrafficType information for O(1) lookup
    edges: Record<string, { type: TrafficType; source?: 'manual' | 'smart_assistant' }>;
    isLoading: boolean;

    // The current target video we are viewing
    currentTargetVideoId: string | null;

    // Subscription
    unsubscribe: () => void;

    // Actions
    initialize: (targetVideoId: string) => void;
    setTrafficType: (sourceVideoId: string, type: TrafficType, source?: 'manual' | 'smart_assistant') => Promise<void>;
    deleteTrafficType: (sourceVideoId: string) => Promise<void>;
    cleanup: () => void;
}

export const useTrafficTypeStore = create<TrafficTypeState>((set, get) => ({
    edges: {},
    isLoading: false,
    currentTargetVideoId: null,
    unsubscribe: () => { },

    initialize: (targetVideoId: string) => {
        const { currentTargetVideoId, cleanup } = get();

        // Prevent re-subscribing if already on the same video
        if (currentTargetVideoId === targetVideoId) return;

        cleanup(); // Unsubscribe from previous

        set({ isLoading: true, currentTargetVideoId: targetVideoId });

        const unsub = TrafficTypeService.subscribeToEdges(targetVideoId, (newEdges) => {
            // Convert array to map for easy lookup
            const edgesMap: Record<string, { type: TrafficType; source?: 'manual' | 'smart_assistant' }> = {};
            newEdges.forEach(edge => {
                edgesMap[edge.sourceVideoId] = { type: edge.type, source: edge.source };
            });

            set({ edges: edgesMap, isLoading: false });
        });

        set({ unsubscribe: unsub });
    },

    setTrafficType: async (sourceVideoId: string, type: TrafficType, source: 'manual' | 'smart_assistant' = 'manual') => {
        const { currentTargetVideoId, edges } = get();
        if (!currentTargetVideoId) return;

        // Optimistic update
        set({
            edges: { ...edges, [sourceVideoId]: { type, source } }
        });

        try {
            await TrafficTypeService.setEdgeType(currentTargetVideoId, sourceVideoId, type, source);
        } catch (error) {
            console.error('Failed to set traffic type:', error);
            // Revert on error (optional, or just Refetch)
        }
    },

    deleteTrafficType: async (sourceVideoId: string) => {
        const { currentTargetVideoId, edges } = get();
        if (!currentTargetVideoId) return;

        // Optimistic update: remove the key
        const newEdges = { ...edges };
        delete newEdges[sourceVideoId];
        set({ edges: newEdges });

        try {
            await TrafficTypeService.deleteEdgeType(currentTargetVideoId, sourceVideoId);
        } catch (error) {
            console.error('Failed to delete traffic type:', error);
        }
    },

    cleanup: () => {
        get().unsubscribe();
        set({
            edges: {},
            isLoading: false,
            currentTargetVideoId: null,
            unsubscribe: () => { }
        });
    }
}));

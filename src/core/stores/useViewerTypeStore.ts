import { create } from 'zustand';
import { ViewerTypeService } from '../services/ViewerTypeService';
import type { ViewerType } from '../types/viewerType';

interface ViewerTypeState {
    // Map of sourceVideoId -> ViewerType information for O(1) lookup
    edges: Record<string, { type: ViewerType; source?: 'manual' | 'smart_assistant' }>;
    isLoading: boolean;

    // The current target video we are viewing
    currentTargetVideoId: string | null;

    // Subscription
    unsubscribe: () => void;

    // Actions
    initialize: (targetVideoId: string) => void;
    setViewerType: (sourceVideoId: string, type: ViewerType, source?: 'manual' | 'smart_assistant') => Promise<void>;
    setViewerTypes: (updates: Array<{ sourceVideoId: string; type: ViewerType; source: 'manual' | 'smart_assistant' }>) => Promise<void>;
    deleteViewerType: (sourceVideoId: string) => Promise<void>;
    cleanup: () => void;
}

export const useViewerTypeStore = create<ViewerTypeState>((set, get) => ({
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

        const unsub = ViewerTypeService.subscribeToEdges(targetVideoId, (newEdges) => {
            // Convert array to map for easy lookup
            const edgesMap: Record<string, { type: ViewerType; source?: 'manual' | 'smart_assistant' }> = {};
            newEdges.forEach(edge => {
                edgesMap[edge.sourceVideoId] = { type: edge.type, source: edge.source };
            });

            set({ edges: edgesMap, isLoading: false });
        });

        set({ unsubscribe: unsub });
    },

    setViewerType: async (sourceVideoId: string, type: ViewerType, source: 'manual' | 'smart_assistant' = 'manual') => {
        const { currentTargetVideoId, edges } = get();
        if (!currentTargetVideoId) return;

        // Optimistic update
        set({
            edges: { ...edges, [sourceVideoId]: { type, source } }
        });

        try {
            await ViewerTypeService.setEdgeType(currentTargetVideoId, sourceVideoId, type, source);
        } catch (error) {
            console.error('Failed to set viewer type:', error);
        }
    },

    setViewerTypes: async (updates: Array<{ sourceVideoId: string; type: ViewerType; source: 'manual' | 'smart_assistant' }>) => {
        const { currentTargetVideoId, edges } = get();
        if (!currentTargetVideoId || !updates.length) return;

        // Optimistic update
        const newEdges = { ...edges };
        updates.forEach(u => {
            newEdges[u.sourceVideoId] = { type: u.type, source: u.source };
        });
        set({ edges: newEdges });

        try {
            await ViewerTypeService.batchSetEdgeTypes(currentTargetVideoId, updates);
        } catch (error) {
            console.error('Failed to batch set viewer types:', error);
        }
    },

    deleteViewerType: async (sourceVideoId: string) => {
        const { currentTargetVideoId, edges } = get();
        if (!currentTargetVideoId) return;

        // Optimistic update: remove the key
        const newEdges = { ...edges };
        delete newEdges[sourceVideoId];
        set({ edges: newEdges });

        try {
            await ViewerTypeService.deleteEdgeType(currentTargetVideoId, sourceVideoId);
        } catch (error) {
            console.error('Failed to delete viewer type:', error);
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

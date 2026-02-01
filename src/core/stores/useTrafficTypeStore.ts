import { create } from 'zustand';
import { TrafficTypeService } from '../services/TrafficTypeService';
import type { TrafficType } from '../types/videoTrafficType';

interface TrafficTypeState {
    // Map of sourceVideoId -> TrafficType information for O(1) lookup
    edges: Record<string, { type: TrafficType; source?: 'manual' | 'smart_assistant' }>;
    isLoading: boolean;

    // Current context
    currentUserId: string | null;
    currentTargetVideoId: string | null;
    currentSnapshotId: string | null;

    // Subscription
    unsubscribe: () => void;

    // Actions
    initialize: (userId: string, targetVideoId: string, snapshotId: string) => void;
    setTrafficType: (sourceVideoId: string, type: TrafficType, source?: 'manual' | 'smart_assistant') => Promise<void>;
    deleteTrafficType: (sourceVideoId: string) => Promise<void>;
    cleanup: () => void;
}

export const useTrafficTypeStore = create<TrafficTypeState>((set, get) => ({
    edges: {},
    isLoading: false,
    currentUserId: null,
    currentTargetVideoId: null,
    currentSnapshotId: null,
    unsubscribe: () => { },

    initialize: (userId: string, targetVideoId: string, snapshotId: string) => {
        const { currentUserId, currentTargetVideoId, currentSnapshotId, cleanup } = get();

        // Prevent re-subscribing if already on the same context
        if (
            currentUserId === userId &&
            currentTargetVideoId === targetVideoId &&
            currentSnapshotId === snapshotId
        ) {
            return;
        }

        cleanup(); // Unsubscribe from previous

        set({
            isLoading: true,
            currentUserId: userId,
            currentTargetVideoId: targetVideoId,
            currentSnapshotId: snapshotId
        });

        const unsub = TrafficTypeService.subscribeToEdges(
            userId,
            targetVideoId,
            snapshotId,
            (newEdges) => {
                // Convert array to map for easy lookup
                const edgesMap: Record<string, { type: TrafficType; source?: 'manual' | 'smart_assistant' }> = {};
                newEdges.forEach(edge => {
                    edgesMap[edge.sourceVideoId] = { type: edge.type, source: edge.source };
                });

                set({ edges: edgesMap, isLoading: false });
            }
        );

        set({ unsubscribe: unsub });
    },

    setTrafficType: async (sourceVideoId: string, type: TrafficType, source: 'manual' | 'smart_assistant' = 'manual') => {
        const { currentUserId, currentTargetVideoId, currentSnapshotId, edges } = get();
        if (!currentUserId || !currentTargetVideoId || !currentSnapshotId) return;

        // Optimistic update
        set({
            edges: { ...edges, [sourceVideoId]: { type, source } }
        });

        try {
            await TrafficTypeService.setEdgeType(
                currentUserId,
                currentTargetVideoId,
                currentSnapshotId,
                sourceVideoId,
                type,
                source
            );
        } catch (error) {
            console.error('Failed to set traffic type:', error);
            // Revert on error (optional, or just Refetch)
        }
    },

    deleteTrafficType: async (sourceVideoId: string) => {
        const { currentUserId, currentTargetVideoId, currentSnapshotId, edges } = get();
        if (!currentUserId || !currentTargetVideoId || !currentSnapshotId) return;

        // Optimistic update: remove the key
        const newEdges = { ...edges };
        delete newEdges[sourceVideoId];
        set({ edges: newEdges });

        try {
            await TrafficTypeService.deleteEdgeType(
                currentUserId,
                currentTargetVideoId,
                currentSnapshotId,
                sourceVideoId
            );
        } catch (error) {
            console.error('Failed to delete traffic type:', error);
        }
    },

    cleanup: () => {
        get().unsubscribe();
        set({
            edges: {},
            isLoading: false,
            currentUserId: null,
            currentTargetVideoId: null,
            currentSnapshotId: null,
            unsubscribe: () => { }
        });
    }
}));

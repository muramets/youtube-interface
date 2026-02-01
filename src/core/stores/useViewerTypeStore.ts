import { create } from 'zustand';
import { ViewerTypeService } from '../services/ViewerTypeService';
import type { ViewerType } from '../types/viewerType';

interface ViewerTypeState {
    // Map of sourceVideoId -> ViewerType information for O(1) lookup
    edges: Record<string, { type: ViewerType; source?: 'manual' | 'smart_assistant' }>;
    isLoading: boolean;

    // Current context
    currentUserId: string | null;
    currentTargetVideoId: string | null;
    currentSnapshotId: string | null;

    // Subscription
    unsubscribe: () => void;

    // Actions
    initialize: (userId: string, targetVideoId: string, snapshotId: string) => void;
    setViewerType: (sourceVideoId: string, type: ViewerType, source?: 'manual' | 'smart_assistant') => Promise<void>;
    setViewerTypes: (updates: Array<{ sourceVideoId: string; type: ViewerType; source: 'manual' | 'smart_assistant' }>) => Promise<void>;
    deleteViewerType: (sourceVideoId: string) => Promise<void>;
    cleanup: () => void;
}

export const useViewerTypeStore = create<ViewerTypeState>((set, get) => ({
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

        const unsub = ViewerTypeService.subscribeToEdges(
            userId,
            targetVideoId,
            snapshotId,
            (newEdges) => {
                // Convert array to map for easy lookup
                const edgesMap: Record<string, { type: ViewerType; source?: 'manual' | 'smart_assistant' }> = {};
                newEdges.forEach(edge => {
                    edgesMap[edge.sourceVideoId] = { type: edge.type, source: edge.source };
                });

                set({ edges: edgesMap, isLoading: false });
            }
        );

        set({ unsubscribe: unsub });
    },

    setViewerType: async (sourceVideoId: string, type: ViewerType, source: 'manual' | 'smart_assistant' = 'manual') => {
        const { currentUserId, currentTargetVideoId, currentSnapshotId, edges } = get();
        if (!currentUserId || !currentTargetVideoId || !currentSnapshotId) return;

        // Optimistic update
        set({
            edges: { ...edges, [sourceVideoId]: { type, source } }
        });

        try {
            await ViewerTypeService.setEdgeType(
                currentUserId,
                currentTargetVideoId,
                currentSnapshotId,
                sourceVideoId,
                type,
                source
            );
        } catch (error) {
            console.error('Failed to set viewer type:', error);
        }
    },

    setViewerTypes: async (updates: Array<{ sourceVideoId: string; type: ViewerType; source: 'manual' | 'smart_assistant' }>) => {
        const { currentUserId, currentTargetVideoId, currentSnapshotId, edges } = get();
        if (!currentUserId || !currentTargetVideoId || !currentSnapshotId || !updates.length) return;

        // Optimistic update
        const newEdges = { ...edges };
        updates.forEach(u => {
            newEdges[u.sourceVideoId] = { type: u.type, source: u.source };
        });
        set({ edges: newEdges });

        try {
            await ViewerTypeService.batchSetEdgeTypes(
                currentUserId,
                currentTargetVideoId,
                currentSnapshotId,
                updates
            );
        } catch (error) {
            console.error('Failed to batch set viewer types:', error);
        }
    },

    deleteViewerType: async (sourceVideoId: string) => {
        const { currentUserId, currentTargetVideoId, currentSnapshotId, edges } = get();
        if (!currentUserId || !currentTargetVideoId || !currentSnapshotId) return;

        // Optimistic update: remove the key
        const newEdges = { ...edges };
        delete newEdges[sourceVideoId];
        set({ edges: newEdges });

        try {
            await ViewerTypeService.deleteEdgeType(
                currentUserId,
                currentTargetVideoId,
                currentSnapshotId,
                sourceVideoId
            );
        } catch (error) {
            console.error('Failed to delete viewer type:', error);
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

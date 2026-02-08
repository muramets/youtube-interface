import { create } from 'zustand';
import { VideoReactionService } from '../services/VideoReactionService';
import type { VideoReaction, VideoReactionEdge } from '../types/videoReaction';

interface VideoReactionState {
    reactions: VideoReactionEdge[];
    isLoading: boolean;

    // Subscription
    unsubscribe: () => void;

    // Actions
    initializeSubscription: (userId: string, channelId: string) => void;
    cleanup: () => void;

    /**
     * Toggle a reaction for a video.
     * BUSINESS RULE: Same reaction = remove (toggle off), different reaction = replace.
     */
    toggleReaction: (videoId: string, reaction: VideoReaction, userId: string, channelId: string) => Promise<void>;

    // Helpers
    getReaction: (videoId: string) => VideoReaction | undefined;
}

export const useVideoReactionStore = create<VideoReactionState>((set, get) => ({
    reactions: [],
    isLoading: false,
    unsubscribe: () => { },

    initializeSubscription: (userId: string, channelId: string) => {
        // Cleanup previous
        get().cleanup();

        set({ isLoading: true });

        const unsub = VideoReactionService.subscribeToReactions(userId, channelId, (reactions) => {
            set({ reactions, isLoading: false });
        });

        set({ unsubscribe: unsub });
    },

    cleanup: () => {
        get().unsubscribe();
        set({
            reactions: [],
            isLoading: false,
            unsubscribe: () => { }
        });
    },

    toggleReaction: async (videoId, reaction, userId, channelId) => {
        const existing = get().reactions.find(r => r.videoId === videoId);

        if (existing?.reaction === reaction) {
            // Same reaction → remove (toggle off)
            // Optimistic update
            set({ reactions: get().reactions.filter(r => r.videoId !== videoId) });
            // Persist
            await VideoReactionService.deleteReaction(userId, channelId, videoId);
        } else {
            // New or different reaction → upsert
            const newEdge: VideoReactionEdge = { videoId, reaction, updatedAt: Date.now() };

            // Optimistic update
            const existingIndex = get().reactions.findIndex(r => r.videoId === videoId);
            if (existingIndex >= 0) {
                const updated = [...get().reactions];
                updated[existingIndex] = newEdge;
                set({ reactions: updated });
            } else {
                set({ reactions: [...get().reactions, newEdge] });
            }

            // Persist
            await VideoReactionService.setReaction(userId, channelId, videoId, reaction);
        }
    },

    getReaction: (videoId: string) => {
        return get().reactions.find(r => r.videoId === videoId)?.reaction;
    }
}));

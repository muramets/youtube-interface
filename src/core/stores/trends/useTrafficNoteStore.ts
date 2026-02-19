import { create } from 'zustand';
import { TrafficNoteService } from '../../services/TrafficNoteService';
import type { TrafficNote } from '../../types/trafficNote';

interface TrafficNoteState {
    notes: TrafficNote[];
    isLoading: boolean;

    // Subscription
    unsubscribe: () => void;

    // Actions
    initializeSubscription: (userId: string, channelId: string) => void;
    cleanup: () => void;

    setNote: (videoId: string, text: string, userId: string, channelId: string) => Promise<void>;
    deleteNote: (videoId: string, userId: string, channelId: string) => Promise<void>;

    // Helpers
    getNoteForVideo: (videoId: string) => string | undefined;
}

export const useTrafficNoteStore = create<TrafficNoteState>((set, get) => ({
    notes: [],
    isLoading: false,
    unsubscribe: () => { },

    initializeSubscription: (userId: string, channelId: string) => {
        // Cleanup previous
        get().cleanup();

        set({ isLoading: true });

        const unsub = TrafficNoteService.subscribeToNotes(userId, channelId, (notes) => {
            set({ notes, isLoading: false });
        });

        set({ unsubscribe: unsub });
    },

    cleanup: () => {
        get().unsubscribe();
        set({
            notes: [],
            isLoading: false,
            unsubscribe: () => { }
        });
    },

    setNote: async (videoId, text, userId, channelId) => {
        // Optimistic update
        const trimmed = text.trim();
        if (!trimmed) {
            // Empty text → delete
            return get().deleteNote(videoId, userId, channelId);
        }

        const existingNotes = get().notes;
        const existingIndex = existingNotes.findIndex(n => n.videoId === videoId);
        const newNote: TrafficNote = { videoId, text: trimmed, updatedAt: Date.now() };

        if (existingIndex >= 0) {
            const updated = [...existingNotes];
            updated[existingIndex] = newNote;
            set({ notes: updated });
        } else {
            set({ notes: [...existingNotes, newNote] });
        }

        // Persist
        await TrafficNoteService.setNote(userId, channelId, videoId, trimmed);
    },

    deleteNote: async (videoId, userId, channelId) => {
        // Optimistic update
        set({ notes: get().notes.filter(n => n.videoId !== videoId) });

        // Persist
        await TrafficNoteService.deleteNote(userId, channelId, videoId);
    },

    getNoteForVideo: (videoId: string) => {
        return get().notes.find(n => n.videoId === videoId)?.text;
    }
}));

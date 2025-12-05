import { create } from 'zustand';

interface UIState {
    isSettingsOpen: boolean;
    setSettingsOpen: (isOpen: boolean) => void;
    toast: {
        message: string;
        type: 'success' | 'error';
        isVisible: boolean;
    };
    showToast: (message: string, type?: 'success' | 'error') => void;
    hideToast: () => void;

    // Global Modal Control
    activeVideoId: string | null;
    activeTab: 'details' | 'packaging' | 'traffic' | 'stats';
    openVideoModal: (videoId: string, tab?: 'details' | 'packaging' | 'traffic' | 'stats') => void;
    closeVideoModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
    isSettingsOpen: false,
    setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),

    toast: {
        message: '',
        type: 'success',
        isVisible: false
    },
    showToast: (message, type = 'success') => set({ toast: { message, type, isVisible: true } }),
    hideToast: () => set((state) => ({ toast: { ...state.toast, isVisible: false } })),

    activeVideoId: null,
    activeTab: 'details',
    openVideoModal: (videoId, tab = 'details') => set({ activeVideoId: videoId, activeTab: tab }),
    closeVideoModal: () => set({ activeVideoId: null, activeTab: 'details' }),
}));

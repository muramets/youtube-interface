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
}));

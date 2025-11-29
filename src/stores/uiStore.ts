import { create } from 'zustand';

interface UIState {
    isSettingsOpen: boolean;
    setSettingsOpen: (isOpen: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
    isSettingsOpen: false,
    setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
}));

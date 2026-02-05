import { create } from 'zustand';

interface UIState {
    isSettingsOpen: boolean;
    setSettingsOpen: (isOpen: boolean) => void;
    isSidebarExpanded: boolean;
    toggleSidebar: () => void;
    setSidebarExpanded: (isExpanded: boolean) => void;

    sidebarWidth: number;
    setSidebarWidth: (width: number) => void;

    toast: {
        message: string;
        type: 'success' | 'error' | 'loading';
        isVisible: boolean;
        actionLabel?: string;
        onAction?: () => void;
    };
    showToast: (message: string, type?: 'success' | 'error' | 'loading', actionLabel?: string, onAction?: () => void) => void;
    hideToast: () => void;

    // Global Modal Control
    activeVideoId: string | null;
    activeTab: 'details' | 'packaging' | 'traffic' | 'stats';
    openVideoModal: (videoId: string, tab?: 'details' | 'packaging' | 'traffic' | 'stats') => void;
    closeVideoModal: () => void;

    // Video View Modes (Custom vs YouTube view)
    videoViewModes: Record<string, 'custom' | 'youtube'>;
    setVideoViewMode: (videoId: string, mode: 'custom' | 'youtube') => void;
}

import { persist } from 'zustand/middleware';

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            isSettingsOpen: false,
            setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
            isSidebarExpanded: false,
            toggleSidebar: () => set((state) => ({ isSidebarExpanded: !state.isSidebarExpanded })),
            setSidebarExpanded: (isExpanded) => set({ isSidebarExpanded: isExpanded }),

            sidebarWidth: 256,
            setSidebarWidth: (width) => set({ sidebarWidth: width }),

            toast: {
                message: '',
                type: 'success',
                isVisible: false,
                actionLabel: undefined,
                onAction: undefined
            },
            showToast: (message, type = 'success', actionLabel, onAction) => set({
                toast: { message, type, isVisible: true, actionLabel, onAction }
            }),
            hideToast: () => set((state) => ({
                toast: { ...state.toast, isVisible: false, actionLabel: undefined, onAction: undefined }
            })),

            activeVideoId: null,
            activeTab: 'details',
            openVideoModal: (videoId, tab = 'details') => set({ activeVideoId: videoId, activeTab: tab }),
            closeVideoModal: () => set({ activeVideoId: null, activeTab: 'details' }),

            videoViewModes: {},
            setVideoViewMode: (videoId, mode) => set((state) => ({
                videoViewModes: { ...state.videoViewModes, [videoId]: mode }
            })),
        }),
        {
            name: 'ui-storage',
            partialize: (state) => ({
                videoViewModes: state.videoViewModes,
                isSidebarExpanded: state.isSidebarExpanded,
                sidebarWidth: state.sidebarWidth,
            })
        }
    )
);

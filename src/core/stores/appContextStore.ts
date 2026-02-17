// =============================================================================
// App Context Store — Global Page-to-Chat Context Bridge (Zustand)
// =============================================================================
//
// Any page can push context items here (e.g. selected videos on Playlists).
// The chat assistant subscribes and enriches its prompts accordingly.
// Designed to be page-agnostic: the store knows nothing about specific pages.
// =============================================================================

import { create } from 'zustand';
import type { AppContextItem } from '../types/appContext';

interface AppContextState {
    /** Current context items pushed by the active page. */
    items: AppContextItem[];

    /** Replace all context items (used when selection changes). */
    setItems: (items: AppContextItem[]) => void;

    /** Clear all context items (used on page unmount / selection clear). */
    clearItems: () => void;
}

export const useAppContextStore = create<AppContextState>((set) => ({
    items: [],
    setItems: (items) => set({ items }),
    clearItems: () => set({ items: [] }),
}));

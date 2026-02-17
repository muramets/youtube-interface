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

    /** Incremented when items are consumed externally (e.g. sent in a message). */
    version: number;

    /** Replace all context items (used when selection changes). */
    setItems: (items: AppContextItem[]) => void;

    /** Clear all context items (used on page unmount / selection clear). */
    clearItems: () => void;

    /** Clear items AND bump version — signals bridges to re-push if selection is still active. */
    consumeItems: () => void;
}

export const useAppContextStore = create<AppContextState>((set) => ({
    items: [],
    version: 0,
    setItems: (items) => set({ items }),
    clearItems: () => set({ items: [] }),
    consumeItems: () => set((s) => ({ items: [], version: s.version + 1 })),
}));

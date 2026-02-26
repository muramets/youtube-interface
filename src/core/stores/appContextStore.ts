// =============================================================================
// App Context Store — Global Page-to-Chat Context Bridge (Zustand)
// =============================================================================
//
// Source-scoped slots architecture: each context bridge writes to its own slot,
// preventing bridges from overwriting each other's data. All slots are additive —
// they coexist and are merged into a single flat array for the chat prompt.
//
// Slots:
//   'playlist' — selected videos from Playlist/Home pages (useSelectionContextBridge)
//   'traffic'  — selected suggested traffic rows (TrafficTab)
//   'canvas'   — selected nodes on the canvas board (useCanvasContextBridge)
//   'trends'   — selected competitor videos from Trends (useTrendsContextBridge)
// =============================================================================

import { create } from 'zustand';
import type { AppContextItem } from '../types/appContext';
import { debug } from '../utils/debug';

export type ContextSource = 'playlist' | 'traffic' | 'canvas' | 'trends';

const EMPTY_SLOTS: Record<ContextSource, AppContextItem[]> = {
    playlist: [],
    traffic: [],
    canvas: [],
    trends: [],
};

interface AppContextState {
    /** Per-source context slots. Each bridge writes to its own slot only. */
    slots: Record<ContextSource, AppContextItem[]>;

    /** Replace all items in a single slot (used when selection changes). */
    setSlot: (source: ContextSource, items: AppContextItem[]) => void;

    /** Clear a single slot (used on page unmount / selection clear). */
    clearSlot: (source: ContextSource) => void;

    /** Clear all slots (used when chat input clears all context). */
    clearAll: () => void;

    /** Clear all slots (used after message send consumes context). */
    consumeAll: () => void;

    /** Remove a specific item from whatever slot it belongs to. */
    removeItem: (predicate: (item: AppContextItem) => boolean) => void;
}

/**
 * Standalone selector: flat-merges all slots into a single array.
 *
 * Usage in React components (with useShallow to avoid infinite re-renders):
 *   const items = useAppContextStore(useShallow(selectAllItems));
 *
 * Usage imperatively:
 *   const items = selectAllItems(useAppContextStore.getState());
 */
export const selectAllItems = (s: AppContextState): AppContextItem[] => [
    ...s.slots.playlist,
    ...s.slots.traffic,
    ...s.slots.canvas,
    ...s.slots.trends,
];

export const useAppContextStore = create<AppContextState>((set) => ({
    slots: { ...EMPTY_SLOTS },


    setSlot: (source, items) => set((s) => {
        debug.context(`📥 setSlot('${source}')`, items.length, 'items', items.map(i => i.type));
        return { slots: { ...s.slots, [source]: items } };
    }),

    clearSlot: (source) => set((s) => {
        if (s.slots[source].length === 0) return s; // already empty — skip re-render
        debug.context(`🗑️ clearSlot('${source}')`, s.slots[source].length, '→ 0');
        return { slots: { ...s.slots, [source]: [] } };
    }),

    clearAll: () => {
        debug.context('🗑️ clearAll — all slots emptied');
        return set({ slots: { ...EMPTY_SLOTS } });
    },

    consumeAll: () => {
        const total = Object.values(useAppContextStore.getState().slots).reduce((sum, arr) => sum + arr.length, 0);
        debug.context(`🔄 consumeAll — ${total} items consumed`);
        return set({ slots: { ...EMPTY_SLOTS } });
    },

    removeItem: (predicate) => set((s) => {
        const newSlots = { ...s.slots };
        let changed = false;
        for (const key of Object.keys(newSlots) as ContextSource[]) {
            const filtered = newSlots[key].filter((item) => !predicate(item));
            if (filtered.length !== newSlots[key].length) {
                debug.context(`🗑️ removeItem — removed ${newSlots[key].length - filtered.length} from '${key}'`);
                newSlots[key] = filtered;
                changed = true;
            }
        }
        return changed ? { slots: newSlots } : s;
    }),
}));

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

const EMPTY_TIMESTAMPS: Record<ContextSource, number> = {
    playlist: 0,
    traffic: 0,
    canvas: 0,
    trends: 0,
};

interface AppContextState {
    /** Per-source context slots. Each bridge writes to its own slot only. */
    slots: Record<ContextSource, AppContextItem[]>;

    /** Epoch ms when each slot first received data (for chronological ordering). */
    slotTimestamps: Record<ContextSource, number>;

    /** When true, all context bridges skip updates (global pause). */
    isBridgePaused: boolean;

    /** Replace all items in a single slot (used when selection changes). */
    setSlot: (source: ContextSource, items: AppContextItem[]) => void;

    /** Clear a single slot (explicit removal from chat input ✕ button). */
    clearSlot: (source: ContextSource) => void;

    /** Clear all slots (used when chat input clears all context). */
    clearAll: () => void;

    /** Clear all slots (used after message send consumes context). */
    consumeAll: () => void;

    /** Remove a specific item from whatever slot it belongs to. */
    removeItem: (predicate: (item: AppContextItem) => boolean) => void;

    /** Patch a specific item in-place (for toggles like includeTrafficSources). */
    updateItem: <T extends AppContextItem>(
        predicate: (item: AppContextItem) => item is T,
        patch: Partial<T>,
    ) => void;

    /** Toggle global bridge pause (link/unlink selection from chat). */
    toggleBridgePause: () => void;
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
export const selectAllItems = (s: AppContextState): AppContextItem[] => {
    // Sort slots by first-touched time so newest groups appear last
    const order = (Object.keys(s.slots) as ContextSource[])
        .filter((k) => s.slots[k].length > 0)
        .sort((a, b) => (s.slotTimestamps[a] || 0) - (s.slotTimestamps[b] || 0));
    return order.flatMap((k) => s.slots[k]);
};

export const useAppContextStore = create<AppContextState>((set) => ({
    slots: { ...EMPTY_SLOTS },
    slotTimestamps: { ...EMPTY_TIMESTAMPS },
    isBridgePaused: false,

    setSlot: (source, items) => set((s) => {
        // Record first-touch timestamp for chronological ordering
        const ts = s.slotTimestamps[source] || Date.now();
        debug.context(`📥 setSlot('${source}')`, items.length, 'items', items.map(i => i.type));
        return {
            slots: { ...s.slots, [source]: items },
            slotTimestamps: { ...s.slotTimestamps, [source]: ts },
        };
    }),

    clearSlot: (source) => set((s) => {
        if (s.slots[source].length === 0) return s; // already empty — skip re-render
        debug.context(`🗑️ clearSlot('${source}')`, s.slots[source].length, '→ 0');
        return {
            slots: { ...s.slots, [source]: [] },
            slotTimestamps: { ...s.slotTimestamps, [source]: 0 },
        };
    }),

    clearAll: () => {
        debug.context('🗑️ clearAll — all slots emptied');
        return set({ slots: { ...EMPTY_SLOTS }, slotTimestamps: { ...EMPTY_TIMESTAMPS } });
    },

    consumeAll: () => {
        const total = Object.values(useAppContextStore.getState().slots).reduce((sum, arr) => sum + arr.length, 0);
        debug.context(`🔄 consumeAll — ${total} items consumed`);
        return set({ slots: { ...EMPTY_SLOTS }, slotTimestamps: { ...EMPTY_TIMESTAMPS } });
    },

    removeItem: (predicate) => set((s) => {
        const newSlots = { ...s.slots };
        const newTs = { ...s.slotTimestamps };
        let changed = false;
        for (const key of Object.keys(newSlots) as ContextSource[]) {
            const filtered = newSlots[key].filter((item) => !predicate(item));
            if (filtered.length !== newSlots[key].length) {
                debug.context(`🗑️ removeItem — removed ${newSlots[key].length - filtered.length} from '${key}'`);
                newSlots[key] = filtered;
                if (filtered.length === 0) newTs[key] = 0; // reset timestamp when slot emptied
                changed = true;
            }
        }
        return changed ? { slots: newSlots, slotTimestamps: newTs } : s;
    }),

    updateItem: (predicate, patch) => set((s) => {
        const newSlots = { ...s.slots };
        let changed = false;
        for (const key of Object.keys(newSlots) as ContextSource[]) {
            const updated = newSlots[key].map((item) => {
                if (predicate(item)) {
                    changed = true;
                    return { ...item, ...patch };
                }
                return item;
            });
            if (changed) {
                newSlots[key] = updated;
                break; // Item found — stop searching other slots
            }
        }
        return changed ? { slots: newSlots } : s;
    }),

    toggleBridgePause: () => set((s) => {
        const next = !s.isBridgePaused;
        debug.context(`${next ? '⏸️' : '▶️'} Bridge ${next ? 'paused' : 'resumed'}`);
        return { isBridgePaused: next };
    }),
}));

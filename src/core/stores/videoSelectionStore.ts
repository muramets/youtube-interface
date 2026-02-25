// =============================================================================
// Video Selection Store — Global Scoped Selection State (Zustand)
// =============================================================================
//
// Centralizes video selection across pages (e.g. multiple playlists).
// Each selection lives under a "scope" key (e.g. "playlist:abc123").
// Pages subscribe to scoped slices or the aggregate for floating bars.
// =============================================================================

import { create } from 'zustand';

interface VideoSelectionState {
    /** Scoped selections: scope → Set of video IDs. */
    selections: Record<string, Set<string>>;

    /** Toggle a video within a scope. */
    toggleSelection: (scope: string, id: string) => void;

    /** Clear one scope. */
    clearScope: (scope: string) => void;

    /** Clear all scopes. */
    clearAll: () => void;
}

export const useVideoSelectionStore = create<VideoSelectionState>((set) => ({
    selections: {},

    toggleSelection: (scope, id) => set(state => {
        const prev = state.selections[scope] ?? new Set<string>();
        const next = new Set(prev);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }

        const updated = { ...state.selections };
        if (next.size === 0) {
            delete updated[scope];
        } else {
            updated[scope] = next;
        }
        return { selections: updated };
    }),

    clearScope: (scope) => set(state => {
        if (!(scope in state.selections)) return state;
        const updated = { ...state.selections };
        delete updated[scope];
        return { selections: updated };
    }),

    clearAll: () => set({ selections: {} }),
}));

/** Shared empty set to avoid allocations on cache misses. */
const EMPTY_SET = new Set<string>();

// ---------------------------------------------------------------------------
// Derived selectors (for use with useVideoSelectionStore(selector))
// ---------------------------------------------------------------------------

/** Reactive total count across all scopes. */
export const selectTotalCount = (state: VideoSelectionState): number => {
    let count = 0;
    for (const ids of Object.values(state.selections)) {
        count += ids.size;
    }
    return count;
};

/**
 * Reactive flat set of all selected IDs across all scopes.
 * Cached: returns stable reference until `selections` object changes,
 * preventing Zustand's `Object.is` check from triggering infinite re-renders.
 */
let _prevSelections: Record<string, Set<string>> = {};
let _cachedAllIds: Set<string> = EMPTY_SET;

export const selectAllSelectedIds = (state: VideoSelectionState): Set<string> => {
    if (state.selections === _prevSelections) return _cachedAllIds;
    _prevSelections = state.selections;

    const scopes = Object.values(state.selections);
    if (scopes.length === 0) { _cachedAllIds = EMPTY_SET; return EMPTY_SET; }
    if (scopes.length === 1) { _cachedAllIds = scopes[0]; return scopes[0]; }

    const all = new Set<string>();
    for (const ids of scopes) {
        for (const id of ids) all.add(id);
    }
    _cachedAllIds = all;
    return all;
};

/** Reactive selector for a specific scope. */
export const selectScope = (scope: string) =>
    (state: VideoSelectionState): Set<string> =>
        state.selections[scope] ?? EMPTY_SET;

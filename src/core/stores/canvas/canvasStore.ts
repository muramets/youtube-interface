// =============================================================================
// CANVAS: Zustand Store — composed from domain slices
// Orchestration layer: context, UI toggles, Firestore subscribe/save
// =============================================================================

import { create } from 'zustand';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { CanvasNode, CanvasViewport, CanvasEdge } from '../../types/canvas';
import { SAVE_DEBOUNCE_MS } from './constants';
import type { CanvasState } from './types';
import { stripUndefined } from './stripUndefined';
import { createNodesSlice } from './slices/nodesSlice';
import { createEdgesSlice } from './slices/edgesSlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createLayoutSlice } from './slices/layoutSlice';
import { createViewportSlice, DEFAULT_VIEWPORT } from './slices/viewportSlice';

// Re-export types for consumers
export type { PendingEdge, CanvasState } from './types';

// --- Path Helper ---
const canvasDocPath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/canvas/default`;

// --- Module-level mutable state (encapsulated, not exported) ---
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let _hasSyncedOnce = false;
const _dirtyNodeIds = new Set<string>();

// --- Store ---
export const useCanvasStore = create<CanvasState>((...a) => {
    const [set, get] = a;

    // --- Shared save logic (used by debounced _save and immediate _flush) ---
    const doSave = async () => {
        const { userId, channelId, nodes, edges, viewport } = get();
        if (!userId || !channelId) return;
        const ref = doc(db, canvasDocPath(userId, channelId));
        try {
            await setDoc(ref, {
                nodes: stripUndefined(nodes),
                edges: stripUndefined(edges),
                viewport,
                updatedAt: serverTimestamp(),
            });
            _dirtyNodeIds.clear();
        } catch (err) {
            console.error('[canvasStore] save failed:', err);
        }
    };

    return {
        // --- Compose slices ---
        ...createNodesSlice(...a),
        ...createEdgesSlice(...a),
        ...createSelectionSlice(...a),
        ...createLayoutSlice(...a),
        ...createViewportSlice(...a),

        // --- Context ---
        userId: null,
        channelId: null,
        isOpen: false,
        hasSynced: false,

        setContext: (userId, channelId) => {
            const { userId: prev, channelId: prevCh } = get();
            if (userId !== prev || channelId !== prevCh) {
                _hasSyncedOnce = false;
                set({ userId, channelId, hasSynced: false });
            }
        },

        // --- UI ---
        toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
        setOpen: (open) => set({ isOpen: open }),

        // --- Dirty node tracking ---
        _markDirty: (id) => { _dirtyNodeIds.add(id); },

        // --- Firestore Subscribe ---
        subscribe: () => {
            const { userId, channelId } = get();
            if (!userId || !channelId) return () => { };

            const ref = doc(db, canvasDocPath(userId, channelId));
            let hasSyncedOnce = false;

            const unsub = onSnapshot(ref, (snap) => {
                if (!snap.exists()) {
                    set({ nodes: [], edges: [], viewport: DEFAULT_VIEWPORT, hasSynced: true });
                    hasSyncedOnce = true;
                    _hasSyncedOnce = true;
                    return;
                }
                const data = snap.data();
                const firestoreNodes = (data.nodes ?? []) as CanvasNode[];
                const firestoreEdges = (data.edges ?? []) as CanvasEdge[];

                const firestoreIds = new Set(firestoreNodes.map((n) => n.id));
                const localNodes = get().nodes;
                const localById = new Map(localNodes.map((n) => [n.id, n]));

                const localUnsaved = localNodes.filter((n) => !firestoreIds.has(n.id));

                const mergedFirestore = firestoreNodes.map((fn) => {
                    const local = localById.get(fn.id);
                    if (local && ((local.position !== null && fn.position === null) || _dirtyNodeIds.has(fn.id))) {
                        return local;
                    }
                    return fn;
                });

                if (!hasSyncedOnce) {
                    set({
                        nodes: [...mergedFirestore, ...localUnsaved],
                        edges: firestoreEdges,
                        viewport: (data.viewport ?? DEFAULT_VIEWPORT) as CanvasViewport,
                        hasSynced: true,
                    });
                    hasSyncedOnce = true;
                    _hasSyncedOnce = true;
                } else {
                    set({
                        nodes: [...mergedFirestore, ...localUnsaved],
                        edges: firestoreEdges,
                    });
                }
            }, (error) => {
                console.error('[canvasStore] snapshot error:', error);
            });

            return unsub;
        },

        // --- Debounced Save ---
        _save: () => {
            if (!_hasSyncedOnce) return;
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS);
        },

        // --- Immediate flush (call on canvas close) ---
        _flush: () => {
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
                doSave();
            }
        },
    };
});

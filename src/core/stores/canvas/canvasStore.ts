// =============================================================================
// CANVAS: Zustand Store — composed from domain slices
// Orchestration layer: context, UI toggles, Firestore subscribe/save
// =============================================================================
//
// Responsibilities:
//  1. Compose domain slices (nodes, edges, selection, layout, viewport)
//  2. Provide Firestore context (userId/channelId)
//  3. Subscribe to real-time Firestore snapshots (per-page)
//  4. Debounced save on mutation (_save / _flush)
//  5. Page management (CRUD, switchPage, migration from canvas/default)
//  6. Meta doc management (page list, activePageId)
//
// Firestore structure:
//   users/{uid}/channels/{cid}/canvas/meta       — { pages, activePageId }
//   users/{uid}/channels/{cid}/canvas/page_{id}  — { nodes, edges, viewport, title }
//   users/{uid}/channels/{cid}/canvas/default    — legacy (migrated away)
// =============================================================================

import { create } from 'zustand';
import { doc, onSnapshot, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import type { CanvasNode, CanvasViewport, CanvasEdge } from '../../types/canvas';
import { SAVE_DEBOUNCE_MS, MAX_UNDO_LEVELS, IMAGE_NODE_WIDTH, NODE_HEIGHT_FALLBACK } from './constants';
import type { CanvasState, CanvasPageMeta } from './types';
import { stripUndefined } from './stripUndefined';
import { createNodesSlice, createCanvasNode } from './slices/nodesSlice';
import { createEdgesSlice } from './slices/edgesSlice';
import { createSelectionSlice } from './slices/selectionSlice';
import { createLayoutSlice } from './slices/layoutSlice';
import { createViewportSlice, DEFAULT_VIEWPORT } from './slices/viewportSlice';
import { uploadCanvasImage } from '../../services/storageService';
import { debug } from '../../utils/debug';

// Re-export types for consumers
export type { PendingEdge, CanvasState, CanvasPageMeta } from './types';

// --- Path Helpers ---
const canvasBasePath = (userId: string, channelId: string) =>
    `users/${userId}/channels/${channelId}/canvas`;

const canvasMetaPath = (userId: string, channelId: string) =>
    `${canvasBasePath(userId, channelId)}/meta`;

export const canvasPageDocPath = (userId: string, channelId: string, pageId: string) =>
    `${canvasBasePath(userId, channelId)}/page_${pageId}`;

/** Legacy path — used only for migration */
const canvasLegacyPath = (userId: string, channelId: string) =>
    `${canvasBasePath(userId, channelId)}/default`;

// --- Module-level mutable state (encapsulated, not exported) ---
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let metaSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _hasSyncedOnce = false;
const _dirtyNodeIds = new Set<string>();
/** Nodes deleted locally but not yet saved — prevents onSnapshot from re-adding them */
const _deletedNodeIds = new Set<string>();
/** Imperative pan callback registered by CanvasOverlay — used by panToNode */
let _panHandler: ((worldX: number, worldY: number, onComplete?: () => void) => void) | null = null;
/** Imperative panBy callback registered by CanvasOverlay — used by edge auto-pan */
let _panByHandler: ((dx: number, dy: number) => void) | null = null;

// Recursive deep equality for plain objects, arrays, and primitives.
// Handles Firestore key-ordering instability that breaks JSON.stringify.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => deepEqual(v, b[i]));
    }

    if (typeof a === 'object') {
        const ka = Object.keys(a);
        const kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        return ka.every((k) => deepEqual(a[k], b[k]));
    }

    return false;
}

// Structural equality check for CanvasNode objects.
// Used during Firestore merge to reuse local node references when data
// hasn't actually changed — preserves React.memo reference stability.
function isNodeEqual(a: CanvasNode, b: CanvasNode): boolean {
    return (
        a.id === b.id &&
        a.type === b.type &&
        a.isPlaced === b.isPlaced &&
        a.zIndex === b.zIndex &&
        deepEqual(a.position, b.position) &&
        deepEqual(a.size, b.size) &&
        deepEqual(a.data, b.data)
    );
}

// ---------------------------------------------------------------------------
// Internal paste helper — no undo push. Called by both
// pasteClipboard (pushes undo) and moveClipboard (pushes undo).
// ---------------------------------------------------------------------------
type StoreGet = () => CanvasState;
type StoreSet = (partial: Partial<CanvasState> | ((s: CanvasState) => Partial<CanvasState>)) => void;

function _pasteNodes(
    get: StoreGet,
    set: StoreSet,
    clipboard: NonNullable<CanvasState['clipboard']>,
    viewportCenter: { x: number; y: number },
) {
    // Generate new IDs and build old→new mapping
    const idMap = new Map<string, string>();
    for (const n of clipboard.nodes) {
        idMap.set(n.id, crypto.randomUUID());
    }

    // Calculate centroid of copied nodes for offset
    const positions = clipboard.nodes.filter((n) => n.position);
    let offsetX = 0;
    let offsetY = 0;

    if (positions.length > 0) {
        // Calculate the bounding box center of the copied nodes to accurately place them
        const minX = Math.min(...positions.map((n) => n.position!.x));
        const maxX = Math.max(...positions.map((n) => n.position!.x + (n.size?.w ?? IMAGE_NODE_WIDTH)));
        const minY = Math.min(...positions.map((n) => n.position!.y));
        const maxY = Math.max(...positions.map((n) => n.position!.y + (n.size?.h ?? NODE_HEIGHT_FALLBACK)));

        const cx = minX + (maxX - minX) / 2;
        const cy = minY + (maxY - minY) / 2;

        // Shift the cluster so its center lands exactly on the requested viewportCenter (which is our cursor pos)
        offsetX = viewportCenter.x - cx;
        offsetY = viewportCenter.y - cy;
    }

    const newNodes = clipboard.nodes.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        position: n.position
            ? { x: n.position.x + offsetX, y: n.position.y + offsetY }
            : null,
        isPlaced: true,
    }));

    const newEdges = clipboard.edges.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        sourceNodeId: idMap.get(e.sourceNodeId) ?? e.sourceNodeId,
        targetNodeId: idMap.get(e.targetNodeId) ?? e.targetNodeId,
    }));

    set((s) => ({
        nodes: [...s.nodes, ...newNodes],
        edges: [...s.edges, ...newEdges],
        selectedNodeIds: new Set(newNodes.map((n) => n.id)),
    }));

    get()._save();
    debug.canvas('📋 Pasted', newNodes.length, 'nodes,', newEdges.length, 'edges');
}

// --- Store ---
export const useCanvasStore = create<CanvasState>((...a) => {
    const [set, get] = a;

    // --- Shared save logic (per-page) ---
    const doSave = async () => {
        const { userId, channelId, activePageId, nodes, edges, viewport } = get();
        if (!userId || !channelId || !activePageId) return;
        const ref = doc(db, canvasPageDocPath(userId, channelId, activePageId));
        try {
            await setDoc(ref, {
                nodes: stripUndefined(nodes),
                edges: stripUndefined(edges),
                viewport,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            _dirtyNodeIds.clear();
            _deletedNodeIds.clear();
        } catch (err) {
            console.error('[canvasStore] save failed:', err);
        }
    };

    // --- Meta save logic ---
    const doSaveMeta = async () => {
        const { userId, channelId, pages, activePageId } = get();
        if (!userId || !channelId) return;
        const ref = doc(db, canvasMetaPath(userId, channelId));
        try {
            await setDoc(ref, {
                pages,
                activePageId,
                updatedAt: serverTimestamp(),
            });
        } catch (err) {
            console.error('[canvasStore] meta save failed:', err);
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

        // --- Pages ---
        pages: [],
        activePageId: null,

        // --- Clipboard ---
        clipboard: null,

        // --- Undo/Redo ---
        _undoStack: [],
        _redoStack: [],
        canUndo: false,
        canRedo: false,

        setContext: (userId, channelId) => {
            const { userId: prev, channelId: prevCh } = get();
            if (userId !== prev || channelId !== prevCh) {
                // Flush any pending save to the OLD channel BEFORE changing context.
                // This prevents stale nodes from being written to the new channel's Firestore path.
                if (saveTimer) {
                    clearTimeout(saveTimer);
                    saveTimer = null;
                    // Only flush if we had a valid previous context
                    if (prev && prevCh && _hasSyncedOnce) {
                        const { nodes, edges, viewport, activePageId } = get();
                        if (activePageId) {
                            const ref = doc(db, canvasPageDocPath(prev, prevCh, activePageId));
                            setDoc(ref, {
                                nodes: stripUndefined(nodes),
                                edges: stripUndefined(edges),
                                viewport,
                                updatedAt: serverTimestamp(),
                            }, { merge: true }).catch((err) =>
                                console.error('[canvasStore] pre-switch flush failed:', err)
                            );
                        }
                    }
                }
                if (metaSaveTimer) { clearTimeout(metaSaveTimer); metaSaveTimer = null; }
                _hasSyncedOnce = false;
                _dirtyNodeIds.clear();
                _deletedNodeIds.clear();
                set({
                    userId, channelId, hasSynced: false,
                    pages: [], activePageId: null, // intentionally not clearing clipboard
                    nodes: [], edges: [], viewport: DEFAULT_VIEWPORT,
                    selectedNodeIds: new Set(), nodeSizes: {},
                    _undoStack: [], _redoStack: [], canUndo: false, canRedo: false,
                });
            }
        },

        // --- UI ---
        toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
        setOpen: (open) => set({ isOpen: open }),
        pendingInsightReveal: null,
        revealInsight: (nodeId, category) => set({ pendingInsightReveal: { nodeId, category } }),
        clearPendingInsightReveal: () => set({ pendingInsightReveal: null }),
        highlightedEdgeId: null,
        editingNodeId: null,
        highlightEdge: (edgeId) => set((s) => ({
            highlightedEdgeId: s.highlightedEdgeId === edgeId ? null : edgeId,
        })),
        clearHighlightedEdge: () => set({ highlightedEdgeId: null }),
        setEditingNodeId: (id) => set({ editingNodeId: id }),

        // --- Cross-page insert ---
        addNodeToPage: async (dataArr, pageId) => {
            const { userId, channelId, activePageId } = get();
            if (!userId || !channelId) return;

            // Same page → use in-memory addNode (supports undo, pending placement, etc.)
            if (pageId === activePageId) {
                for (const data of dataArr) {
                    get().addNode(data);
                }
                return;
            }

            // Cross-page → direct Firestore read-modify-write
            try {
                const ref = doc(db, canvasPageDocPath(userId, channelId, pageId));
                const snap = await getDoc(ref);
                const existing = snap.exists() ? (snap.data().nodes ?? []) as CanvasNode[] : [];

                const newNodes = dataArr.map((data) => createCanvasNode(data, null, existing));

                await setDoc(ref, {
                    nodes: stripUndefined([...existing, ...newNodes]),
                    updatedAt: serverTimestamp(),
                }, { merge: true });

                debug.canvas('📌 Cross-page insert:', newNodes.length, 'nodes → page', pageId);
            } catch (err) {
                console.error('[canvasStore] addNodeToPage failed:', err);
            }
        },

        // --- Image paste from OS clipboard ---
        addImageNode: (blob, viewportCenter) => {
            const { userId, channelId, activePageId } = get();
            if (!userId || !channelId || !activePageId) return;

            // 1. Create placeholder node immediately (optimistic UI)
            // Note: addNodeAt pushes undo internally — no extra push needed
            const placeholderData = { type: 'image' as const, downloadUrl: '', storagePath: '' };
            get().addNodeAt(placeholderData, viewportCenter);

            // The node was added by addNodeAt with its own ID — grab the last one
            const addedNode = get().nodes[get().nodes.length - 1];
            const realId = addedNode.id;

            // 2. Upload in background, then update node data with real URL
            uploadCanvasImage(userId, channelId, activePageId, realId, blob)
                .then(({ storagePath, downloadUrl }) => {
                    get()._markDirty(realId);
                    set((s) => ({
                        nodes: s.nodes.map((n) =>
                            n.id === realId
                                ? { ...n, data: { ...n.data, downloadUrl, storagePath } }
                                : n
                        ),
                    }));
                    get()._save();
                    debug.canvas('🖼️ Image uploaded:', storagePath);
                })
                .catch((err) => {
                    console.error('[Canvas] Image upload failed:', err);
                    // Remove the placeholder node on failure
                    set((s) => ({
                        nodes: s.nodes.filter((n) => n.id !== realId),
                    }));
                    get()._save();
                });
        },

        // --- Dirty node tracking ---
        _markDirty: (id) => { _dirtyNodeIds.add(id); },
        _markDeleted: (ids) => { for (const id of ids) _deletedNodeIds.add(id); },

        // --- Pan-to-node (callback registration pattern) ---
        _registerPanHandler: (handler) => { _panHandler = handler; },
        _unregisterPanHandler: () => { _panHandler = null; },
        panToNode: (nodeId, onComplete) => {
            const node = get().nodes.find((n) => n.id === nodeId);
            if (!node?.position || !_panHandler) return;
            const hw = (node.size?.w ?? 400) / 2;
            const hh = (node.size?.h ?? 150) / 2;
            _panHandler(node.position.x + hw, node.position.y + hh, onComplete);
        },

        // --- PanBy (edge auto-pan) ---
        _registerPanByHandler: (handler) => { _panByHandler = handler; },
        _unregisterPanByHandler: () => { _panByHandler = null; },
        autoPanBy: (dx, dy) => {
            _panByHandler?.(dx, dy);
            // Sync store viewport so screenToWorld() reads correct values.
            // panBy shifts the DOM transform directly, but the store viewport
            // must track it for world-coordinate calculations in edge drag.
            const vp = get().viewport;
            set({ viewport: { ...vp, x: vp.x + dx, y: vp.y + dy } });
        },

        // --- Page Management ---
        switchPage: (pageId) => {
            const { activePageId, _flush: flushSave } = get();
            if (pageId === activePageId) return;
            // Flush pending save for current page BEFORE clearing state
            flushSave();
            // Clear current page data — useCanvasSync will re-subscribe
            // Clear undo/redo when switching pages — per-page history
            set({
                activePageId: pageId,
                nodes: [],
                edges: [],
                viewport: DEFAULT_VIEWPORT,
                hasSynced: false,
                selectedNodeIds: new Set(),
                nodeSizes: {},
                _undoStack: [],
                _redoStack: [],
                canUndo: false,
                canRedo: false,
            });
            _hasSyncedOnce = false;
            _dirtyNodeIds.clear();
            // Persist activePageId so it survives page reload
            get()._saveMeta();
        },

        addPage: (title) => {
            const { userId, channelId, pages } = get();
            if (!userId || !channelId) return;
            const id = crypto.randomUUID();
            const newPage: CanvasPageMeta = {
                id,
                title,
                order: pages.length,
            };
            // Create empty page doc in Firestore
            const ref = doc(db, canvasPageDocPath(userId, channelId, id));
            setDoc(ref, {
                nodes: [],
                edges: [],
                viewport: DEFAULT_VIEWPORT,
                title,
                updatedAt: serverTimestamp(),
            }).catch((err) => console.error('[canvasStore] addPage failed:', err));

            set({ pages: [...pages, newPage] });
            // Save meta with new page list
            get()._saveMeta();
            // Switch to new page
            get().switchPage(id);
        },

        renamePage: (pageId, title) => {
            const { userId, channelId } = get();
            set((s) => ({
                pages: s.pages.map((p) => (p.id === pageId ? { ...p, title } : p)),
            }));
            get()._saveMeta();
            // Sync title to page doc (denormalized for self-contained docs)
            if (userId && channelId) {
                const ref = doc(db, canvasPageDocPath(userId, channelId, pageId));
                setDoc(ref, { title }, { merge: true })
                    .catch((err) => console.error('[canvasStore] renamePage doc failed:', err));
            }
        },

        deletePage: (pageId) => {
            const { pages, activePageId, userId, channelId } = get();
            if (pages.length <= 1) return; // Can't delete last page
            if (!userId || !channelId) return;

            const next = pages.filter((p) => p.id !== pageId);
            set({ pages: next });

            // If deleted was active, switch to first remaining
            if (activePageId === pageId) {
                get().switchPage(next[0].id);
            }

            // Delete Firestore page doc
            const ref = doc(db, canvasPageDocPath(userId, channelId, pageId));
            deleteDoc(ref).catch((err) => console.error('[canvasStore] deletePage failed:', err));

            get()._saveMeta();
        },

        // --- Clipboard ---
        copySelected: () => {
            const { selectedNodeIds, nodes, edges, activePageId, channelId } = get();
            if (selectedNodeIds.size === 0 || !activePageId || !channelId) return;
            const copiedNodes = nodes.filter((n) => selectedNodeIds.has(n.id));
            const copiedEdges = edges.filter(
                (e) => selectedNodeIds.has(e.sourceNodeId) && selectedNodeIds.has(e.targetNodeId)
            );
            set({ clipboard: { nodes: copiedNodes, edges: copiedEdges, sourcePageId: activePageId, sourceChannelId: channelId } });
            debug.canvas('📋 Copied', copiedNodes.length, 'nodes from page', activePageId, 'in channel', channelId);
        },

        pasteClipboard: (viewportCenter) => {
            const { clipboard } = get();
            if (!clipboard || clipboard.nodes.length === 0) return;
            get()._pushUndo();
            _pasteNodes(get, set, clipboard, viewportCenter);
        },

        moveClipboard: (viewportCenter) => {
            const { clipboard, userId, channelId, activePageId } = get();
            if (!clipboard || clipboard.nodes.length === 0) return;
            if (!userId || !channelId || !activePageId) return;

            // Single undo boundary for the entire move operation
            get()._pushUndo();
            _pasteNodes(get, set, clipboard, viewportCenter);

            // If source page AND channel are the same, the nodes are now duplicated — delete originals
            if (clipboard.sourcePageId === activePageId && clipboard.sourceChannelId === channelId) {
                const originalIds = clipboard.nodes.map((n) => n.id);
                const idSet = new Set(originalIds);
                set((s) => ({
                    nodes: s.nodes.filter((n) => !idSet.has(n.id)),
                    edges: s.edges.filter((e) => !idSet.has(e.sourceNodeId) && !idSet.has(e.targetNodeId)),
                }));
                get()._markDeleted(originalIds);
                get()._save();
            } else {
                // Cross-page or Cross-channel move: read source doc, remove originals, write back
                // Fallback to current channelId if sourceChannelId is missing from older clipboard state
                const srcChannel = clipboard.sourceChannelId || channelId;
                const srcRef = doc(db, canvasPageDocPath(userId, srcChannel, clipboard.sourcePageId));
                getDoc(srcRef).then((snap) => {
                    if (!snap.exists()) return;
                    const data = snap.data();
                    const srcNodes = (data.nodes ?? []) as CanvasNode[];
                    const srcEdges = (data.edges ?? []) as CanvasEdge[];
                    const cutIds = new Set(clipboard.nodes.map((n) => n.id));
                    setDoc(srcRef, {
                        nodes: stripUndefined(srcNodes.filter((n) => !cutIds.has(n.id))),
                        edges: stripUndefined(srcEdges.filter((e) => !cutIds.has(e.sourceNodeId) && !cutIds.has(e.targetNodeId))),
                        updatedAt: serverTimestamp(),
                    }, { merge: true }).catch((err) =>
                        console.error('[canvasStore] moveClipboard: source page cleanup failed:', err)
                    );
                }).catch((err) =>
                    console.error('[canvasStore] moveClipboard: source page read failed:', err)
                );
            }

            // Clear clipboard after move (can't move twice)
            set({ clipboard: null });
            debug.canvas('📋 Moved nodes from page', clipboard.sourcePageId, 'to', activePageId);
        },

        // --- Firestore: Meta Subscribe (page list) ---
        subscribeMeta: () => {
            const { userId, channelId } = get();
            if (!userId || !channelId) return () => { };

            const metaRef = doc(db, canvasMetaPath(userId, channelId));
            const legacyRef = doc(db, canvasLegacyPath(userId, channelId));

            let isMigrating = false;

            const unsub = onSnapshot(metaRef, async (snap) => {
                if (isMigrating) return;

                if (snap.exists()) {
                    // Meta doc exists — load pages
                    const data = snap.data();
                    const pages = (data.pages ?? []) as CanvasPageMeta[];
                    const activePageId = data.activePageId as string | null;

                    set({ pages });

                    // Set active page if not already set
                    if (!get().activePageId && pages.length > 0) {
                        set({ activePageId: activePageId || pages[0].id });
                    }
                    return;
                }

                // Meta doesn't exist — check for legacy doc to migrate
                isMigrating = true;
                try {
                    const legacySnap = await getDoc(legacyRef);
                    const pageId = crypto.randomUUID();
                    const defaultPage: CanvasPageMeta = { id: pageId, title: 'Main', order: 0 };

                    if (legacySnap.exists()) {
                        // Migrate: copy legacy data to new page doc
                        const legacyData = legacySnap.data();
                        const pageRef = doc(db, canvasPageDocPath(userId, channelId, pageId));
                        await setDoc(pageRef, {
                            nodes: legacyData.nodes ?? [],
                            edges: legacyData.edges ?? [],
                            viewport: legacyData.viewport ?? DEFAULT_VIEWPORT,
                            title: 'Main',
                            updatedAt: serverTimestamp(),
                        });
                        // Create meta doc
                        await setDoc(metaRef, {
                            pages: [defaultPage],
                            activePageId: pageId,
                            updatedAt: serverTimestamp(),
                        });
                        // Delete legacy doc
                        await deleteDoc(legacyRef);
                        debug.canvas('📦 Migrated canvas/default → canvas/pages/' + pageId);
                    } else {
                        // Brand new canvas — create empty page + meta
                        const pageRef = doc(db, canvasPageDocPath(userId, channelId, pageId));
                        await setDoc(pageRef, {
                            nodes: [],
                            edges: [],
                            viewport: DEFAULT_VIEWPORT,
                            title: 'Main',
                            updatedAt: serverTimestamp(),
                        });
                        await setDoc(metaRef, {
                            pages: [defaultPage],
                            activePageId: pageId,
                            updatedAt: serverTimestamp(),
                        });
                        debug.canvas('🆕 Created initial canvas page');
                    }

                    set({ pages: [defaultPage], activePageId: pageId });
                } catch (err) {
                    console.error('[canvasStore] migration failed:', err);
                } finally {
                    isMigrating = false;
                }
            }, (error) => {
                console.error('[canvasStore] meta snapshot error:', error);
            });

            return unsub;
        },

        // --- Firestore: Per-Page Subscribe ---
        subscribe: (pageId) => {
            const { userId, channelId } = get();
            if (!userId || !channelId || !pageId) return () => { };

            const ref = doc(db, canvasPageDocPath(userId, channelId, pageId));
            let hasSyncedOnce = false;

            const unsub = onSnapshot(ref, (snap) => {
                // Bail if user switched pages while snapshot was in-flight
                if (get().activePageId !== pageId) return;

                if (!snap.exists()) {
                    set({ nodes: [], edges: [], viewport: DEFAULT_VIEWPORT, hasSynced: true });
                    hasSyncedOnce = true;
                    _hasSyncedOnce = true;
                    return;
                }
                const data = snap.data();
                const firestoreNodes = (data.nodes ?? []) as CanvasNode[];
                const firestoreEdges = (data.edges ?? []) as CanvasEdge[];

                // Filter out locally-deleted nodes that Firestore hasn't caught up to yet
                const liveFirestoreNodes = _deletedNodeIds.size > 0
                    ? firestoreNodes.filter((n) => !_deletedNodeIds.has(n.id))
                    : firestoreNodes;

                const firestoreIds = new Set(liveFirestoreNodes.map((n) => n.id));
                const localNodes = get().nodes;
                const localById = new Map(localNodes.map((n) => [n.id, n]));

                const localUnsaved = localNodes.filter((n) => !firestoreIds.has(n.id));

                const mergedFirestore = liveFirestoreNodes.map((fn) => {
                    const local = localById.get(fn.id);
                    if (local && ((local.position !== null && fn.position === null) || _dirtyNodeIds.has(fn.id))) {
                        return local;
                    }
                    // Reuse local object when structurally identical — preserves
                    // reference equality for React.memo comparators downstream.
                    if (local && isNodeEqual(local, fn)) {
                        return local;
                    }
                    return fn;
                });

                const reused = mergedFirestore.filter((n, i) => n === localById.get(liveFirestoreNodes[i]?.id)).length;
                debug.canvas('🔄 Firestore sync:', liveFirestoreNodes.length, 'nodes,', reused, 'reused,', liveFirestoreNodes.length - reused, 'changed');

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
                    // Skip set() if nothing actually changed — avoids new array
                    // reference that triggers downstream re-renders for no reason.
                    const merged = [...mergedFirestore, ...localUnsaved];
                    const nodesChanged = merged.length !== localNodes.length ||
                        merged.some((n, i) => n !== localNodes[i]);
                    const edgesChanged = firestoreEdges.length !== get().edges.length ||
                        firestoreEdges.some((e, i) => e.id !== get().edges[i]?.id);

                    if (nodesChanged || edgesChanged) {
                        set({
                            nodes: merged,
                            edges: firestoreEdges,
                        });
                    }
                }
            }, (error) => {
                console.error('[canvasStore] snapshot error:', error);
            });

            return unsub;
        },

        // --- Debounced Save (current page) ---
        _save: () => {
            if (!_hasSyncedOnce) return;
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS);
        },

        // --- Immediate flush (call on canvas close or page switch) ---
        _flush: () => {
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
                doSave();
            }
        },

        // --- Debounced Meta Save ---
        _saveMeta: () => {
            if (metaSaveTimer) clearTimeout(metaSaveTimer);
            metaSaveTimer = setTimeout(doSaveMeta, 300);
        },

        // --- Undo/Redo ---
        _pushUndo: () => {
            const { nodes, edges, _undoStack } = get();
            const snapshot = { nodes: [...nodes], edges: [...edges] };
            const stack = [..._undoStack, snapshot];
            // Ring buffer: drop oldest if over limit
            if (stack.length > MAX_UNDO_LEVELS) stack.shift();
            debug.canvas('[Undo] pushUndo — stack:', stack.length, 'nodes:', nodes.length);
            set({ _undoStack: stack, _redoStack: [], canUndo: true, canRedo: false });
        },

        undo: () => {
            const { _undoStack, _redoStack, nodes, edges } = get();
            if (_undoStack.length === 0) return;
            const prev = _undoStack[_undoStack.length - 1];
            const newUndo = _undoStack.slice(0, -1);
            const newRedo = [..._redoStack, { nodes: [...nodes], edges: [...edges] }];
            set({
                nodes: prev.nodes,
                edges: prev.edges,
                _undoStack: newUndo,
                _redoStack: newRedo,
                canUndo: newUndo.length > 0,
                canRedo: true,
                selectedNodeIds: new Set(),
            });
            get()._save();
            debug.canvas('⬅️ Undo — stack:', newUndo.length, 'undo,', newRedo.length, 'redo');
        },

        redo: () => {
            const { _undoStack, _redoStack, nodes, edges } = get();
            if (_redoStack.length === 0) return;
            const next = _redoStack[_redoStack.length - 1];
            const newRedo = _redoStack.slice(0, -1);
            const newUndo = [..._undoStack, { nodes: [...nodes], edges: [...edges] }];
            set({
                nodes: next.nodes,
                edges: next.edges,
                _undoStack: newUndo,
                _redoStack: newRedo,
                canUndo: true,
                canRedo: newRedo.length > 0,
                selectedNodeIds: new Set(),
            });
            get()._save();
            debug.canvas('➡️ Redo — stack:', newUndo.length, 'undo,', newRedo.length, 'redo');
        },
    };
});

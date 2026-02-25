// =============================================================================
// Canvas Store — Shared types for Zustand slice pattern
// =============================================================================

import type { StateCreator } from 'zustand';
import type {
    CanvasNode, CanvasViewport, CanvasNodeData,
    CanvasEdge, HandlePosition, InsightCategory,
} from '../../types/canvas';

// --- Canvas page metadata (stored in canvas/meta doc) ---
export interface CanvasPageMeta {
    id: string;
    title: string;
    order: number;
}

// --- Undo/Redo snapshot (nodes + edges only, no viewport/selection) ---
export interface CanvasSnapshot {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
}

// --- Pending edge (rubber-band while dragging from a handle) ---
export interface PendingEdge {
    sourceNodeId: string;
    sourceHandle: HandlePosition;
    /** World-coordinate center of the source handle dot, measured from DOM */
    sourceAnchor: { x: number; y: number };
    /** Current cursor position in world coordinates */
    x: number;
    y: number;
    /** Set when cursor hovers a valid target handle — includes DOM-measured anchor */
    snapTarget: {
        nodeId: string;
        handle: HandlePosition;
        anchor: { x: number; y: number };
    } | null;
}

// --- Full state interface (union of all slices) ---
export interface CanvasState {
    // Context
    userId: string | null;
    channelId: string | null;

    // Pages
    pages: CanvasPageMeta[];
    activePageId: string | null;

    // Data (current page)
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    viewport: CanvasViewport;
    /** Measured node heights from ResizeObserver — not persisted */
    nodeSizes: Record<string, number>;

    // Clipboard (in-memory, survives page switches)
    clipboard: { nodes: CanvasNode[]; edges: CanvasEdge[]; sourcePageId: string; sourceChannelId?: string } | null;

    // Undo/Redo (per-page, max 50 levels)
    _undoStack: CanvasSnapshot[];
    _redoStack: CanvasSnapshot[];
    canUndo: boolean;
    canRedo: boolean;

    // UI
    isOpen: boolean;
    /** True after first Firestore snapshot has been processed */
    hasSynced: boolean;
    pendingEdge: PendingEdge | null;
    /** Last known cursor position in world coordinates (updated on canvas mousemove) */
    lastCanvasWorldPos: { x: number; y: number } | null;
    /** ID of the last canvas node the cursor hovered over (never cleared on leave — intent signal) */
    lastHoveredNodeId: string | null;
    /** Transient signal: auto-open an insight popover after panToNode completes */
    pendingInsightReveal: { nodeId: string; category: InsightCategory } | null;
    /** Edge ID highlighted via Cmd+Click — connected nodes stay bright, others dim */
    highlightedEdgeId: string | null;
    /** Node ID currently in text-editing mode — wrapper expands height to fit content */
    editingNodeId: string | null;
    /** When true, canvas selections are NOT pushed to chat context */
    contextBridgePaused: boolean;

    // Selection
    selectedNodeIds: Set<string>;

    // Actions: Context
    setContext: (userId: string | null, channelId: string | null) => void;

    // Actions: UI
    toggleOpen: () => void;
    toggleContextBridge: () => void;
    setOpen: (open: boolean) => void;
    setLastCanvasWorldPos: (pos: { x: number; y: number }) => void;
    setLastHoveredNodeId: (id: string | null) => void;
    /** Signal InsightButtons to auto-open a specific category popover */
    revealInsight: (nodeId: string, category: InsightCategory) => void;
    clearPendingInsightReveal: () => void;
    /** Highlight an edge and dim unrelated nodes (Cmd+Click) */
    highlightEdge: (edgeId: string) => void;
    clearHighlightedEdge: () => void;
    /** Set the node currently being text-edited (null = no editing) */
    setEditingNodeId: (id: string | null) => void;

    // Nodes
    addNode: (data: CanvasNodeData) => void;
    /** Add node(s) to a specific canvas page. If pageId === activePageId, delegates to addNode.
     *  Otherwise, writes directly to Firestore (cross-page insert, no in-memory mutation). */
    addNodeToPage: (data: CanvasNodeData[], pageId: string) => Promise<void>;
    /** Place a node immediately at the given world position (skips pending placement). */
    addNodeAt: (data: CanvasNodeData, position: { x: number; y: number }) => void;
    updateNodeData: (id: string, data: Partial<CanvasNodeData>) => void;
    moveNode: (id: string, position: { x: number; y: number }) => void;
    moveNodes: (updates: { id: string; position: { x: number; y: number } }[]) => void;
    markPlaced: (id: string) => void;
    deleteNode: (id: string) => void;
    deleteNodes: (ids: string[]) => void;
    alignNodesTop: (ids: string[]) => void;
    alignNodesCenterY: (ids: string[]) => void;
    /** Clone nodes (and internal edges) at their current positions; returns new IDs. Does NOT push undo. */
    duplicateNodes: (ids: string[]) => string[];
    resizeNode: (id: string, width: number, height?: number) => void;
    bringToFront: (id: string) => void;
    sendToBack: (id: string) => void;
    bringNodesToFront: (ids: string[]) => void;
    sendNodesToBack: (ids: string[]) => void;
    placePendingNodes: (viewportCenter: { x: number; y: number }) => void;
    /** Correction pass: re-stack children of each parent using measured heights */
    relayoutChildren: () => void;
    /** Paste an image blob from OS clipboard: creates placeholder node → uploads → updates URL */
    addImageNode: (blob: Blob, viewportCenter: { x: number; y: number }) => void;

    // Selection
    selectNode: (id: string, multi: boolean) => void;
    setSelectedNodeIds: (ids: string[]) => void;
    clearSelection: () => void;

    // Actions: Edges
    addEdge: (edge: Omit<CanvasEdge, 'id' | 'createdAt'>) => void;
    deleteEdge: (id: string) => void;
    startPendingEdge: (sourceNodeId: string, sourceHandle: HandlePosition, sourceAnchor: { x: number; y: number }) => void;
    updatePendingEdge: (x: number, y: number) => void;
    setSnapTarget: (nodeId: string, handle: HandlePosition, anchor: { x: number; y: number }) => void;
    clearSnapTarget: () => void;
    completePendingEdge: (targetNodeId: string, targetHandle: HandlePosition) => void;
    cancelPendingEdge: () => void;
    updateNodeSize: (id: string, height: number) => void;

    // Actions: Viewport
    setViewport: (viewport: CanvasViewport) => void;
    /** Animate the camera to center on a node by ID. Calls onComplete when animation finishes. */
    panToNode: (nodeId: string, onComplete?: () => void) => void;
    /** Register the imperative pan handler (called by CanvasOverlay on mount) */
    _registerPanHandler: (handler: (worldX: number, worldY: number, onComplete?: () => void) => void) => void;
    /** Unregister the pan handler (called on unmount) */
    _unregisterPanHandler: () => void;
    /** Register the imperative panBy handler for auto-pan during edge drag */
    _registerPanByHandler: (handler: (dx: number, dy: number) => void) => void;
    _unregisterPanByHandler: () => void;
    /** Shift viewport by screen-space delta — used by edge auto-pan */
    autoPanBy: (dx: number, dy: number) => void;

    // Pages
    switchPage: (pageId: string) => void;
    addPage: (title: string) => void;
    renamePage: (pageId: string, title: string) => void;
    deletePage: (pageId: string) => void;

    // Clipboard
    copySelected: () => void;
    pasteClipboard: (viewportCenter: { x: number; y: number }) => void;
    /** Paste + delete originals from source page (Cmd+Opt+V move) */
    moveClipboard: (viewportCenter: { x: number; y: number }) => void;

    // Firestore
    subscribeMeta: () => () => void;
    subscribe: (pageId: string) => () => void;
    _save: () => void;
    /** Immediately persist any pending debounced save (call on close) */
    _flush: () => void;
    /** Mark a node as dirty — onSnapshot preserves local version for dirty nodes */
    _markDirty: (id: string) => void;
    /** Mark node IDs as locally deleted — onSnapshot skips them until save completes */
    _markDeleted: (ids: string[]) => void;
    _saveMeta: () => void;

    // Undo/Redo
    /** Push current nodes+edges onto undo stack (call before destructive mutations) */
    _pushUndo: () => void;
    undo: () => void;
    redo: () => void;
}

/** Zustand slice creator type — all slices share the full CanvasState */
export type CanvasSlice<T> = StateCreator<CanvasState, [], [], T>;


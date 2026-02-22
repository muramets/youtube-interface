// =============================================================================
// Canvas Store — Shared types for Zustand slice pattern
// =============================================================================

import type { StateCreator } from 'zustand';
import type {
    CanvasNode, CanvasViewport, CanvasNodeData,
    CanvasEdge, HandlePosition,
} from '../../types/canvas';

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

    // Data
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    viewport: CanvasViewport;
    /** Measured node heights from ResizeObserver — not persisted */
    nodeSizes: Record<string, number>;

    // UI
    isOpen: boolean;
    /** True after first Firestore snapshot has been processed */
    hasSynced: boolean;
    pendingEdge: PendingEdge | null;

    // Selection
    selectedNodeIds: Set<string>;

    // Actions: Context
    setContext: (userId: string | null, channelId: string | null) => void;

    // Actions: UI
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;

    // Nodes
    addNode: (data: CanvasNodeData) => void;
    updateNodeData: (id: string, data: Partial<CanvasNodeData>) => void;
    moveNode: (id: string, position: { x: number; y: number }) => void;
    moveNodes: (updates: { id: string; position: { x: number; y: number } }[]) => void;
    deleteNode: (id: string) => void;
    deleteNodes: (ids: string[]) => void;
    alignNodesTop: (ids: string[]) => void;
    resizeNode: (id: string, width: number, height?: number) => void;
    bringToFront: (id: string) => void;
    placePendingNodes: (viewportCenter: { x: number; y: number }) => void;
    /** Correction pass: re-stack children of each parent using measured heights */
    relayoutChildren: () => void;

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

    // Firestore
    subscribe: () => () => void;
    _save: () => void;
    /** Immediately persist any pending debounced save (call on close) */
    _flush: () => void;
    /** Mark a node as dirty — onSnapshot preserves local version for dirty nodes */
    _markDirty: (id: string) => void;
}

/** Zustand slice creator type — all slices share the full CanvasState */
export type CanvasSlice<T> = StateCreator<CanvasState, [], [], T>;


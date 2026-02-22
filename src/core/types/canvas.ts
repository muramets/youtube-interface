// =============================================================================
// CANVAS: Type Definitions
// =============================================================================

import type { AppContextItem } from './appContext';
import { Timestamp } from 'firebase/firestore';

// --- Sticky Note ---

export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'neutral';

export interface StickyNoteData {
    type: 'sticky-note';
    content: string;   // Markdown
    color: NoteColor;
}

// --- Canvas Node ---

/** Data payload for a canvas node — context card or sticky note */
export type CanvasNodeData = AppContextItem | StickyNoteData;

/** Position on the infinite canvas in world coordinates */
export interface CanvasPosition {
    x: number;
    y: number;
}

/** Optional custom size override (nodes have default sizes per type) */
export interface CanvasSize {
    w: number;
    h: number;
}

/** A single node placed on the canvas */
export interface CanvasNode {
    id: string;
    type: 'video-card' | 'suggested-traffic' | 'traffic-source' | 'sticky-note';
    data: CanvasNodeData;
    /** null = pending placement (created by drop on closed Canvas FAB) */
    position: CanvasPosition | null;
    size?: CanvasSize;
    /** Higher = rendered on top. Incremented on click (bring-to-front) */
    zIndex: number;
    /** True once the user has manually dragged this node. Unplaced nodes show a glow. */
    isPlaced?: boolean;
    createdAt: Timestamp;
}

// --- Viewport ---

/** Saved camera position for the canvas */
export interface CanvasViewport {
    x: number;
    y: number;
    zoom: number;
}

// --- Edges ---

export type HandlePosition = 'top' | 'right' | 'bottom' | 'left';
export type EdgeLineStyle = 'solid' | 'dashed' | 'dotted';

export interface CanvasEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle: HandlePosition;
    targetHandle: HandlePosition;
    /** Optional label shown at midpoint */
    label?: string;
    /** CSS color string, e.g. '#fff' or 'var(--accent)' */
    color?: string;
    lineStyle?: EdgeLineStyle;
    createdAt: number; // Date.now()
}

// --- Firestore Document ---

/** Single Firestore document per channel: users/{uid}/channels/{cid}/canvas/default */
export interface CanvasDoc {
    nodes: CanvasNode[];
    edges?: CanvasEdge[];
    viewport: CanvasViewport;
    updatedAt: Timestamp;
}

// --- Type-safe accessors for CanvasNodeData ---

/** Get videoId from node data (present on video-card and traffic-source) */
export function getVideoId(data: CanvasNodeData): string | undefined {
    if ('videoId' in data) return data.videoId;
    return undefined;
}

/** Get sourceVideoId from node data (present on traffic-source only) */
export function getSourceVideoId(data: CanvasNodeData): string | undefined {
    if ('sourceVideoId' in data) return (data as { sourceVideoId?: string }).sourceVideoId;
    return undefined;
}

/** Get the discriminated type from node data */
export function getNodeDataType(data: CanvasNodeData): string {
    return data.type;
}

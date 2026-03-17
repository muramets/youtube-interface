import type { Playlist } from '../../../../core/services/playlistService';

// ── State ────────────────────────────────────────────────────────────

export interface DndState {
    /** Optimistic playlist list — mutated during drag, synced from Firestore when idle */
    localPlaylists: Playlist[];
    /** Optimistic group order */
    localGroupOrder: string[];
    /** Currently dragged item ID (playlist ID or "group-{name}") */
    activeId: string | null;
    /** Currently dragged playlist (null for group drags) */
    activePlaylist: Playlist | null;
    /** Currently dragged group name (null for playlist drags) */
    activeGroup: string | null;
    /** ID of just-dropped item — used for drop animation, cleared after 50ms */
    justDroppedId: string | null;
    /** Whether a drag operation is in progress */
    isDragging: boolean;
    /** Snapshot of localPlaylists at drag start — used to diff at drag end */
    initialPlaylists: Playlist[];
    /** Last within-group move — used to detect and suppress dnd-kit remeasurement bounces */
    lastMove: LastMoveInfo | null;
}

export interface LastMoveInfo {
    activeId: string;
    overId: string;
    oldIndex: number;
    newIndex: number;
}

// ── Actions ──────────────────────────────────────────────────────────

export type DndAction =
    | { type: 'DRAG_START'; id: string; playlist: Playlist | null; group: string | null }
    | { type: 'MOVE_TO_GROUP'; activeId: string; targetGroup: string; overId: string }
    | { type: 'REORDER_IN_GROUP'; activeId: string; overId: string }
    | { type: 'REORDER_GROUPS'; newOrder: string[] }
    | { type: 'SET_OPTIMISTIC'; playlists: Playlist[] }
    | { type: 'DRAG_END'; activeId: string }
    | { type: 'DRAG_CANCEL' }
    | { type: 'SYNC_FROM_SERVER'; playlists: Playlist[]; groupOrder: string[] }
    | { type: 'CLEAR_JUST_DROPPED' };

// ── Diff result ──────────────────────────────────────────────────────

export interface DragDiff {
    type: 'cross-group' | 'reorder' | 'none';
    activeId: string;
    /** Target group name (cross-group moves only) */
    targetGroup?: string;
    /** Ordered playlist IDs in the affected group */
    orderedIds?: string[];
}

import { arrayMove } from '@dnd-kit/sortable';
import type { Playlist } from '../../../../core/services/playlistService';
import type { DndState, DndAction } from './types';

export function createInitialDndState(groupedPlaylists: [string, Playlist[]][]): DndState {
    return {
        localPlaylists: groupedPlaylists.flatMap(([, ps]) => ps),
        localGroupOrder: groupedPlaylists.map(([g]) => g),
        activeId: null,
        activePlaylist: null,
        activeGroup: null,
        justDroppedId: null,
        isDragging: false,
        initialPlaylists: [],
        lastMove: null,
    };
}

export function dndReducer(state: DndState, action: DndAction): DndState {
    switch (action.type) {
        case 'DRAG_START': {
            return {
                ...state,
                activeId: action.id,
                activePlaylist: action.playlist,
                activeGroup: action.group,
                isDragging: true,
                initialPlaylists: [...state.localPlaylists],
                lastMove: null,
                justDroppedId: null,
            };
        }

        case 'MOVE_TO_GROUP': {
            const { activeId, targetGroup, overId } = action;
            const activeIdx = state.localPlaylists.findIndex(p => String(p.id) === activeId);
            if (activeIdx === -1) return state;

            const activePlaylist = state.localPlaylists[activeIdx];
            const currentGroup = activePlaylist.group || 'Ungrouped';
            if (currentGroup === targetGroup) return state;

            const updated: Playlist = {
                ...activePlaylist,
                group: targetGroup === 'Ungrouped' ? undefined : targetGroup,
            };
            const without = state.localPlaylists.filter(p => String(p.id) !== activeId);

            // Insert next to the "over" item, or at end of target group
            const overIndex = without.findIndex(p => String(p.id) === overId);
            if (overIndex !== -1) {
                without.splice(overIndex, 0, updated);
            } else {
                let insertIdx = without.length;
                for (let i = without.length - 1; i >= 0; i--) {
                    if ((without[i].group || 'Ungrouped') === targetGroup) {
                        insertIdx = i + 1;
                        break;
                    }
                }
                without.splice(insertIdx, 0, updated);
            }

            return {
                ...state,
                localPlaylists: [...without],
                lastMove: null,
            };
        }

        case 'REORDER_IN_GROUP': {
            const { activeId, overId } = action;
            const oldIndex = state.localPlaylists.findIndex(p => String(p.id) === activeId);
            const newIndex = state.localPlaylists.findIndex(p => String(p.id) === overId);

            if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return state;

            // Anti-bounce: skip if this is the exact reverse of the last move
            const last = state.lastMove;
            if (
                last &&
                last.activeId === activeId &&
                last.overId === overId &&
                last.oldIndex === newIndex &&
                last.newIndex === oldIndex
            ) {
                return state;
            }

            return {
                ...state,
                localPlaylists: arrayMove(state.localPlaylists, oldIndex, newIndex),
                lastMove: { activeId, overId, oldIndex, newIndex },
            };
        }

        case 'REORDER_GROUPS': {
            return {
                ...state,
                localGroupOrder: action.newOrder,
            };
        }

        case 'SET_OPTIMISTIC': {
            return {
                ...state,
                localPlaylists: action.playlists,
            };
        }

        case 'DRAG_END': {
            return {
                ...state,
                activeId: null,
                activePlaylist: null,
                activeGroup: null,
                isDragging: false,
                justDroppedId: action.activeId,
                lastMove: null,
            };
        }

        case 'DRAG_CANCEL': {
            return {
                ...state,
                localPlaylists: state.initialPlaylists,
                activeId: null,
                activePlaylist: null,
                activeGroup: null,
                isDragging: false,
                lastMove: null,
                justDroppedId: null,
            };
        }

        case 'SYNC_FROM_SERVER': {
            // Safety: never overwrite local state during drag
            if (state.isDragging) return state;

            const { playlists, groupOrder } = action;
            const playlistsChanged = !shallowEqualPlaylists(state.localPlaylists, playlists);
            const groupOrderChanged = !shallowEqualStringArrays(state.localGroupOrder, groupOrder);

            if (!playlistsChanged && !groupOrderChanged) return state;

            return {
                ...state,
                localPlaylists: playlistsChanged ? playlists : state.localPlaylists,
                localGroupOrder: groupOrderChanged ? groupOrder : state.localGroupOrder,
            };
        }

        case 'CLEAR_JUST_DROPPED': {
            return {
                ...state,
                justDroppedId: null,
            };
        }

        default:
            return state;
    }
}

// ── Comparison helpers (avoid JSON.stringify for better perf) ─────────

function shallowEqualPlaylists(a: Playlist[], b: Playlist[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id) return false;
        if (a[i].group !== b[i].group) return false;
        if (a[i].order !== b[i].order) return false;
    }
    return true;
}

function shallowEqualStringArrays(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

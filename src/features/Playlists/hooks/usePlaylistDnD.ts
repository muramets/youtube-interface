import { useCallback, useRef, useEffect, useLayoutEffect, useMemo, useReducer } from 'react';
import { flushSync } from 'react-dom';
import {
    useSensor,
    useSensors,
    MouseSensor,
    TouchSensor,
    KeyboardSensor,
    type DragStartEvent,
    type DragEndEvent,
    type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Playlist } from '../../../core/services/playlistService';
import { dndReducer, createInitialDndState } from './dnd/reducer';
import { resolveTargetGroup, buildOptimisticGroups, computeDragDiff } from './dnd/utils';

interface UsePlaylistDnDProps {
    groupedPlaylists: [string, Playlist[]][];
    onReorderGroups: (newOrder: string[]) => void;
    onReorderPlaylists: (newOrder: string[]) => void;
    onMovePlaylist: (id: string, newGroup: string, orderedIds: string[]) => void;
    onBatchNormalizeOrders: (orderUpdates: { id: string; order: number }[]) => void;
    sortBy?: 'default' | 'views' | 'updated' | 'created';
    onSortModeSwitch?: (optimisticData?: Playlist[]) => void;
}

const DND_SENSORS_CONFIG = {
    mouse: { activationConstraint: { distance: 8 } },
    touch: { activationConstraint: { delay: 200, tolerance: 5 } },
    keyboard: {},
};

/** Minimum ms between cross-group moves during drag */
const CROSS_GROUP_THROTTLE_MS = 50;

export const usePlaylistDnD = ({
    groupedPlaylists,
    onReorderGroups,
    onReorderPlaylists,
    onMovePlaylist,
    onBatchNormalizeOrders,
    sortBy = 'default',
    onSortModeSwitch,
}: UsePlaylistDnDProps) => {
    const [state, dispatch] = useReducer(dndReducer, groupedPlaylists, createInitialDndState);

    // Latest state ref — handlers read this to avoid stale closures.
    // useLayoutEffect guarantees the ref is updated before any new event handlers fire.
    const stateRef = useRef(state);
    useLayoutEffect(() => {
        stateRef.current = state;
    });

    // Cross-group move throttle — prevents render cascade that causes React error #185
    const lastCrossGroupMoveRef = useRef(0);

    // Skip counter for Firestore sync.
    // After an optimistic write, we increment this so the next sync cycle
    // (which arrives with stale data) is skipped. Each cycle decrements by 1.
    const pendingSyncSkipRef = useRef(0);

    // ── Sync from Firestore ──────────────────────────────────────────
    // Runs when groupedPlaylists (Firestore snapshot) changes or when drag ends.
    // Skipped during drag and when pending Firestore writes haven't propagated.
    useLayoutEffect(() => {
        if (state.isDragging) return;

        if (pendingSyncSkipRef.current > 0) {
            pendingSyncSkipRef.current -= 1;
            return;
        }

        const allPlaylists = groupedPlaylists.flatMap(([, ps]) => ps);
        const newGroupOrder = groupedPlaylists.map(([g]) => g);

        dispatch({
            type: 'SYNC_FROM_SERVER',
            playlists: allPlaylists,
            groupOrder: newGroupOrder,
        });
    }, [groupedPlaylists, state.isDragging]);

    // ── Optimistic grouped playlists ─────────────────────────────────
    const optimisticGroupedPlaylists = useMemo(() => {
        if (sortBy !== 'default') return groupedPlaylists;
        return buildOptimisticGroups(state.localPlaylists, state.localGroupOrder);
    }, [state.localPlaylists, state.localGroupOrder, sortBy, groupedPlaylists]);

    // ── Sensors ──────────────────────────────────────────────────────
    const sensors = useSensors(
        useSensor(MouseSensor, DND_SENSORS_CONFIG.mouse),
        useSensor(TouchSensor, DND_SENSORS_CONFIG.touch),
        useSensor(KeyboardSensor, DND_SENSORS_CONFIG.keyboard),
    );

    // ── handleDragStart ──────────────────────────────────────────────
    // Stable callback — reads localPlaylists from stateRef, not closure.
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const id = String(event.active.id);
        const { localPlaylists } = stateRef.current;

        let playlist: Playlist | null = null;
        let group: string | null = null;

        if (id.startsWith('group-')) {
            group = id.replace('group-', '');
        } else {
            playlist = localPlaylists.find(p => String(p.id) === id) || null;
        }

        dispatch({ type: 'DRAG_START', id, playlist, group });
    }, []);

    // ── Cursor lock ──────────────────────────────────────────────────
    useEffect(() => {
        if (state.activeId) {
            document.body.style.cursor = 'grabbing';
        } else {
            document.body.style.cursor = '';
        }
        return () => { document.body.style.cursor = ''; };
    }, [state.activeId]);

    // ── handleDragOver ───────────────────────────────────────────────
    // Stable callback — the ROOT FIX for the crash.
    // Old code had [localPlaylists] in deps → callback recreated on every state change
    // → dnd-kit re-registered handlers → MeasuringStrategy.Always triggered remeasure
    // → collision detection → onDragOver → state change → infinite loop.
    // Now reads state from stateRef → zero deps → stable reference → no cascade.
    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeIdStr = String(active.id);
        const overIdStr = String(over.id);
        if (activeIdStr === overIdStr) return;

        // Group reorder — dnd-kit handles visual feedback via transforms
        if (activeIdStr.startsWith('group-')) return;

        // Skip phantom placeholders — they're collision anchors only
        if (overIdStr.startsWith('placeholder-')) return;

        const { localPlaylists } = stateRef.current;
        const activePlaylist = localPlaylists.find(p => String(p.id) === activeIdStr);
        if (!activePlaylist) return;

        const currentGroup = activePlaylist.group || 'Ungrouped';
        const targetGroup = resolveTargetGroup(overIdStr, localPlaylists, currentGroup);

        if (currentGroup !== targetGroup) {
            // Cross-group move — throttle to prevent render cascade
            const now = Date.now();
            if (now - lastCrossGroupMoveRef.current < CROSS_GROUP_THROTTLE_MS) return;
            lastCrossGroupMoveRef.current = now;

            dispatch({ type: 'MOVE_TO_GROUP', activeId: activeIdStr, targetGroup, overId: overIdStr });
        } else if (!overIdStr.startsWith('group-')) {
            dispatch({ type: 'REORDER_IN_GROUP', activeId: activeIdStr, overId: overIdStr });
        }
    }, []);

    // ── handleDragEnd ────────────────────────────────────────────────
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active: dndActive, over } = event;
        const activeIdStr = String(dndActive.id);

        if (!over) {
            dispatch({ type: 'DRAG_CANCEL' });
            return;
        }

        const overIdStr = String(over.id);

        // ── Sorted mode → normalize orders + switch to manual ────────
        if (sortBy !== 'default') {
            const currentGroupOrder = groupedPlaylists.map(([name]) => name);

            // Normalize order per group to match current visual positions
            const normalizedPlaylists = groupedPlaylists.flatMap(([, playlists]) =>
                playlists.map((p, i) => ({ ...p, order: i })),
            );
            const orderUpdates = normalizedPlaylists.map(p => ({ id: p.id, order: p.order! }));
            onBatchNormalizeOrders(orderUpdates);

            // Group reorder in sorted mode
            if (activeIdStr.startsWith('group-')) {
                if (overIdStr.startsWith('group-')) {
                    const activeGrp = activeIdStr.replace('group-', '');
                    const overGrp = overIdStr.replace('group-', '');
                    const oldIdx = currentGroupOrder.indexOf(activeGrp);
                    const newIdx = currentGroupOrder.indexOf(overGrp);

                    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                        const newGroupOrder = arrayMove(currentGroupOrder, oldIdx, newIdx);
                        onReorderGroups(newGroupOrder);
                        dispatch({ type: 'REORDER_GROUPS', newOrder: newGroupOrder });
                    }
                }

                dispatch({ type: 'SET_OPTIMISTIC', playlists: normalizedPlaylists });
                pendingSyncSkipRef.current += 1;
                dispatch({ type: 'DRAG_END', activeId: activeIdStr });
                onSortModeSwitch?.(normalizedPlaylists);
                return;
            }

            // Playlist move/reorder in sorted mode
            const movedPlaylist = normalizedPlaylists.find(p => String(p.id) === activeIdStr);
            let optimisticData = normalizedPlaylists;

            if (movedPlaylist) {
                let targetGroup = movedPlaylist.group || 'Ungrouped';

                if (overIdStr.startsWith('placeholder-')) {
                    targetGroup = overIdStr.replace('placeholder-', '');
                } else if (overIdStr.startsWith('group-')) {
                    targetGroup = overIdStr.replace('group-', '');
                } else {
                    const overPlaylist = normalizedPlaylists.find(p => String(p.id) === overIdStr);
                    if (overPlaylist) {
                        targetGroup = overPlaylist.group || 'Ungrouped';
                    }
                }

                const currentGroup = movedPlaylist.group || 'Ungrouped';

                if (currentGroup !== targetGroup) {
                    // Cross-group move
                    const updatedPlaylists = normalizedPlaylists.map(p =>
                        String(p.id) === activeIdStr
                            ? { ...p, group: targetGroup === 'Ungrouped' ? undefined : targetGroup }
                            : p,
                    );
                    const playlistsInTargetGroup = updatedPlaylists.filter(
                        p => (p.group || 'Ungrouped') === targetGroup,
                    );
                    onMovePlaylist(activeIdStr, targetGroup, playlistsInTargetGroup.map(p => String(p.id)));
                    optimisticData = updatedPlaylists;
                } else if (!overIdStr.startsWith('group-')) {
                    // Within-group reorder
                    const originalGroupEntry = groupedPlaylists.find(([gName]) => gName === currentGroup);
                    const originalOrderedIds = originalGroupEntry
                        ? originalGroupEntry[1].map(p => String(p.id))
                        : [];

                    const oldIdx = originalOrderedIds.indexOf(activeIdStr);
                    const newIdx = originalOrderedIds.indexOf(overIdStr);

                    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                        const newOrderedIds = arrayMove(originalOrderedIds, oldIdx, newIdx);
                        onReorderPlaylists(newOrderedIds);
                        optimisticData = normalizedPlaylists.map(p => {
                            const orderIdx = newOrderedIds.indexOf(String(p.id));
                            return orderIdx !== -1 ? { ...p, order: orderIdx } : p;
                        });
                    }
                }
            }

            dispatch({ type: 'SET_OPTIMISTIC', playlists: optimisticData });
            pendingSyncSkipRef.current += 1;
            dispatch({ type: 'DRAG_END', activeId: activeIdStr });
            onSortModeSwitch?.(optimisticData);
            return;
        }

        // ── Default mode: group reorder ──────────────────────────────
        if (activeIdStr.startsWith('group-')) {
            if (overIdStr.startsWith('group-')) {
                const activeGrp = activeIdStr.replace('group-', '');
                const overGrp = overIdStr.replace('group-', '');
                const currentOrder = groupedPlaylists.map(([g]) => g);
                const oldIdx = currentOrder.indexOf(activeGrp);
                const newIdx = currentOrder.indexOf(overGrp);

                if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                    const newOrder = arrayMove(currentOrder, oldIdx, newIdx);
                    pendingSyncSkipRef.current += 1;

                    // flushSync: commit DOM before dnd-kit removes transforms
                    // Prevents "revert then update" flicker on group reorder
                    flushSync(() => {
                        dispatch({ type: 'REORDER_GROUPS', newOrder });
                    });

                    onReorderGroups(newOrder);
                }
            }

            dispatch({ type: 'DRAG_END', activeId: activeIdStr });
            return;
        }

        // ── Default mode: playlist move/reorder ──────────────────────
        const currentState = stateRef.current;
        const diff = computeDragDiff(currentState, activeIdStr);

        if (diff.type === 'cross-group') {
            onMovePlaylist(activeIdStr, diff.targetGroup!, diff.orderedIds!);
            pendingSyncSkipRef.current += 1;
        } else if (diff.type === 'reorder') {
            onReorderPlaylists(diff.orderedIds!);
            pendingSyncSkipRef.current += 1;
        }

        dispatch({ type: 'DRAG_END', activeId: activeIdStr });
        setTimeout(() => dispatch({ type: 'CLEAR_JUST_DROPPED' }), 50);
    }, [
        sortBy, groupedPlaylists,
        onReorderGroups, onReorderPlaylists, onMovePlaylist,
        onBatchNormalizeOrders, onSortModeSwitch,
    ]);

    const clearJustDropped = useCallback(() => {
        dispatch({ type: 'CLEAR_JUST_DROPPED' });
    }, []);

    return {
        sensors,
        active: {
            id: state.activeId,
            playlist: state.activePlaylist,
            group: state.activeGroup,
        },
        justDroppedId: state.justDroppedId,
        clearJustDropped,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        optimisticGroupedPlaylists,
    };
};

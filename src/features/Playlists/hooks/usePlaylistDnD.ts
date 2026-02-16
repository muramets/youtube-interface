import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
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

interface UsePlaylistDnDProps {
    groupedPlaylists: [string, Playlist[]][];
    onReorderGroups: (newOrder: string[]) => void;
    onReorderPlaylists: (newOrder: string[]) => void;
    onMovePlaylist: (id: string, newGroup: string, orderedIds: string[]) => void;
    onBatchNormalizeOrders: (orderUpdates: { id: string; order: number }[]) => void;
    sortBy?: 'default' | 'views' | 'updated' | 'created';
    onSortModeSwitch?: (optimisticData?: Playlist[]) => void; // Pass optional optimistic data
}

const DND_SENSORS_CONFIG = {
    mouse: { activationConstraint: { distance: 8 } },
    touch: { activationConstraint: { delay: 200, tolerance: 5 } },
    keyboard: {},
};

export const usePlaylistDnD = ({
    groupedPlaylists,
    onReorderGroups,
    onReorderPlaylists,
    onMovePlaylist,
    onBatchNormalizeOrders,
    sortBy = 'default',
    onSortModeSwitch
}: UsePlaylistDnDProps) => {
    const [active, setActive] = useState<{
        id: string | null;
        playlist: Playlist | null;
        group: string | null;
    }>({ id: null, playlist: null, group: null });

    const [justDroppedId, setJustDroppedId] = useState<string | null>(null);

    // Local State for Optimistic UI
    const [localPlaylists, setLocalPlaylists] = useState<Playlist[]>(() => {
        return groupedPlaylists.flatMap(([, ps]) => ps);
    });
    const localPlaylistsRef = useRef<Playlist[]>(localPlaylists);
    const [localGroupOrder, setLocalGroupOrder] = useState<string[]>(() => {
        return groupedPlaylists.map(([g]) => g);
    });
    const isDraggingRef = useRef(false);
    // Version counter pattern: increment when we want to skip the next sync
    // Both are state to allow safe access during render (React Compiler compliant)
    const [syncSkipVersion, setSyncSkipVersion] = useState(0);
    const [lastProcessedVersion, setLastProcessedVersion] = useState(0);

    // Sync local state when props change (if not dragging)
    // Note: We use a ref to track if sync should be skipped to avoid setState cascade
    const shouldSkipSyncRef = useRef(false);
    // Track initial state at drag start for diffing at drag end
    const initialPlaylistsRef = useRef<Playlist[]>([]);
    // Anti-bounce: track last within-group move to prevent dnd-kit remeasurement oscillation
    const lastMoveRef = useRef<{ activeId: string; overId: string; oldIndex: number; newIndex: number } | null>(null);

    // Update the skip flag when versions mismatch
    // Update the skip flag BEFORE the sync layout effect checks it
    // Must be useLayoutEffect (not useEffect) because the sync below is also useLayoutEffect.
    // React runs layout effects top-to-bottom, so this runs first.
    useLayoutEffect(() => {
        shouldSkipSyncRef.current = syncSkipVersion > lastProcessedVersion;
    }, [syncSkipVersion, lastProcessedVersion]);

    // Keep ref in sync with committed state (for handleDragEnd to read latest)
    useEffect(() => {
        localPlaylistsRef.current = localPlaylists;
    }, [localPlaylists]);

    useLayoutEffect(() => {
        if (!isDraggingRef.current) {
            // If we just performed a mode switch via drag, skip this sync cycle
            if (shouldSkipSyncRef.current) {
                // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: need to mark version as processed before returning
                setLastProcessedVersion(syncSkipVersion);
                return;
            }


            const allPlaylists = groupedPlaylists.flatMap(([, ps]) => ps);
            const newGroupOrder = groupedPlaylists.map(([g]) => g);

            // Prevent infinite loop by checking if state actually needs validation
            setLocalPlaylists(prev => {
                if (JSON.stringify(prev) === JSON.stringify(allPlaylists)) return prev;
                return allPlaylists;
            });

            setLocalGroupOrder(prev => {
                if (JSON.stringify(prev) === JSON.stringify(newGroupOrder)) return prev;
                return newGroupOrder;
            });
        }
    }, [groupedPlaylists, syncSkipVersion]);

    // Optimistic UI: only use local state when in default/manual sort mode
    // In other sort modes, return groupedPlaylists directly to preserve external sort
    const optimisticGroupedPlaylists = useMemo(() => {
        // In non-default sort modes, always return the externally-sorted data
        if (sortBy !== 'default') {
            return groupedPlaylists;
        }

        // In default mode, ALWAYS rebuild from localPlaylists.
        // localPlaylists is synced from groupedPlaylists via the sync effect
        // when there are no pending changes, so they are equivalent.
        // Previously we fell back to groupedPlaylists when !active.id && !hasPendingSkip,
        // but this caused a 1-frame revert to old order after drag end because
        // setLastProcessedVersion clears hasPendingSkip before the backend write
        // propagates back to groupedPlaylists.

        // Rebuild groups from local state
        const groups: Record<string, Playlist[]> = {};

        // Initialize groups from localGroupOrder
        localGroupOrder.forEach(g => {
            groups[g] = [];
        });

        // Group local playlists (preserving array order)
        localPlaylists.forEach(p => {
            const groupName = p.group || 'Ungrouped';
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(p);
        });

        // Sort groups
        const result = Object.entries(groups).sort(([keyA], [keyB]) => {
            const indexA = localGroupOrder.indexOf(keyA);
            const indexB = localGroupOrder.indexOf(keyB);

            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            if (keyA === 'Ungrouped') return 1;
            if (keyB === 'Ungrouped') return -1;
            return keyA.localeCompare(keyB);
        });

        return result;
    }, [localPlaylists, localGroupOrder, sortBy, groupedPlaylists]);


    const sensors = useSensors(
        useSensor(MouseSensor, DND_SENSORS_CONFIG.mouse),
        useSensor(TouchSensor, DND_SENSORS_CONFIG.touch),
        useSensor(KeyboardSensor, DND_SENSORS_CONFIG.keyboard)
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const id = String(event.active.id);

        setJustDroppedId(null);
        isDraggingRef.current = true;
        // Capture initial state
        initialPlaylistsRef.current = [...localPlaylists];
        lastMoveRef.current = null;

        let playlist: Playlist | null = null;
        let group: string | null = null;

        if (id.startsWith('group-')) {
            group = id.replace('group-', '');
        } else {
            playlist = localPlaylists.find(p => String(p.id) === id) || null;
        }

        setActive({ id, playlist, group });
    }, [localPlaylists]);

    // Global cursor lock during drag
    useEffect(() => {
        if (active.id) {
            document.body.style.cursor = 'grabbing';
        } else {
            document.body.style.cursor = '';
        }
        return () => { document.body.style.cursor = ''; };
    }, [active.id]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeIdStr = String(active.id);
        const overIdStr = String(over.id);
        if (activeIdStr === overIdStr) return;

        // Group Reordering - DISABLED
        // We no longer update localGroupOrder during drag.
        // dnd-kit's SortableContext handles visual reordering via transforms.
        // The actual order change happens only in handleDragEnd.
        if (activeIdStr.startsWith('group-') && overIdStr.startsWith('group-')) {
            // No-op: let dnd-kit handle visual feedback
            return;
        }

        // Playlist Moving/Reordering
        if (!activeIdStr.startsWith('group-')) {
            const activePlaylist = localPlaylists.find(p => String(p.id) === activeIdStr);
            if (!activePlaylist) return;

            // Skip migration for phantom placeholders — keep them mounted as collision targets.
            // The actual group move is handled in handleDragEnd.
            if (overIdStr.startsWith('placeholder-')) {
                return;
            }

            // Determine Target Group
            let targetGroup = activePlaylist.group || 'Ungrouped';

            // Check for droppable zone (group-drop-{name}) or sortable group (group-{name})
            if (overIdStr.startsWith('group-drop-')) {
                targetGroup = overIdStr.replace('group-drop-', '');
            } else if (overIdStr.startsWith('group-')) {
                targetGroup = overIdStr.replace('group-', '');
            } else {
                const overPlaylist = localPlaylists.find(p => String(p.id) === overIdStr);
                if (overPlaylist) {
                    targetGroup = overPlaylist.group || 'Ungrouped';
                }
            }

            // Update Local State
            const currentGroup = activePlaylist.group || 'Ungrouped';
            if (currentGroup !== targetGroup) {
                // Moved to different group — remove from old position and insert next to 'over'
                setLocalPlaylists(prev => {
                    // Use prev (latest state) to find the active playlist, not the stale closure
                    const activeInPrev = prev.find(p => String(p.id) === activeIdStr);
                    if (!activeInPrev) return prev;

                    // Check if move is still needed (might have been done by previous setState)
                    const currentGroupInPrev = activeInPrev.group || 'Ungrouped';
                    if (currentGroupInPrev === targetGroup) return prev; // Already moved

                    const updated = { ...activeInPrev, group: targetGroup === 'Ungrouped' ? undefined : targetGroup };
                    const without = prev.filter(p => String(p.id) !== activeIdStr);

                    // Find where to insert: next to the 'over' item, or at end of group
                    const overIndex = without.findIndex(p => String(p.id) === overIdStr);
                    if (overIndex !== -1) {
                        // Insert BEFORE the 'over' item (standard sortable behavior)
                        without.splice(overIndex, 0, updated);
                    } else {
                        // Dropped on group header or placeholder — append to end of group
                        // Find the last item in the target group
                        let insertIdx = without.length;
                        for (let i = without.length - 1; i >= 0; i--) {
                            if ((without[i].group || 'Ungrouped') === targetGroup) {
                                insertIdx = i + 1;
                                break;
                            }
                        }
                        without.splice(insertIdx, 0, updated);
                    }

                    const result: Playlist[] = [...without];
                    localPlaylistsRef.current = result;
                    return result;
                });
            } else {
                // Reordering within same group (Live Pattern)
                // Since we use MeasuringStrategy.Always, we can safely mutate the DOM
                // without dnd-kit calculating stale transforms.
                if (!overIdStr.startsWith('group-')) {
                    setLocalPlaylists(prev => {
                        const oldIndex = prev.findIndex(p => String(p.id) === activeIdStr);
                        const newIndex = prev.findIndex(p => String(p.id) === overIdStr);
                        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                            // Anti-bounce: if this is the exact reverse of the last move
                            // (same pair, indices swapped), skip it — it's a dnd-kit remeasurement bounce
                            const last = lastMoveRef.current;
                            if (last && last.activeId === activeIdStr && last.overId === overIdStr
                                && last.oldIndex === newIndex && last.newIndex === oldIndex) {
                                return prev; // Skip bounce
                            }
                            lastMoveRef.current = { activeId: activeIdStr, overId: overIdStr, oldIndex, newIndex };
                            const result = arrayMove(prev, oldIndex, newIndex);
                            localPlaylistsRef.current = result;
                            return result;
                        }
                        return prev;
                    });
                }
            }
        }
    }, [localPlaylists]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active: dndActive, over } = event;
        const activeIdStr = String(dndActive.id);

        const cleanup = () => {
            isDraggingRef.current = false;
            setActive({ id: null, playlist: null, group: null });
            setJustDroppedId(activeIdStr);
            setTimeout(() => setJustDroppedId(null), 50);
        };

        if (!over) {
            cleanup();
            return;
        }

        // Auto-switch to Manual mode when dragging in any sorted mode
        if (sortBy !== 'default') {
            const currentGroupOrder = groupedPlaylists.map(([name]) => name);

            // Capture visual baseline: normalize order PER GROUP (not globally).
            // Each group gets 0-based sequential order matching current visual positions.
            // This "resets" manual order to match the sorted view the user sees.
            const normalizedPlaylists = groupedPlaylists.flatMap(([, playlists]) =>
                playlists.map((p, i) => ({ ...p, order: i }))
            );

            // Persist normalized order for ALL groups to Firestore.
            // Without this, the Firestore snapshot would overwrite the optimistic
            // cache with old order values for non-dragged groups.
            const orderUpdates = normalizedPlaylists.map(p => ({ id: p.id, order: p.order! }));
            onBatchNormalizeOrders(orderUpdates);
            // Group Reorder
            if (activeIdStr.startsWith('group-')) {
                const overIdStr = String(over.id);
                if (overIdStr.startsWith('group-')) {
                    const activeGrp = activeIdStr.replace('group-', '');
                    const overGrp = overIdStr.replace('group-', '');

                    const oldIdx = currentGroupOrder.indexOf(activeGrp);
                    const newIdx = currentGroupOrder.indexOf(overGrp);

                    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                        const newGroupOrder = arrayMove(currentGroupOrder, oldIdx, newIdx);

                        // Persist to Firestore
                        onReorderGroups(newGroupOrder);

                        // Update local state and block next sync
                        setLocalGroupOrder(newGroupOrder);
                        setSyncSkipVersion(v => v + 1);
                        cleanup();
                    } else {
                        cleanup();
                    }
                } else {
                    cleanup();
                }

                // Switch to default mode with full visual baseline
                onSortModeSwitch?.(normalizedPlaylists);
                return;
            }

            // Playlist reorder/move
            const movedPlaylist = normalizedPlaylists.find(p => String(p.id) === activeIdStr);
            if (movedPlaylist) {
                const overIdStr = String(over.id);
                let targetGroup = movedPlaylist.group || 'Ungrouped';

                // Determine target group
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
                    // Move to different group
                    const updatedPlaylists = normalizedPlaylists.map(p =>
                        String(p.id) === activeIdStr
                            ? { ...p, group: targetGroup === 'Ungrouped' ? undefined : targetGroup }
                            : p
                    );

                    const playlistsInTargetGroup = updatedPlaylists.filter(
                        p => (p.group || 'Ungrouped') === targetGroup
                    );
                    const orderedIds = playlistsInTargetGroup.map(p => String(p.id));

                    onMovePlaylist(activeIdStr, targetGroup, orderedIds);
                    setLocalPlaylists(updatedPlaylists);
                    setSyncSkipVersion(v => v + 1);

                    cleanup();
                    onSortModeSwitch?.(updatedPlaylists);
                    return;
                } else if (!overIdStr.startsWith('group-')) {
                    // Reorder within same group — compute new order from active/over IDs
                    const originalGroupEntry = groupedPlaylists.find(([gName]) => gName === currentGroup);
                    const originalOrderedIds = originalGroupEntry
                        ? originalGroupEntry[1].map(p => String(p.id))
                        : [];

                    const oldIdx = originalOrderedIds.indexOf(activeIdStr);
                    const newIdx = originalOrderedIds.indexOf(overIdStr);

                    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                        const newOrderedIds = arrayMove(originalOrderedIds, oldIdx, newIdx);
                        onReorderPlaylists(newOrderedIds);
                        setSyncSkipVersion(v => v + 1);

                        // Rebuild with reorder applied
                        // We use the full localPlaylists list to ensure global indices are correct if needed,
                        // but here we just need to assign the new 'order' property.
                        // Actually, simpler to just map the new order to the items.
                        const reorderedPlaylists = localPlaylists.map((p) => {
                            const orderIdx = newOrderedIds.indexOf(String(p.id));
                            return orderIdx !== -1 ? { ...p, order: orderIdx } : { ...p, order: 9999 };
                        });
                        cleanup();
                        onSortModeSwitch?.(reorderedPlaylists);
                        return;
                    }
                }
            }

            // Fallback: no reorder detected, switch mode with visual baseline
            onSortModeSwitch?.(normalizedPlaylists);
            return;
        }

        // Normal handling when already in default mode
        // Group Reorder Persist
        if (activeIdStr.startsWith('group-')) {
            const overIdStr = String(over.id);

            // Only persist if dropped over another group
            if (overIdStr.startsWith('group-')) {
                const activeGrp = activeIdStr.replace('group-', '');
                const overGrp = overIdStr.replace('group-', '');

                // Calculate new order based on where we dropped
                const currentOrder = groupedPlaylists.map(g => g[0]);
                const oldIdx = currentOrder.indexOf(activeGrp);
                const newIdx = currentOrder.indexOf(overGrp);


                if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                    const newOrder = arrayMove(currentOrder, oldIdx, newIdx);



                    // Set flag BEFORE flushSync so the synchronous re-render sees it
                    setSyncSkipVersion(v => v + 1);

                    // Use flushSync to force immediate DOM update before dnd-kit removes transforms
                    // This prevents the "revert then update" flicker
                    flushSync(() => {
                        setLocalGroupOrder(newOrder);
                    });

                    onReorderGroups(newOrder);
                }
            }

            return;
        }

        // Playlist Persist (Simpler Diff Strategy)
        // We compare the final state (localPlaylistsRef) with the initial state (initialPlaylistsRef)
        // to determine if a move or reorder occurred.
        // NOTE: We use the REF (not the closure) because handleDragOver's setLocalPlaylists
        // may not have committed to a React render yet, but the ref is updated synchronously.
        const latestPlaylists = localPlaylistsRef.current;
        const movedPlaylist = latestPlaylists.find(p => String(p.id) === activeIdStr);
        const originalPlaylist = initialPlaylistsRef.current.find(p => String(p.id) === activeIdStr);

        if (movedPlaylist && originalPlaylist) {
            const finalGroup = movedPlaylist.group || 'Ungrouped';
            const initialGroup = originalPlaylist.group || 'Ungrouped';

            if (finalGroup !== initialGroup) {
                // Cross-Group Move
                const groupItems = latestPlaylists.filter(p => (p.group || 'Ungrouped') === finalGroup);
                const newOrderedIds = groupItems.map(p => String(p.id));

                onMovePlaylist(activeIdStr, finalGroup, newOrderedIds);
                setSyncSkipVersion(v => v + 1);
                cleanup();
            } else {
                // Within-Group Reorder?
                // We need to check if the ORDER in this group changed.
                const finalGroupItems = latestPlaylists.filter(p => (p.group || 'Ungrouped') === finalGroup);
                const initialGroupItems = initialPlaylistsRef.current.filter(p => (p.group || 'Ungrouped') === finalGroup);

                const finalIds = finalGroupItems.map(p => String(p.id));
                const initialIds = initialGroupItems.map(p => String(p.id));

                if (JSON.stringify(finalIds) !== JSON.stringify(initialIds)) {
                    onReorderPlaylists(finalIds);
                    setSyncSkipVersion(v => v + 1);
                    cleanup();
                } else {
                    cleanup();
                }
            }
        } else {
            cleanup();
        }

    }, [groupedPlaylists, localPlaylists, onReorderGroups, onReorderPlaylists, onMovePlaylist, onBatchNormalizeOrders, sortBy, onSortModeSwitch, setSyncSkipVersion, setLocalPlaylists, setLocalGroupOrder]);

    const clearJustDropped = useCallback(() => setJustDroppedId(null), []);

    return {
        sensors,
        active,
        justDroppedId,
        clearJustDropped,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        optimisticGroupedPlaylists
    };
};

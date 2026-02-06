import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
    const [localPlaylists, setLocalPlaylists] = useState<Playlist[]>([]);
    const [localGroupOrder, setLocalGroupOrder] = useState<string[]>([]);
    const isDraggingRef = useRef(false);
    // Version counter pattern: increment when we want to skip the next sync
    // Both are state to allow safe access during render (React Compiler compliant)
    const [syncSkipVersion, setSyncSkipVersion] = useState(0);
    const [lastProcessedVersion, setLastProcessedVersion] = useState(0);

    // Sync local state when props change (if not dragging)
    // Note: We use a ref to track if sync should be skipped to avoid setState cascade
    const shouldSkipSyncRef = useRef(false);

    // Update the skip flag when versions mismatch
    useEffect(() => {
        shouldSkipSyncRef.current = syncSkipVersion > lastProcessedVersion;
    }, [syncSkipVersion, lastProcessedVersion]);

    useEffect(() => {
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
        // If not actively dragging AND not waiting for sync (pending persist), return original
        // This prevents flickering on cancel, but allows local state to persist after drop
        // Check if we're in a "skip sync" state by comparing versions (both are state, safe for render)
        const hasPendingSkip = syncSkipVersion > lastProcessedVersion;
        if (!active.id && !hasPendingSkip) {
            return groupedPlaylists;
        }

        // If not in default mode, return groupedPlaylists directly
        if (sortBy !== 'default') {
            return groupedPlaylists;
        }

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
    }, [localPlaylists, localGroupOrder, sortBy, groupedPlaylists, active.id, syncSkipVersion, lastProcessedVersion]);


    const sensors = useSensors(
        useSensor(MouseSensor, DND_SENSORS_CONFIG.mouse),
        useSensor(TouchSensor, DND_SENSORS_CONFIG.touch),
        useSensor(KeyboardSensor, DND_SENSORS_CONFIG.keyboard)
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const id = String(event.active.id);

        setJustDroppedId(null);
        isDraggingRef.current = true;

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

            // Determine Target Group
            let targetGroup = activePlaylist.group || 'Ungrouped';

            // Check for phantom placeholder (placeholder-{groupName}), droppable zone (group-drop-{name}), or sortable group (group-{name})
            if (overIdStr.startsWith('placeholder-')) {
                targetGroup = overIdStr.replace('placeholder-', '');
            } else if (overIdStr.startsWith('group-drop-')) {
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
                // Moved to different group
                setLocalPlaylists(prev => {
                    return prev.map(p => {
                        if (String(p.id) === activeIdStr) {
                            return { ...p, group: targetGroup === 'Ungrouped' ? undefined : targetGroup };
                        }
                        return p;
                    });
                });
            } else {
                // Reordering within same group
                if (!overIdStr.startsWith('group-')) {
                    const oldIndex = localPlaylists.findIndex(p => String(p.id) === activeIdStr);
                    const newIndex = localPlaylists.findIndex(p => String(p.id) === overIdStr);
                    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                        setLocalPlaylists(prev => arrayMove(prev, oldIndex, newIndex));
                    }
                }
            }
        }
    }, [localPlaylists]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active: dndActive, over } = event;
        const activeIdStr = String(dndActive.id);

        isDraggingRef.current = false;
        setActive({ id: null, playlist: null, group: null });
        setJustDroppedId(activeIdStr);
        setTimeout(() => setJustDroppedId(null), 50);

        if (!over) {
            return;
        }

        // Auto-switch to Manual mode when dragging in any sorted mode
        if (sortBy !== 'default') {
            // Capture current visual order BEFORE switching
            const allPlaylists = groupedPlaylists.flatMap(([, playlists]) => playlists);
            const currentGroupOrder = groupedPlaylists.map(([name]) => name);

            // FIRST: Execute the drag operation on captured visual order
            // This ensures the operation completes with correct indices BEFORE mode switch

            // Group Reorder
            if (activeIdStr.startsWith('group-')) {
                const overIdStr = String(over.id);
                if (overIdStr.startsWith('group-')) {
                    const activeGrp = activeIdStr.replace('group-', '');
                    const overGrp = overIdStr.replace('group-', '');

                    const oldIdx = currentGroupOrder.indexOf(activeGrp);
                    const newIdx = currentGroupOrder.indexOf(overGrp);

                    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
                        const newGroupOrder = [...currentGroupOrder];
                        const [movedGroup] = newGroupOrder.splice(oldIdx, 1);
                        newGroupOrder.splice(newIdx, 0, movedGroup);

                        // Save to Firestore FIRST
                        onReorderGroups(newGroupOrder);

                        // Update local state and block next sync
                        setLocalGroupOrder(newGroupOrder);
                        setSyncSkipVersion(v => v + 1);
                    }
                }

                // THEN: Switch mode (will trigger re-render with new mode)
                onSortModeSwitch?.();
                return;
            }

            // Playlist reorder/move
            const movedPlaylist = allPlaylists.find(p => String(p.id) === activeIdStr);
            if (movedPlaylist) {
                const overIdStr = String(over.id);
                let targetGroup = movedPlaylist.group || 'Ungrouped';

                // Determine target group
                if (overIdStr.startsWith('group-')) {
                    targetGroup = overIdStr.replace('group-', '');
                } else {
                    const overPlaylist = allPlaylists.find(p => String(p.id) === overIdStr);
                    if (overPlaylist) {
                        targetGroup = overPlaylist.group || 'Ungrouped';
                    }
                }

                const currentGroup = movedPlaylist.group || 'Ungrouped';

                if (currentGroup !== targetGroup) {
                    // Move to different group
                    const updatedPlaylists = allPlaylists.map(p =>
                        String(p.id) === activeIdStr
                            ? { ...p, group: targetGroup === 'Ungrouped' ? undefined : targetGroup }
                            : p
                    );

                    const playlistsInTargetGroup = updatedPlaylists.filter(
                        p => (p.group || 'Ungrouped') === targetGroup
                    );
                    const orderedIds = playlistsInTargetGroup.map(p => String(p.id));

                    // Save to Firestore FIRST
                    onMovePlaylist(activeIdStr, targetGroup, orderedIds);

                    // Update local state and block next sync
                    setLocalPlaylists(updatedPlaylists);
                    setSyncSkipVersion(v => v + 1);

                    // THEN: Switch mode with optimistic data (batched update)
                    onSortModeSwitch?.(updatedPlaylists);
                } else if (!overIdStr.startsWith('group-')) {
                    // Reorder within same group
                    const oldIndex = allPlaylists.findIndex(p => String(p.id) === activeIdStr);
                    const newIndex = allPlaylists.findIndex(p => String(p.id) === overIdStr);

                    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                        const newOrder = [...allPlaylists];
                        const [moved] = newOrder.splice(oldIndex, 1);
                        newOrder.splice(newIndex, 0, moved);

                        const playlistsInGroup = newOrder.filter(
                            p => (p.group || 'Ungrouped') === currentGroup
                        );
                        const orderedIds = playlistsInGroup.map(p => String(p.id));

                        // Save to Firestore FIRST
                        onReorderPlaylists(orderedIds);

                        // Update local state and block next sync
                        setLocalPlaylists(newOrder);
                        setSyncSkipVersion(v => v + 1);

                        // THEN: Switch mode with optimistic data (batched update)
                        onSortModeSwitch?.(newOrder);
                    }
                }
            }

            // THEN: Switch mode (will trigger re-render with new mode and data from Firestore)
            onSortModeSwitch?.();
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

        // Playlist Persist
        const movedPlaylist = localPlaylists.find(p => String(p.id) === activeIdStr);
        const overIdStr = String(over.id);

        if (movedPlaylist) {
            // Determine target group
            let targetGroup = movedPlaylist.group || 'Ungrouped';
            if (overIdStr.startsWith('group-')) {
                targetGroup = overIdStr.replace('group-', '');
            } else {
                const overPlaylist = localPlaylists.find(p => String(p.id) === overIdStr);
                if (overPlaylist) {
                    targetGroup = overPlaylist.group || 'Ungrouped';
                }
            }

            const currentGroup = movedPlaylist.group || 'Ungrouped';

            // Find original playlist to check if group changed
            const originalPlaylist = groupedPlaylists.flatMap(g => g[1]).find(p => String(p.id) === activeIdStr);

            if (originalPlaylist && (originalPlaylist.group || 'Ungrouped') !== targetGroup) {
                // Group Change - update localPlaylists with new group
                const updatedPlaylists = localPlaylists.map(p =>
                    String(p.id) === activeIdStr
                        ? { ...p, group: targetGroup === 'Ungrouped' ? undefined : targetGroup }
                        : p
                );
                setLocalPlaylists(updatedPlaylists);

                const playlistsInTargetGroup = updatedPlaylists.filter(
                    p => (p.group || 'Ungrouped') === targetGroup
                );
                const orderedIds = playlistsInTargetGroup.map(p => String(p.id));

                onMovePlaylist(activeIdStr, targetGroup, orderedIds);
                setSyncSkipVersion(v => v + 1);
            } else if (!overIdStr.startsWith('group-')) {
                // Reorder within group - compute final order
                const oldIndex = localPlaylists.findIndex(p => String(p.id) === activeIdStr);
                const newIndex = localPlaylists.findIndex(p => String(p.id) === overIdStr);

                if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
                    const newOrder = arrayMove(localPlaylists, oldIndex, newIndex);
                    setLocalPlaylists(newOrder);

                    const playlistsInGroup = newOrder.filter(
                        p => (p.group || 'Ungrouped') === currentGroup
                    );
                    const orderedIds = playlistsInGroup.map(p => String(p.id));

                    onReorderPlaylists(orderedIds);
                    setSyncSkipVersion(v => v + 1);
                }
            }
        }

    }, [groupedPlaylists, localPlaylists, onReorderGroups, onReorderPlaylists, onMovePlaylist, sortBy, onSortModeSwitch, setSyncSkipVersion, setLocalPlaylists, setLocalGroupOrder]);

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

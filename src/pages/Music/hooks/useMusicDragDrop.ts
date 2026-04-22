// =============================================================================
// MUSIC DnD: Hook for Track → Playlist & Track → Track drag-and-drop
// =============================================================================
// Handles drag start/end events for music tracks being dragged onto
// playlist items in the sidebar OR onto other tracks for version grouping.
// Works alongside useTrendsDragDrop inside the shared DndContext (AppDndProvider).
// =============================================================================

import { useState, useCallback, useMemo } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Track } from '../../../core/types/music/track';
import { useMusicStore } from '../../../core/stores/music/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

export interface MusicDragDropState {
    draggedTrack: Track | null;
    isDraggingMusic: boolean;
}

export const useMusicDragDrop = () => {
    // Stable actions — created once, references never change, no subscription needed
    const { addTracksToPlaylist, linkAsVersion, linkAsVersionAndReorder, unlinkFromGroup, setDraggingTrackId } = useMusicStore.getState();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [draggedTrack, setDraggedTrack] = useState<Track | null>(null);

    const isDraggingMusic = draggedTrack !== null;

    const handleMusicDragStart = useCallback((event: DragStartEvent) => {
        const track = event.active.data.current?.track as Track | undefined;
        const type = event.active.data.current?.type as string | undefined;
        if (type === 'music-track' && track) {
            setDraggedTrack(track);
            setDraggingTrackId(track.id);
        } else if ((type === 'playlist-sort' || type === 'group-child-sort') && track) {
            // Set ghost only — no global dim (useSortable handles visual feedback internally)
            setDraggedTrack(track);
        }
    }, [setDraggingTrackId]);

    const handleMusicDragEnd = useCallback((event: DragEndEvent) => {
        const activeType = event.active.data.current?.type;
        const overType = event.over?.data.current?.type as string | undefined;

        // playlist-sort and group-child-sort are handled locally by their
        // respective useDndMonitor hooks. We only clean up ghost state here —
        // UNLESS the drop target is a playlist, in which case we fall through
        // to handle the playlist add.
        if (activeType === 'playlist-sort' || activeType === 'group-child-sort') {
            if (overType !== 'music-playlist') {
                // group-child-sort dropped "outside" (no target, or target is not
                // a group member / link target) → detach from group.
                // Note: BetweenDropZone ('between-sort-zone') can catch the pointer
                // even when visually "outside", so we check overType semantically.
                const isOverGroupOrLink = overType === 'group-child-sort'
                    || overType === 'music-track-target'
                    || overType === 'music-group-target';
                if (activeType === 'group-child-sort' && !isOverGroupOrLink && draggedTrack?.groupId) {
                    // Target the track's own library — same rule as every
                    // other track mutation.
                    if (draggedTrack.ownerUserId && draggedTrack.ownerChannelId) {
                        unlinkFromGroup(draggedTrack.ownerUserId, draggedTrack.ownerChannelId, draggedTrack.id);
                    }
                }
                setDraggingTrackId(null);
                setDraggedTrack(null);
                return;
            }
        }
        const { over } = event;

        if (over && draggedTrack) {
            const dropType = over.data.current?.type as string | undefined;
            const userId = user?.uid || '';
            const channelId = currentChannel?.id || '';

            if (dropType === 'music-playlist' && userId && channelId) {
                const playlistId = over.data.current?.playlistId as string | undefined;
                if (playlistId) {
                    // Record source library if dragging a shared-library track into
                    // an own-library playlist. Owner of target playlist is resolved
                    // by addTracksToPlaylist from the playlist itself.
                    const sources = draggedTrack.ownerUserId !== userId || draggedTrack.ownerChannelId !== channelId
                        ? { [draggedTrack.id]: { ownerUserId: draggedTrack.ownerUserId, ownerChannelId: draggedTrack.ownerChannelId } }
                        : undefined;
                    addTracksToPlaylist(playlistId, [draggedTrack.id], sources);
                }
            } else if (dropType === 'music-track-target') {
                const targetTrackId = over.data.current?.trackId as string | undefined;
                const targetGroupId = over.data.current?.groupId as string | undefined;

                if (targetTrackId && targetTrackId !== draggedTrack.id) {
                    const { tracks, sharedTracks } = useMusicStore.getState();
                    const targetTrack = tracks.find(t => t.id === targetTrackId)
                        ?? sharedTracks.find(t => t.id === targetTrackId);
                    const resolvedTargetGroupId = targetGroupId ?? targetTrack?.groupId;
                    const sameGroup = draggedTrack.groupId
                        && resolvedTargetGroupId
                        && draggedTrack.groupId === resolvedTargetGroupId;
                    // Only link when source and target come from the same library —
                    // cross-library grouping isn't a supported operation.
                    const sameLibrary = targetTrack
                        && targetTrack.ownerUserId === draggedTrack.ownerUserId
                        && targetTrack.ownerChannelId === draggedTrack.ownerChannelId;
                    if (!sameGroup && sameLibrary) {
                        linkAsVersion(draggedTrack.ownerUserId, draggedTrack.ownerChannelId, draggedTrack.id, targetTrackId);
                    }
                }

            } else if (dropType === 'music-group-target') {
                const targetGroupId = over.data.current?.groupId as string | undefined;
                const representativeTrackId = over.data.current?.representativeTrackId as string | undefined;
                const insertIdx = (over.data.current?.insertionIndex as number) ?? -1;

                if (representativeTrackId && representativeTrackId !== draggedTrack.id && targetGroupId) {
                    if (draggedTrack.groupId !== targetGroupId) {
                        // Single atomic write: sets groupId + final groupOrder in one Firestore batch.
                        // Avoids the intermediate Firestore snapshot that caused tracks to swap
                        // when linkAsVersion + reorderGroupTracks fired as two separate writes.
                        linkAsVersionAndReorder(draggedTrack.ownerUserId, draggedTrack.ownerChannelId, draggedTrack.id, representativeTrackId, insertIdx);
                    }
                }
            }
        }

        setDraggingTrackId(null);
        setDraggedTrack(null);
    }, [draggedTrack, user?.uid, currentChannel?.id, addTracksToPlaylist, linkAsVersion, linkAsVersionAndReorder, unlinkFromGroup, setDraggingTrackId]);

    const handleMusicDragCancel = useCallback(() => {
        setDraggingTrackId(null);
        setDraggedTrack(null);
    }, [setDraggingTrackId]);

    return useMemo(() => ({
        draggedTrack,
        isDraggingMusic,
        handleMusicDragStart,
        handleMusicDragEnd,
        handleMusicDragCancel,
    }), [draggedTrack, isDraggingMusic, handleMusicDragStart, handleMusicDragEnd, handleMusicDragCancel]);
};

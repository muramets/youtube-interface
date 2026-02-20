// =============================================================================
// MUSIC DnD: Hook for Track → Playlist & Track → Track drag-and-drop
// =============================================================================
// Handles drag start/end events for music tracks being dragged onto
// playlist items in the sidebar OR onto other tracks for version grouping.
// Works alongside useTrendsDragDrop inside the shared DndContext (AppDndProvider).
// =============================================================================

import { useState, useCallback, useMemo } from 'react';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Track } from '../../../core/types/track';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';

export interface MusicDragDropState {
    draggedTrack: Track | null;
    isDraggingMusic: boolean;
}

export const useMusicDragDrop = () => {
    // Stable actions — created once, references never change, no subscription needed
    const { addTracksToPlaylist, linkAsVersion, linkAsVersionAndReorder, setDraggingTrackId } = useMusicStore.getState();
    // Reactive state — subscribe only to what actually changes
    const activeLibrarySource = useMusicStore((s) => s.activeLibrarySource);
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
        } else if (type === 'playlist-sort' && track) {
            // Set ghost only — no global dim (useSortable handles visual feedback internally)
            setDraggedTrack(track);
        }
    }, [setDraggingTrackId]);

    const handleMusicDragEnd = useCallback((event: DragEndEvent) => {
        // playlist-sort reorder is handled locally by PlaylistSortableList's useDndMonitor
        if (event.active.data.current?.type === 'playlist-sort') {
            setDraggingTrackId(null);
            setDraggedTrack(null);
            return;
        }
        const { over } = event;

        if (over && draggedTrack) {
            const dropType = over.data.current?.type as string | undefined;
            const userId = user?.uid || '';
            const channelId = currentChannel?.id || '';

            if (dropType === 'music-playlist' && userId && channelId) {
                const playlistId = over.data.current?.playlistId as string | undefined;
                if (playlistId) {
                    // If dragging from a shared library, record the source
                    const sources = activeLibrarySource
                        ? { [draggedTrack.id]: { ownerUserId: activeLibrarySource.ownerUserId, ownerChannelId: activeLibrarySource.ownerChannelId } }
                        : undefined;
                    addTracksToPlaylist(userId, channelId, playlistId, [draggedTrack.id], sources);
                }
            } else if (dropType === 'music-track-target' && userId && channelId) {
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
                    // Same-group reorder is handled by TrackGroupCard's useDndMonitor.
                    // Only link as version when dragging between different groups/tracks.
                    if (!sameGroup) {
                        linkAsVersion(userId, channelId, draggedTrack.id, targetTrackId);
                    }
                }

            } else if (dropType === 'music-group-target' && userId && channelId) {
                const targetGroupId = over.data.current?.groupId as string | undefined;
                const representativeTrackId = over.data.current?.representativeTrackId as string | undefined;
                const insertIdx = (over.data.current?.insertionIndex as number) ?? -1;

                if (representativeTrackId && representativeTrackId !== draggedTrack.id && targetGroupId) {
                    if (draggedTrack.groupId !== targetGroupId) {
                        // Single atomic write: sets groupId + final groupOrder in one Firestore batch.
                        // Avoids the intermediate Firestore snapshot that caused tracks to swap
                        // when linkAsVersion + reorderGroupTracks fired as two separate writes.
                        linkAsVersionAndReorder(userId, channelId, draggedTrack.id, representativeTrackId, insertIdx);
                    }
                }
            }
        }

        setDraggingTrackId(null);
        setDraggedTrack(null);
    }, [draggedTrack, user?.uid, currentChannel?.id, activeLibrarySource, addTracksToPlaylist, linkAsVersion, linkAsVersionAndReorder, setDraggingTrackId]);

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

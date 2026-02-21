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
    const { addTracksToPlaylist, linkAsVersion, linkAsVersionAndReorder, unlinkFromGroup, setDraggingTrackId } = useMusicStore.getState();
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
                    const userId = user?.uid || '';
                    const channelId = currentChannel?.id || '';
                    const trackOwnerUserId = activeLibrarySource?.ownerUserId ?? userId;
                    const trackOwnerChannelId = activeLibrarySource?.ownerChannelId ?? channelId;
                    if (trackOwnerUserId && trackOwnerChannelId) {
                        unlinkFromGroup(trackOwnerUserId, trackOwnerChannelId, draggedTrack.id);
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

            // Effective credentials for mutation operations on tracks.
            // When viewing a shared library, mutations must target the owner's Firestore collection.
            const trackOwnerUserId = activeLibrarySource?.ownerUserId ?? userId;
            const trackOwnerChannelId = activeLibrarySource?.ownerChannelId ?? channelId;

            if (dropType === 'music-playlist' && userId && channelId) {
                const playlistId = over.data.current?.playlistId as string | undefined;
                // Shared playlist: droppable data carries owner credentials
                const playlistOwnerUserId = (over.data.current?.ownerUserId as string) || userId;
                const playlistOwnerChannelId = (over.data.current?.ownerChannelId as string) || channelId;
                if (playlistId) {
                    // If dragging from a shared library, record the source
                    const sources = activeLibrarySource
                        ? { [draggedTrack.id]: { ownerUserId: activeLibrarySource.ownerUserId, ownerChannelId: activeLibrarySource.ownerChannelId } }
                        : undefined;
                    addTracksToPlaylist(playlistOwnerUserId, playlistOwnerChannelId, playlistId, [draggedTrack.id], sources);
                }
            } else if (dropType === 'music-track-target' && trackOwnerUserId && trackOwnerChannelId) {
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
                        linkAsVersion(trackOwnerUserId, trackOwnerChannelId, draggedTrack.id, targetTrackId);
                    }
                }

            } else if (dropType === 'music-group-target' && trackOwnerUserId && trackOwnerChannelId) {
                const targetGroupId = over.data.current?.groupId as string | undefined;
                const representativeTrackId = over.data.current?.representativeTrackId as string | undefined;
                const insertIdx = (over.data.current?.insertionIndex as number) ?? -1;

                if (representativeTrackId && representativeTrackId !== draggedTrack.id && targetGroupId) {
                    if (draggedTrack.groupId !== targetGroupId) {
                        // Single atomic write: sets groupId + final groupOrder in one Firestore batch.
                        // Avoids the intermediate Firestore snapshot that caused tracks to swap
                        // when linkAsVersion + reorderGroupTracks fired as two separate writes.
                        linkAsVersionAndReorder(trackOwnerUserId, trackOwnerChannelId, draggedTrack.id, representativeTrackId, insertIdx);
                    }
                }
            }
        }

        setDraggingTrackId(null);
        setDraggedTrack(null);
    }, [draggedTrack, user?.uid, currentChannel?.id, activeLibrarySource, addTracksToPlaylist, linkAsVersion, linkAsVersionAndReorder, unlinkFromGroup, setDraggingTrackId]);

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

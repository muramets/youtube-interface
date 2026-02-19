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
    const { addTracksToPlaylist, linkAsVersion, reorderGroupTracks, setDraggingTrackId } = useMusicStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [draggedTrack, setDraggedTrack] = useState<Track | null>(null);
    const [draggedWidth, setDraggedWidth] = useState<number>(0);

    const isDraggingMusic = draggedTrack !== null;

    const handleMusicDragStart = useCallback((event: DragStartEvent) => {
        const track = event.active.data.current?.track as Track | undefined;
        const type = event.active.data.current?.type as string | undefined;
        if (type === 'music-track' && track) {
            setDraggedTrack(track);
            setDraggingTrackId(track.id);
            const rect = event.active.rect.current.initial;
            setDraggedWidth(rect?.width ?? 0);
        }
    }, [setDraggingTrackId]);

    const handleMusicDragEnd = useCallback((event: DragEndEvent) => {
        const { over } = event;

        if (over && draggedTrack) {
            const dropType = over.data.current?.type as string | undefined;
            const userId = user?.uid || '';
            const channelId = currentChannel?.id || '';

            if (dropType === 'music-playlist' && userId && channelId) {
                const playlistId = over.data.current?.playlistId as string | undefined;
                if (playlistId) {
                    addTracksToPlaylist(userId, channelId, playlistId, [draggedTrack.id]);
                }
            } else if (dropType === 'music-track-target' && userId && channelId) {
                const targetTrackId = over.data.current?.trackId as string | undefined;
                const targetGroupId = over.data.current?.groupId as string | undefined;

                if (targetTrackId && targetTrackId !== draggedTrack.id) {
                    const sameGroup = draggedTrack.groupId && targetGroupId && draggedTrack.groupId === targetGroupId;
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
                        linkAsVersion(userId, channelId, draggedTrack.id, representativeTrackId);

                        if (insertIdx >= 0) {
                            const { tracks } = useMusicStore.getState();
                            const groupTracks = tracks
                                .filter((t) => t.groupId === targetGroupId)
                                .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

                            const orderedIds = groupTracks
                                .filter((t) => t.id !== draggedTrack.id)
                                .map((t) => t.id);

                            orderedIds.splice(insertIdx + 1, 0, draggedTrack.id);
                            reorderGroupTracks(userId, channelId, targetGroupId, orderedIds);
                        }
                    }
                }
            }
        }

        // Clear dragging visibility AFTER all optimistic updates
        setDraggingTrackId(null);
        setDraggedTrack(null);
        setDraggedWidth(0);
    }, [draggedTrack, user?.uid, currentChannel?.id, addTracksToPlaylist, linkAsVersion, reorderGroupTracks, setDraggingTrackId]);

    const handleMusicDragCancel = useCallback(() => {
        setDraggingTrackId(null);
        setDraggedTrack(null);
        setDraggedWidth(0);
    }, [setDraggingTrackId]);

    return useMemo(() => ({
        draggedTrack,
        draggedWidth,
        isDraggingMusic,
        handleMusicDragStart,
        handleMusicDragEnd,
        handleMusicDragCancel,
    }), [draggedTrack, draggedWidth, isDraggingMusic, handleMusicDragStart, handleMusicDragEnd, handleMusicDragCancel]);
};

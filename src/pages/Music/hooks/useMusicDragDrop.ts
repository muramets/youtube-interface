// =============================================================================
// MUSIC DnD: Hook for Track → Playlist drag-and-drop
// =============================================================================
// Handles drag start/end events for music tracks being dragged onto
// playlist items in the sidebar. Works alongside useTrendsDragDrop
// inside the shared DndContext (TrendsDndProvider).
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
    const { addTracksToPlaylist } = useMusicStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const [draggedTrack, setDraggedTrack] = useState<Track | null>(null);

    const isDraggingMusic = draggedTrack !== null;

    const handleMusicDragStart = useCallback((event: DragStartEvent) => {
        const track = event.active.data.current?.track as Track | undefined;
        const type = event.active.data.current?.type as string | undefined;
        if (type === 'music-track' && track) {
            setDraggedTrack(track);
        }
    }, []);

    const handleMusicDragEnd = useCallback((event: DragEndEvent) => {
        const { over } = event;

        if (over && draggedTrack) {
            const dropType = over.data.current?.type as string | undefined;
            const playlistId = over.data.current?.playlistId as string | undefined;

            if (dropType === 'music-playlist' && playlistId) {
                const userId = user?.uid || '';
                const channelId = currentChannel?.id || '';
                if (userId && channelId) {
                    addTracksToPlaylist(userId, channelId, playlistId, [draggedTrack.id]);
                }
            }
        }

        setDraggedTrack(null);
    }, [draggedTrack, user?.uid, currentChannel?.id, addTracksToPlaylist]);

    const handleMusicDragCancel = useCallback(() => {
        setDraggedTrack(null);
    }, []);

    return useMemo(() => ({
        draggedTrack,
        isDraggingMusic,
        handleMusicDragStart,
        handleMusicDragEnd,
        handleMusicDragCancel,
    }), [draggedTrack, isDraggingMusic, handleMusicDragStart, handleMusicDragEnd, handleMusicDragCancel]);
};

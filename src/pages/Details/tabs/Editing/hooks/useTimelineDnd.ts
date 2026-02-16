import React, { useCallback, useState } from 'react';
import { getEffectiveDuration } from '../../../../../core/types/editing';
import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import { createTimelineTrack, type TimelineTrack } from '../../../../../core/types/editing';

export interface UseTimelineDndReturn {
    sensors: ReturnType<typeof useSensors>;
    activeDragId: string | null;
    dropInsertIndex: number | null;
    dropGapPx: number;
    handleDragStart: (event: DragStartEvent) => void;
    handleDragOver: (event: DragOverEvent) => void;
    handleDragEnd: () => void;
    handleNativeDragOver: (e: React.DragEvent) => void;
    handleNativeDragLeave: (e: React.DragEvent) => void;
    handleNativeDrop: (e: React.DragEvent) => void;
}

/**
 * Drag-and-drop: DndKit reorder (Live Pattern) + native drop from TrackBrowser.
 */
export function useTimelineDnd(
    tracks: TimelineTrack[],
    pxPerSecond: number,
    scrollRef: React.RefObject<HTMLDivElement | null>,
): UseTimelineDndReturn {
    const reorderTracks = useEditingStore((s) => s.reorderTracks);
    const insertTrackAt = useEditingStore((s) => s.insertTrackAt);

    // dnd-kit sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor)
    );

    // ── Live Pattern: reorder on drag-over, not drag-end ─────────────
    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
    }, []);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = tracks.findIndex((t) => t.id === active.id);
        const newIndex = tracks.findIndex((t) => t.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            reorderTracks(arrayMove(tracks, oldIndex, newIndex));
        }
    }, [tracks, reorderTracks]);

    const handleDragEnd = useCallback(() => {
        setActiveDragId(null);
    }, []);

    // ── Native drop for tracks from TrackBrowser ────────────────────────
    const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
    const [dropGapPx, setDropGapPx] = useState<number>(0);

    // Compute gap positions for native drag targeting
    const getGapPositions = useCallback(() => {
        const gaps: { px: number; index: number }[] = [];
        let x = 0;
        gaps.push({ px: 0, index: 0 });
        for (let i = 0; i < tracks.length; i++) {
            const td = getEffectiveDuration(tracks[i]);
            x += Math.max(60, Math.round(td * pxPerSecond));
            gaps.push({ px: x, index: i + 1 });
        }
        return gaps;
    }, [tracks, pxPerSecond]);

    const handleNativeDragOver = useCallback((e: React.DragEvent) => {
        const hasTrack = e.dataTransfer.types.includes('application/x-editing-track');
        const hasPlaylist = e.dataTransfer.types.includes('application/x-editing-playlist');
        if (!hasTrack && !hasPlaylist) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';

        const scrollEl = scrollRef.current;
        if (!scrollEl || tracks.length === 0) {
            setDropInsertIndex(tracks.length);
            return;
        }
        const rect = scrollEl.getBoundingClientRect();
        const cursorX = e.clientX - rect.left + scrollEl.scrollLeft;
        const gaps = getGapPositions();

        let nearest = gaps[0];
        let minDist = Math.abs(cursorX - gaps[0].px);
        for (let i = 1; i < gaps.length; i++) {
            const dist = Math.abs(cursorX - gaps[i].px);
            if (dist < minDist) {
                minDist = dist;
                nearest = gaps[i];
            }
        }
        setDropInsertIndex(nearest.index);
        setDropGapPx(nearest.px);
    }, [tracks, getGapPositions, scrollRef]);

    const handleNativeDragLeave = useCallback((e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropInsertIndex(null);
    }, []);

    const handleNativeDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const idx = dropInsertIndex ?? tracks.length;

        // Single track drop
        const trackData = e.dataTransfer.getData('application/x-editing-track');
        if (trackData) {
            try {
                const { trackId, variant } = JSON.parse(trackData) as { trackId: string; variant: 'vocal' | 'instrumental' };
                const track = useMusicStore.getState().tracks.find((t) => t.id === trackId);
                if (track) {
                    insertTrackAt(createTimelineTrack(track, variant), idx);
                }
            } catch { /* ignore */ }
            setDropInsertIndex(null);
            return;
        }

        // Playlist drop — insert all tracks
        const playlistData = e.dataTransfer.getData('application/x-editing-playlist');
        if (playlistData) {
            try {
                const { trackIds } = JSON.parse(playlistData) as { playlistId: string; trackIds: string[] };
                const allTracks = useMusicStore.getState().tracks;
                const existingIds = new Set(tracks.map((t) => t.trackId));
                let insertAt = idx;

                for (const tId of trackIds) {
                    if (existingIds.has(tId)) continue;
                    const track = allTracks.find((t) => t.id === tId);
                    if (!track) continue;
                    const variant: 'vocal' | 'instrumental' = track.vocalUrl ? 'vocal' : 'instrumental';
                    insertTrackAt(createTimelineTrack(track, variant), insertAt);
                    existingIds.add(tId);
                    insertAt++;
                }
            } catch { /* ignore */ }
        }

        setDropInsertIndex(null);
    }, [insertTrackAt, dropInsertIndex, tracks]);

    return {
        sensors,
        activeDragId,
        dropInsertIndex,
        dropGapPx,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleNativeDragOver,
        handleNativeDragLeave,
        handleNativeDrop,
    };
}

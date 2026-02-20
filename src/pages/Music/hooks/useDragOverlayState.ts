// =============================================================================
// useDragOverlayState — DnD overlay state machine
// =============================================================================
// Computes ghost/pill visibility from dnd-kit context. OverlayManager is pure render.
//
// State matrix for group-child-sort drags (display track + children):
// ┌──────────────────────────┬───────────┬──────────┬────────┐
// │ Cursor position          │ Ghost     │ Pill     │ Dimmed │
// ├──────────────────────────┼───────────┼──────────┼────────┤
// │ In group (sort)          │ ✗ (sort)  │ ✗        │ ─      │
// │ Over link target         │ ✗ (sort)  │ ✗        │ ─      │
// │ Over playlist            │ ✓         │ ✗        │ +badge │
// │ Over content droppable   │ ✗         │ ✓        │ ─      │
// │ Empty / sidebar / Liked  │ ✓         │ ✗        │ ✓ 40%  │
// └──────────────────────────┴───────────┴──────────┴────────┘
//
// Regular music-track drags: ghost always shown, dimmed when no target.
// Playlist hover: ghost shows ✓ badge + "Already added" if track is a member.
// Liked playlist has no droppable — cursor passes through without interaction.
// =============================================================================

import { useDndContext } from '@dnd-kit/core';
import type { Track } from '../../../core/types/track';
import { useMusicStore } from '../../../core/stores/musicStore';

export interface DragOverlayState {
    /** Show the mini TrackCardGhost */
    showTrackGhost: boolean;
    /** Show the amber "Release to detach" pill */
    showDetachPill: boolean;
    /** Dim the ghost (over Liked or no valid target) */
    isGhostDisabled: boolean;
    /** Apply snapCenterToCursor modifier */
    useSnapModifier: boolean;
    /** Track is already in the hovered playlist */
    alreadyInPlaylist: boolean;
}

/**
 * Computes all drag overlay visibility flags from dnd-kit context.
 * Must be called inside DndContext (i.e. within OverlayManager).
 */
export const useDragOverlayState = (draggedTrack: Track | null): DragOverlayState => {
    const { active, over } = useDndContext();
    const musicPlaylists = useMusicStore((s) => s.musicPlaylists);

    const activeType = active?.data.current?.type as string | undefined;
    const overType = over?.data.current?.type as string | undefined;

    const isGroupChildDragging = activeType === 'group-child-sort';

    // ── Group-child sub-states ────────────────────────────────────────────
    // All group members (including display track) use 'group-child-sort' type.
    const isOverPlaylistAsChild = isGroupChildDragging && overType === 'music-playlist';
    const isGroupChildInGroup = isGroupChildDragging
        && (overType === 'group-child-sort'
            || overType === 'music-track-target'
            || overType === 'music-group-target');
    // "Outside" means over a content-area element that is NOT a group member.
    // We use a positive match on known content-area droppable types to avoid
    // showing the pill when the cursor is between playlist items in the sidebar
    // (where `over` flickers to null, causing jitter).
    const isOverContentArea = overType === 'between-sort-zone'
        || overType === 'playlist-sort';
    const isGroupChildOutside = isGroupChildDragging
        && !isGroupChildInGroup
        && !isOverPlaylistAsChild
        && isOverContentArea;

    // ── Playlist membership check ─────────────────────────────────────────
    const hoveredPlaylistId = overType === 'music-playlist'
        ? over?.data.current?.playlistId as string | undefined
        : undefined;
    const alreadyInPlaylist = !!(
        hoveredPlaylistId
        && draggedTrack
        && musicPlaylists.find((p) => p.id === hoveredPlaylistId)?.trackIds.includes(draggedTrack.id)
    );

    // ── Derived flags ────────────────────────────────────────────────────
    const showDetachPill = isGroupChildOutside;
    // Ghost visible for: regular drags (always), group-child NOT in group and NOT showing pill
    const showTrackGhost = !!draggedTrack
        && (!isGroupChildDragging || isOverPlaylistAsChild || (!isGroupChildInGroup && !showDetachPill));
    const isGhostDisabled = !!active && !over && !showDetachPill;
    const useSnapModifier = showTrackGhost || showDetachPill;

    return { showTrackGhost, showDetachPill, isGhostDisabled, useSnapModifier, alreadyInPlaylist };
};

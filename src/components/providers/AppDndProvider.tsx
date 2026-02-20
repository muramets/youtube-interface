// =============================================================================
// AppDndProvider: Global DnD context for all drag-and-drop interactions
// =============================================================================
// Single DndContext for the entire app. Polymorphic event routing by data.type:
//   - 'music-track' → Music track → Playlist/Track drop
//   - (default)     → Trend video → Niche drop
// =============================================================================

import React from 'react';
import { DndContext, DragOverlay, useDndContext, useSensor, useSensors, PointerSensor, pointerWithin } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { Unlink } from 'lucide-react';
import type { DragStartEvent, DragOverEvent, DragEndEvent, CollisionDetection } from '@dnd-kit/core';
import { useTrendsDragDrop } from '../../pages/Trends/hooks/useTrendsDragDrop';
import { useMusicDragDrop } from '../../pages/Music/hooks/useMusicDragDrop';
import { VideoNodeGhost } from '../../pages/Trends/Timeline/nodes/DraggableVideoNode';
import { TrackCardGhost } from '../../pages/Music/components/track/TrackCardGhost';

// ── Content-first collision detection ────────────────────────────────────────
// Runs pointerWithin, then deprioritizes `between-sort-zone` droppables when a
// "content" droppable (track, group, playlist) is also under the pointer.
// This prevents the thin BetweenDropZone from stealing drops meant for groups.
const BETWEEN_TYPE = 'between-sort-zone';

const HIGH_PRIORITY = ['music-group-target', 'music-track-target'];

const contentFirstCollision: CollisionDetection = (args) => {
    const collisions = pointerWithin(args);
    if (collisions.length <= 1) return collisions;

    // Use args.droppableContainers (public Map API) to look up droppable data.
    // Never read c.data.droppableContainer — that's an implementation detail
    // of pointerWithin and not part of dnd-kit's public CollisionDetection API.
    const typeOf = (c: ReturnType<typeof pointerWithin>[number]) =>
        args.droppableContainers.find(dc => dc.id === c.id)?.data?.current?.type ?? '';

    // Tier 1: semantic content droppables (group card, standalone track)
    const tier1 = collisions.filter(c => HIGH_PRIORITY.includes(typeOf(c)));
    if (tier1.length > 0) return tier1;

    // Tier 2: between-sort-zone (insertion line)
    const tier2 = collisions.filter(c => typeOf(c) === BETWEEN_TYPE);
    if (tier2.length > 0) return tier2;

    // Tier 3: anything else (e.g. group-child-sort sortable, trend niches)
    return collisions;
};

// ── Overlay Manager ───────────────────────────────────────────────────────────
// Lives INSIDE DndContext so it can call useDndContext().
// Manages all DragOverlay content in one place (dnd-kit warns against multiple
// DragOverlay instances). Handles three drag types:
//   1. music-track       → TrackCardGhost (snapCenterToCursor)
//   2. group-child-sort  → Amber "Release to detach" pill when cursor is outside
//                          the group or between rows. Hidden during in-group reorder
//                          and when hovering over a link target.
//   3. trend-video       → VideoNodeGhost (no modifier)
type OverlayManagerProps = {
    draggedTrack: ReturnType<typeof useMusicDragDrop>['draggedTrack'];
    draggedVideo: ReturnType<typeof useTrendsDragDrop>['draggedVideo'];
};
const OverlayManager: React.FC<OverlayManagerProps> = ({ draggedTrack, draggedVideo }) => {
    const { active, over } = useDndContext();

    const isGroupChildDragging = active?.data.current?.type === 'group-child-sort';
    const overType = over?.data.current?.type as string | undefined;
    // Show detach hint when dragging a group child AND cursor is not over:
    //   - another group member (reorder) → 'group-child-sort'
    //   - a link target (would create a new group) → 'music-track-target' / 'music-group-target'
    const showDetachHint = isGroupChildDragging
        && overType !== 'group-child-sort'
        && overType !== 'music-track-target'
        && overType !== 'music-group-target';

    const modifiers = (draggedTrack || showDetachHint) ? [snapCenterToCursor] : undefined;

    return (
        <DragOverlay dropAnimation={null} modifiers={modifiers}>
            {draggedVideo && <VideoNodeGhost video={draggedVideo} />}
            {draggedTrack && <TrackCardGhost track={draggedTrack} />}
            {showDetachHint && (
                <div className="w-fit flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500 shadow-lg pointer-events-none">
                    <Unlink size={9} className="text-white flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-white whitespace-nowrap tracking-wide">
                        Release to detach
                    </span>
                </div>
            )}
        </DragOverlay>
    );
};

export const AppDndProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        draggedVideo,
        handleDragStart: trendsDragStart,
        handleDragOver: trendsDragOver,
        handleDragEnd: trendsDragEnd,
        handleDragCancel: trendsDragCancel
    } = useTrendsDragDrop();

    const {
        draggedTrack,
        handleMusicDragStart,
        handleMusicDragEnd,
        handleMusicDragCancel,
    } = useMusicDragDrop();

    // Configure sensors with activation constraints to prevent accidental drags
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px movement before starting drag
            },
        })
    );

    // Polymorphic handlers: route events to appropriate handler based on type
    const handleDragStart = (event: DragStartEvent) => {
        const type = event.active.data.current?.type;
        if (type === 'music-track' || type === 'playlist-sort') {
            // music-track: full drag (ghost + dim). playlist-sort: ghost only (no dim).
            handleMusicDragStart(event);
        } else if (type === 'group-child-sort') {
            // Handled entirely by TrackGroupCard's useDndMonitor — no global handler needed.
        } else {
            trendsDragStart(event);
        }
    };

    const handleDragOver = (event: DragOverEvent) => {
        // Only Trends uses dragOver for hover feedback
        if (!draggedTrack) {
            trendsDragOver(event);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        if (draggedTrack) {
            handleMusicDragEnd(event);
        } else {
            trendsDragEnd(event);
        }
    };

    const handleDragCancel = () => {
        handleMusicDragCancel();
        trendsDragCancel();
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={contentFirstCollision}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            {children}

            {/* Single DragOverlay managed by OverlayManager (reads DndContext internally) */}
            <OverlayManager draggedTrack={draggedTrack} draggedVideo={draggedVideo} />
        </DndContext>
    );
};

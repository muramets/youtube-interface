// =============================================================================
// AppDndProvider: Global DnD context for all drag-and-drop interactions
// =============================================================================
// Single DndContext for the entire app. Polymorphic event routing by data.type:
//   - 'music-track' → Music track → Playlist/Track drop
//   - (default)     → Trend video → Niche drop
// =============================================================================

import React from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, pointerWithin } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { useTrendsDragDrop } from '../../pages/Trends/hooks/useTrendsDragDrop';
import { useMusicDragDrop } from '../../pages/Music/hooks/useMusicDragDrop';
import { VideoNodeGhost } from '../../pages/Trends/Timeline/nodes/DraggableVideoNode';
import { TrackCardGhost } from '../../pages/Music/components/track/TrackCardGhost';

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
        if (type === 'music-track') {
            handleMusicDragStart(event);
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
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            {children}

            {/* Ghost preview during drag */}
            <DragOverlay dropAnimation={null} modifiers={draggedTrack ? [snapCenterToCursor] : undefined}>
                {draggedVideo && <VideoNodeGhost video={draggedVideo} />}
                {draggedTrack && (
                    <TrackCardGhost track={draggedTrack} />
                )}
            </DragOverlay>
        </DndContext>
    );
};

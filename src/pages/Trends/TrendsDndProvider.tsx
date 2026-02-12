import React from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, pointerWithin } from '@dnd-kit/core';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { useTrendsDragDrop } from './hooks/useTrendsDragDrop';
import { useMusicDragDrop } from '../Music/hooks/useMusicDragDrop';
import { VideoNodeGhost } from './Timeline/nodes/DraggableVideoNode';

import { TrackCard } from '../Music/components/TrackCard';

/**
 * Provider for all DnD functionality (Trends + Music).
 * Wraps children in a single DndContext and renders appropriate DragOverlay.
 *
 * Polymorphic event handling: discriminates by `data.current.type`:
 *   - 'music-track' → Music track → Playlist/Track drop
 *   - (default)     → Trend video → Niche drop
 */
export const TrendsDndProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        draggedVideo,
        handleDragStart: trendsDragStart,
        handleDragOver: trendsDragOver,
        handleDragEnd: trendsDragEnd,
        handleDragCancel: trendsDragCancel
    } = useTrendsDragDrop();

    const {
        draggedTrack,
        draggedWidth,
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
            collisionDetection={pointerWithin} // Use pointer precision: ghost geometry won't trigger unwanted targets
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            {children}

            {/* Ghost preview during drag */}
            <DragOverlay dropAnimation={null}>
                {draggedVideo && <VideoNodeGhost video={draggedVideo} />}
                {draggedTrack && (
                    <div
                        className="pointer-events-none bg-[#141416] border border-white/[0.08] rounded-xl shadow-2xl"
                        style={{ width: draggedWidth || 'auto' }}
                    >
                        <TrackCard
                            track={draggedTrack}
                            isSelected={false}
                            userId=""
                            channelId=""
                            onSelect={() => { }}
                        />
                    </div>
                )}
            </DragOverlay>
        </DndContext>
    );
};


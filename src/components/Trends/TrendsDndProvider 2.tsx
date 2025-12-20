import React from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, pointerWithin } from '@dnd-kit/core';
import { useTrendsDragDrop } from './hooks/useTrendsDragDrop';
import { VideoNodeGhost } from './Timeline/nodes/DraggableVideoNode';

/**
 * Provider for Trends DnD functionality.
 * Wraps children in DndContext and renders DragOverlay for ghost preview.
 * 
 * Usage: Wrap your Sidebar + Timeline content to enable cross-component DnD.
 */
export const TrendsDndProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        draggedVideo,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDragCancel
    } = useTrendsDragDrop();

    // Configure sensors with activation constraints to prevent accidental drags
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px movement before starting drag
            },
        })
    );

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
            </DragOverlay>
        </DndContext>
    );
};

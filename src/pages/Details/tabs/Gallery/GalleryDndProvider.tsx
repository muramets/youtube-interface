/**
 * GalleryDndProvider
 * 
 * Provider for Gallery DnD functionality using @dnd-kit.
 * Wraps children in DndContext and renders DragOverlay for ghost preview.
 * 
 * Usage: Wrap GalleryTab content (Grid + Sidebar sources) to enable cross-component DnD.
 */

import React from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, pointerWithin } from '@dnd-kit/core';
import type { GalleryItem } from '../../../../core/types/gallery';
import { useGalleryDragDrop } from './useGalleryDragDrop';
import { GalleryCardGhost } from './GalleryCardGhost';
import { GalleryLayoutProvider } from './GalleryLayoutContext';

interface GalleryDndProviderProps {
    children: React.ReactNode;
    items: GalleryItem[];
    onReorder: (reorderedItems: GalleryItem[]) => Promise<void>;
    onMoveToSource: (itemId: string, sourceId: string) => Promise<void>;
}

export const GalleryDndProvider: React.FC<GalleryDndProviderProps> = ({
    children,
    items,
    onReorder,
    onMoveToSource
}) => {
    const {
        draggedItem,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDragCancel
    } = useGalleryDragDrop({ items, onReorder, onMoveToSource });

    // Configure sensors with activation constraints to prevent accidental drags
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Require 8px movement before starting drag
            },
        })
    );

    return (
        <GalleryLayoutProvider>
            <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                {children}

                {/* Ghost preview during drag - rendered via Portal, always on top */}
                <DragOverlay dropAnimation={null}>
                    {draggedItem && <GalleryCardGhost item={draggedItem} />}
                </DragOverlay>
            </DndContext>
        </GalleryLayoutProvider>
    );
};

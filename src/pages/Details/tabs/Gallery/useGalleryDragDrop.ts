/**
 * useGalleryDragDrop Hook
 * 
 * Manages drag-and-drop state for Visual Gallery.
 * Handles both reordering cards within grid AND moving cards to sources in sidebar.
 */

import { useState, useCallback } from 'react';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { GalleryItem } from '../../../../core/types/gallery';

interface UseGalleryDragDropOptions {
    items: GalleryItem[];
    onReorder: (reorderedItems: GalleryItem[]) => Promise<void>;
    onMoveToSource: (itemId: string, sourceId: string) => Promise<void>;
}

interface UseGalleryDragDropReturn {
    /** Currently dragged item (for ghost preview) */
    draggedItem: GalleryItem | null;
    /** Handler for DndContext onDragStart */
    handleDragStart: (event: DragStartEvent) => void;
    /** Handler for DndContext onDragOver */
    handleDragOver: (event: DragOverEvent) => void;
    /** Handler for DndContext onDragEnd */
    handleDragEnd: (event: DragEndEvent) => void;
    /** Handler for DndContext onDragCancel */
    handleDragCancel: () => void;
}

export const useGalleryDragDrop = ({
    items,
    onReorder,
    onMoveToSource
}: UseGalleryDragDropOptions): UseGalleryDragDropReturn => {
    const [draggedItem, setDraggedItem] = useState<GalleryItem | null>(null);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const itemId = String(active.id);
        const item = items.find(i => i.id === itemId);
        if (item) {
            setDraggedItem(item);
        }
    }, [items]);

    const handleDragOver = useCallback(() => {
        // Future: could add hover effects here
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setDraggedItem(null);

        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        // Check if dropped on a source (sidebar drop target)
        if (overId.startsWith('gallery-source-')) {
            const sourceId = overId.replace('gallery-source-', '');
            const item = items.find(i => i.id === activeId);

            // Only move if dropping on different source
            if (item && item.sourceId !== sourceId) {
                onMoveToSource(activeId, sourceId);
            }
            return;
        }

        // Otherwise it's a reorder within grid
        if (activeId !== overId) {
            const oldIndex = items.findIndex(i => i.id === activeId);
            const newIndex = items.findIndex(i => i.id === overId);

            if (oldIndex !== -1 && newIndex !== -1) {
                const reordered = arrayMove(items, oldIndex, newIndex);
                onReorder(reordered);
            }
        }
    }, [items, onMoveToSource, onReorder]);

    const handleDragCancel = useCallback(() => {
        setDraggedItem(null);
    }, []);

    return {
        draggedItem,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDragCancel
    };
};

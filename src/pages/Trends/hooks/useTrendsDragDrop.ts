import { useState, useCallback, useMemo } from 'react';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import type { TrendVideo } from '../../../core/types/trends';
import { useTrendStore } from '../../../core/stores/trends/trendStore';

/**
 * Drag and Drop state and handlers for Timeline → Sidebar niche assignment.
 * 
 * Premium UX Features:
 * - Smooth drag initiation with visual feedback
 * - Real-time hover detection on drop targets
 * - Optimistic UI updates on drop
 * 
 * Usage:
 * - Wrap Timeline + Sidebar in <DndContext> with these handlers
 * - Use draggedVideo for DragOverlay rendering
 * - Use overId in TrendNicheItem for highlight state
 */

export interface DragDropState {
    /** Currently dragged video, null when not dragging */
    draggedVideo: TrendVideo | null;
    /** ID of element under cursor (niche.id), null when not over drop zone */
    overId: string | null;
    /** True if drag is in progress */
    isDragging: boolean;
}

export interface UseTrendsDragDropReturn extends DragDropState {
    /** Handler for DndContext onDragStart */
    handleDragStart: (event: DragStartEvent) => void;
    /** Handler for DndContext onDragOver */
    handleDragOver: (event: DragOverEvent) => void;
    /** Handler for DndContext onDragEnd */
    handleDragEnd: (event: DragEndEvent) => void;
    /** Handler for DndContext onDragCancel */
    handleDragCancel: () => void;
}

export const useTrendsDragDrop = (): UseTrendsDragDropReturn => {
    const { assignVideoToNiche, setIsDragging: setIsDraggingStore, setDraggedBaseSize } = useTrendStore();

    // Drag state
    const [draggedVideo, setDraggedVideo] = useState<TrendVideo | null>(null);
    const [overId, setOverId] = useState<string | null>(null);

    // Computed
    const isDragging = draggedVideo !== null;

    /**
     * Handle drag start - capture the video being dragged
     */
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const video = event.active.data.current?.video as TrendVideo | undefined;
        const baseSize = event.active.data.current?.baseSize as number | undefined;
        if (video) {
            setDraggedVideo(video);
            setIsDraggingStore(true);
            if (baseSize) setDraggedBaseSize(baseSize);
        }
    }, [setIsDraggingStore, setDraggedBaseSize]);

    /**
     * Handle drag over - track which drop zone is under cursor
     * Uses over.id which corresponds to niche.id from useDroppable
     */
    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { over } = event;
        setOverId(over?.id as string | null);
    }, []);

    /**
     * Handle drag end - perform niche assignment if dropped on valid target
     * Premium UX: Optimistic update happens inside assignVideoToNiche
     */
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;

        if (over && draggedVideo) {
            const nicheId = over.id as string;
            const video = active.data.current?.video as TrendVideo;

            if (video && nicheId) {
                // Assign video to niche (optimistic update in store)
                assignVideoToNiche(video.id, nicheId, video.viewCount);
            }
        }

        // Reset state
        setDraggedVideo(null);
        setOverId(null);
        setIsDraggingStore(false);
        setDraggedBaseSize(null);
    }, [draggedVideo, assignVideoToNiche, setIsDraggingStore, setDraggedBaseSize]);

    /**
     * Handle drag cancel - reset state without performing action
     */
    const handleDragCancel = useCallback(() => {
        setDraggedVideo(null);
        setOverId(null);
        setIsDraggingStore(false);
        setDraggedBaseSize(null);
    }, [setIsDraggingStore, setDraggedBaseSize]);

    return useMemo(() => ({
        draggedVideo,
        overId,
        isDragging,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        handleDragCancel
    }), [draggedVideo, overId, isDragging, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel]);
};

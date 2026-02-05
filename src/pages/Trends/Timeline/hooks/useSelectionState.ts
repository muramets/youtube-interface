import { useState, useCallback } from 'react';
import type { TrendVideo } from '../../../../core/types/trends';

/**
 * Selection state for timeline videos.
 * Tracks selected video IDs, anchor position for floating bar, and dock state.
 */
export interface SelectionState {
    /** Set of currently selected video IDs */
    selectedIds: Set<string>;
    /** Last click position for floating bar positioning */
    lastAnchor: { x: number; y: number } | null;
    /** Whether floating bar has been docked (fixed position after zoom/pan) */
    hasDocked: boolean;
}

/**
 * Hook for managing video selection state on the timeline.
 * 
 * Provides unified selection logic for both Canvas (dots) and DOM (thumbnails) layers,
 * eliminating code duplication and ensuring consistent behavior.
 * 
 * Selection Behavior (accumulative):
 * - Click: Add video to selection (or remove if already selected)
 * - Click only selected video: Deselect all
 * - Cmd/Ctrl + click: Toggle in multi-select (same as regular click)
 * - Cmd/Ctrl + double-click: Zoom to video
 */
export const useSelectionState = () => {
    const [selectionState, setSelectionState] = useState<SelectionState>({
        selectedIds: new Set(),
        lastAnchor: null,
        hasDocked: false
    });

    /**
     * Handle video click with Figma-style selection logic.
     * 
     * @param video - The clicked video
     * @param clientX - Mouse X position for floating bar anchor
     * @param clientY - Mouse Y position for floating bar anchor
     * @param isModifier - Whether Cmd/Ctrl key is held
     */
    const handleVideoClick = useCallback((
        video: TrendVideo,
        clientX: number,
        clientY: number,
        isModifier: boolean
    ) => {
        setSelectionState(prev => {
            const newSet = new Set(prev.selectedIds);

            if (isModifier) {
                // Cmd/Ctrl held: multi-select behavior
                // (Removed check for empty selection so that Cmd+Click works for the first item too, crucial for Table checkboxes)
                // Toggle the clicked video in multi-select
                if (newSet.has(video.id)) {
                    newSet.delete(video.id);
                } else {
                    newSet.add(video.id);
                }
                return {
                    selectedIds: newSet,
                    lastAnchor: { x: clientX, y: clientY },
                    hasDocked: prev.hasDocked
                };
            } else {
                // No modifier: Standard Exclusive Selection
                // Select only this video, clearing others
                const exclusiveSet = new Set<string>();
                exclusiveSet.add(video.id);

                const newState = {
                    selectedIds: exclusiveSet,
                    lastAnchor: { x: clientX, y: clientY },
                    hasDocked: prev.hasDocked
                };
                return newState;
            }
        });
    }, []);

    /**
     * Clear all selection state.
     */
    const clearSelection = useCallback(() => {
        setSelectionState({
            selectedIds: new Set(),
            lastAnchor: null,
            hasDocked: false
        });
    }, []);

    /**
     * Dock the floating bar (fix position during zoom/pan).
     * Called when user starts interacting with the timeline while having a selection.
     */
    const dockFloatingBar = useCallback(() => {
        setSelectionState(prev => {
            if (prev.selectedIds.size > 0 && !prev.hasDocked) {
                return { ...prev, hasDocked: true };
            }
            return prev;
        });
    }, []);

    return {
        selectionState,
        handleVideoClick,
        clearSelection,
        dockFloatingBar,
        setSelectionState
    };
};

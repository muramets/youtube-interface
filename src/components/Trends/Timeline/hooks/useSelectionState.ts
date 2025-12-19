import { useState, useCallback } from 'react';
import type { TrendVideo } from '../../../../types/trends';

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
 * Selection Behavior (Figma-style):
 * - Single click: Select/deselect single video
 * - Cmd/Ctrl + click (with existing selection): Toggle multi-select
 * - Cmd/Ctrl + click (no selection): Ignored (allows double-click zoom)
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
                if (prev.selectedIds.size === 0) {
                    // No existing selection + modifier = ignore (allow double-click zoom)
                    return prev;
                }
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
                // No modifier: single-select behavior
                if (newSet.has(video.id) && newSet.size === 1) {
                    // Clicking already-selected single video = deselect
                    return {
                        selectedIds: new Set(),
                        lastAnchor: null,
                        hasDocked: false
                    };
                }
                // Select only this video
                return {
                    selectedIds: new Set([video.id]),
                    lastAnchor: { x: clientX, y: clientY },
                    hasDocked: false
                };
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

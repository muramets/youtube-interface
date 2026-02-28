// =============================================================================
// useSnapGuides — React bridge between snap engine and canvas drag operations
// =============================================================================
// Provides `applySnap(rawRect) → snappedPosition` for use in onMove callbacks.
// Stores active guide lines in a ref for SnapGuides to render.
// Collects "other rects" from canvas store on each call (fast: direct getState).
// =============================================================================

import { useRef, useCallback } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { computeSnap, nodeToRect, SNAP_THRESHOLD } from '../utils/snapEngine';
import type { Rect, SnapGuideState } from '../utils/snapEngine';

export type { SnapGuideState } from '../utils/snapEngine';

/**
 * Hook providing snap-to-align functionality for drag operations.
 *
 * Usage in onMove callback:
 * ```
 * const { applySnap, clearGuides, guidesRef } = useSnapGuides();
 *
 * // In onMove:
 * const snapped = applySnap(rawRect, excludeIds);
 * moveNode(id, { x: snapped.x, y: snapped.y });
 *
 * // In onEnd:
 * clearGuides();
 * ```
 */
export function useSnapGuides() {
    const guidesRef = useRef<SnapGuideState>({ guides: [] });
    const extraRectsRef = useRef<Rect[]>([]);

    /** Externally subscribe to guide changes for re-render */
    const listenersRef = useRef<Set<() => void>>(new Set());

    const subscribe = useCallback((listener: () => void) => {
        listenersRef.current.add(listener);
        return () => { listenersRef.current.delete(listener); };
    }, []);

    const notifyListeners = useCallback(() => {
        for (const listener of listenersRef.current) listener();
    }, []);

    /** Set additional snap target rects (e.g. frame bounds) */
    const setExtraRects = useCallback((rects: Rect[]) => {
        extraRectsRef.current = rects;
    }, []);

    /**
     * Compute snapped position for a dragged rectangle.
     * @param rawRect - The raw (unsnapped) bounds of the dragged item
     * @param excludeIds - Node IDs to exclude from snap targets (the dragged nodes themselves)
     */
    const applySnap = useCallback((rawRect: Rect, excludeIds: Set<string>): { x: number; y: number } => {
        const { nodes, nodeSizes } = useCanvasStore.getState();

        // Build "other" rects — all placed nodes except the ones being dragged
        const otherRects: Rect[] = [];
        for (const node of nodes) {
            if (!node.position || excludeIds.has(node.id)) continue;
            const rect = nodeToRect(node, nodeSizes);
            if (rect) otherRects.push(rect);
        }

        // Include extra rects (frame bounds, etc.)
        for (const extra of extraRectsRef.current) {
            otherRects.push(extra);
        }

        const result = computeSnap(rawRect, otherRects, SNAP_THRESHOLD);

        // Update guides ref and notify listeners
        guidesRef.current = { guides: result.guides };
        notifyListeners();

        return { x: result.x, y: result.y };
    }, [notifyListeners]);

    /** Clear all guides (call on drag end) */
    const clearGuides = useCallback(() => {
        guidesRef.current = { guides: [] };
        notifyListeners();
    }, [notifyListeners]);

    return { applySnap, clearGuides, guidesRef, subscribe, setExtraRects };
}

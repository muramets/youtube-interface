// =============================================================================
// useCanvasPlacement — Two-pass layout for pending canvas nodes
// =============================================================================

import { useEffect } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import type { CanvasBoardHandle } from '../CanvasBoard';

/**
 * Places pending nodes (position === null) using a two-pass layout:
 * Pass 1 (double-rAF): place with estimates after parent sizes are measured
 * Pass 2 (quad-rAF): correct positions with measured child heights
 */
export function useCanvasPlacement(
    isOpen: boolean,
    boardRef: React.RefObject<CanvasBoardHandle | null>,
) {
    const nodes = useCanvasStore((s) => s.nodes);
    const hasSynced = useCanvasStore((s) => s.hasSynced);
    const placePendingNodes = useCanvasStore((s) => s.placePendingNodes);
    const relayoutChildren = useCanvasStore((s) => s.relayoutChildren);

    const pendingCount = nodes.filter((n) => n.position === null).length;

    useEffect(() => {
        if (!isOpen || pendingCount === 0 || !hasSynced) return;

        // Two-pass layout:
        // Pass 1 (double-rAF): place nodes with estimates (parent sizes are measured)
        // Pass 2 (triple-rAF): correct positions with measured child heights
        let raf2: number, raf3: number, raf4: number;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                const center = boardRef.current?.getViewportCenter() ?? { x: 0, y: 0 };
                placePendingNodes(center);
                // After placement, children render → ResizeObserver measures → correction pass
                raf3 = requestAnimationFrame(() => {
                    raf4 = requestAnimationFrame(() => {
                        relayoutChildren();
                    });
                });
            });
        });
        return () => {
            cancelAnimationFrame(raf1); cancelAnimationFrame(raf2);
            cancelAnimationFrame(raf3); cancelAnimationFrame(raf4);
        };
    }, [isOpen, pendingCount, hasSynced, placePendingNodes, relayoutChildren, boardRef]);
}

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
 *
 * Also handles cross-tab sync: when the browser tab returns from background,
 * pending nodes (added via Firestore from another tab) are placed immediately.
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

    // --- Cross-tab sync: place pending nodes when tab returns to foreground ---
    // rAF is frozen in background tabs, so Firestore-synced nodes with
    // position=null won't be placed until the tab becomes visible again.
    useEffect(() => {
        if (!isOpen || !hasSynced) return;

        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            const pending = useCanvasStore.getState().nodes.filter((n) => n.position === null);
            if (pending.length === 0) return;

            // Double-rAF: DOM needs a frame to be ready after un-freeze
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const center = boardRef.current?.getViewportCenter() ?? { x: 0, y: 0 };
                    placePendingNodes(center);
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            relayoutChildren();
                        });
                    });
                });
            });
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [isOpen, hasSynced, placePendingNodes, relayoutChildren, boardRef]);
}

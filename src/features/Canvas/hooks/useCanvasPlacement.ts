// =============================================================================
// useCanvasPlacement — Event-driven layout for pending canvas nodes
// =============================================================================

import { useEffect } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import type { CanvasBoardHandle } from '../CanvasBoard';

/**
 * Places pending nodes (position === null) using an event-driven pipeline:
 *
 * 1. Wait one rAF for React to commit DOM (parent nodes render)
 * 2. Place pending nodes with estimate sizes
 * 3. Wait for SizeBatcher flush (ResizeObserver measures → flush event)
 * 4. Correct positions with measured child heights
 *
 * This replaces the previous time-based approach (4 nested rAFs) with
 * a data-driven approach: relayout fires when sizes are actually measured,
 * not after a fixed number of animation frames.
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
    const onNextSizeFlush = useCanvasStore((s) => s.onNextSizeFlush);

    const pendingCount = nodes.filter((n) => n.position === null).length;

    useEffect(() => {
        if (!isOpen || pendingCount === 0 || !hasSynced) return;

        let cancelled = false;
        let cancelFlushListener: (() => void) | null = null;

        // 1 rAF: wait for React to commit DOM so parent sizes are measured
        const rafId = requestAnimationFrame(() => {
            if (cancelled) return;

            const center = boardRef.current?.getViewportCenter() ?? { x: 0, y: 0 };
            placePendingNodes(center);

            // Wait for SizeBatcher to flush (ResizeObserver → batch → flush event)
            cancelFlushListener = onNextSizeFlush(() => {
                if (cancelled) return;
                relayoutChildren();
            });

            // Safety timeout: if no ResizeObserver fires (e.g. 0 new DOM nodes),
            // the flush listener won't fire. Fall back to a single rAF.
            const fallbackRaf = requestAnimationFrame(() => {
                if (cancelled) return;
                // If flush already happened, relayout was called. If not, call it now.
                if (cancelFlushListener) {
                    cancelFlushListener();
                    cancelFlushListener = null;
                }
                relayoutChildren();
            });

            // Extend cleanup to include fallback
            const prevCancel = cancelFlushListener;
            cancelFlushListener = () => {
                prevCancel?.();
                cancelAnimationFrame(fallbackRaf);
            };
        });

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            cancelFlushListener?.();
        };
    }, [isOpen, pendingCount, hasSynced, placePendingNodes, relayoutChildren, onNextSizeFlush, boardRef]);

    // --- Cross-tab sync: place pending nodes when tab returns to foreground ---
    useEffect(() => {
        if (!isOpen || !hasSynced) return;

        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            const pending = useCanvasStore.getState().nodes.filter((n) => n.position === null);
            if (pending.length === 0) return;

            let done = false;
            requestAnimationFrame(() => {
                const center = boardRef.current?.getViewportCenter() ?? { x: 0, y: 0 };
                placePendingNodes(center);

                // Event-driven: wait for measured sizes, then correct
                const cancelFlush = onNextSizeFlush(() => {
                    if (done) return;
                    done = true;
                    relayoutChildren();
                });

                // Safety fallback: if no new nodes rendered (no ResizeObserver)
                requestAnimationFrame(() => {
                    if (done) return;
                    done = true;
                    cancelFlush();
                    relayoutChildren();
                });
            });
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [isOpen, hasSynced, placePendingNodes, relayoutChildren, onNextSizeFlush, boardRef]);
}

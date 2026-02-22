// =============================================================================
// useCanvasKeyboard — Keyboard shortcuts for Canvas overlay
// =============================================================================

import { useEffect, useCallback } from 'react';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { NODE_WIDTH, NODE_HEIGHT_FALLBACK } from '../../../core/stores/canvas/constants';
import type { CanvasBoardHandle } from '../CanvasBoard';

/**
 * Registers keyboard shortcuts for the Canvas overlay:
 * - Escape: close canvas (unless a modal is open)
 * - Z: fit all nodes to viewport
 */
export function useCanvasKeyboard(
    isOpen: boolean,
    boardRef: React.RefObject<CanvasBoardHandle | null>,
) {
    const setOpen = useCanvasStore((s) => s.setOpen);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            const hasModal = document.querySelector('[data-modal], [role="dialog"]');
            if (!hasModal) setOpen(false);
        }
        if (e.code === 'KeyZ' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
            const { nodes: allNodes, nodeSizes } = useCanvasStore.getState();
            const rects = allNodes
                .filter((n) => n.position)
                .map((n) => ({
                    x: n.position!.x,
                    y: n.position!.y,
                    w: n.size?.w ?? NODE_WIDTH,
                    h: nodeSizes[n.id] ?? NODE_HEIGHT_FALLBACK,
                }));
            if (rects.length > 0) {
                boardRef.current?.fitToContent(rects);
            }
        }
    }, [setOpen, boardRef]);

    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleKeyDown]);
}

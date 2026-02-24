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
        // Skip canvas shortcuts when editing text (sticky note contentEditable, rename input)
        const active = document.activeElement;
        const isEditing = active instanceof HTMLElement &&
            (active.isContentEditable || active.tagName === 'INPUT');
        const mod = e.metaKey || e.ctrlKey;

        if (e.key === 'Escape') {
            if (isEditing) return; // let StickyNoteNode handle Escape → blur
            const hasModal = document.querySelector('[data-modal], [role="dialog"]');
            if (hasModal) return;
            // Clear edge highlight first, then selection, then close canvas.
            const { selectedNodeIds, clearSelection, highlightedEdgeId, clearHighlightedEdge } = useCanvasStore.getState();
            if (highlightedEdgeId) {
                clearHighlightedEdge();
            } else if (selectedNodeIds.size > 0) {
                clearSelection();
            } else {
                setOpen(false);
            }
        }

        // Delete / Backspace → remove selected nodes
        if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing) {
            const { selectedNodeIds, deleteNodes } = useCanvasStore.getState();
            if (selectedNodeIds.size > 0) {
                e.preventDefault();
                deleteNodes(Array.from(selectedNodeIds));
            }
        }

        // Cmd+C → copy selected nodes (but not when user is selecting text in another panel)
        if (mod && e.code === 'KeyC' && !e.shiftKey && !isEditing) {
            // Let native copy work when user has text selected (e.g. chat panel)
            const textSelection = window.getSelection();
            if (textSelection && textSelection.toString().length > 0) return;

            const { selectedNodeIds, copySelected } = useCanvasStore.getState();
            if (selectedNodeIds.size > 0) {
                e.preventDefault();
                copySelected();
            }
        }

        // Cmd+X → cut (copy + delete + immediate save)
        if (mod && e.code === 'KeyX' && !e.shiftKey && !isEditing) {
            const { selectedNodeIds, copySelected, deleteNodes, _flush } = useCanvasStore.getState();
            if (selectedNodeIds.size > 0) {
                e.preventDefault();
                copySelected();
                deleteNodes(Array.from(selectedNodeIds));
                _flush(); // Bypass debounce — save immediately so onSnapshot can't re-add
            }
        }

        // Cmd+Opt+V → move (paste + delete originals from source page)
        if (mod && e.code === 'KeyV' && e.altKey && !e.shiftKey && !isEditing) {
            const { clipboard } = useCanvasStore.getState();
            if (clipboard && clipboard.nodes.length > 0) {
                e.preventDefault();
                const center = boardRef.current?.getViewportCenter?.() ?? { x: 0, y: 0 };
                useCanvasStore.getState().moveClipboard(center);
            }
        }

        // Cmd+V → paste clipboard
        if (mod && e.code === 'KeyV' && !e.altKey && !e.shiftKey && !isEditing) {
            const { clipboard } = useCanvasStore.getState();
            if (clipboard && clipboard.nodes.length > 0) {
                e.preventDefault();
                const center = boardRef.current?.getViewportCenter?.() ?? { x: 0, y: 0 };
                useCanvasStore.getState().pasteClipboard(center);
            }
        }

        // Cmd+D → duplicate (copy + paste in one step)
        if (mod && e.code === 'KeyD' && !e.shiftKey && !isEditing) {
            const { selectedNodeIds, copySelected: copy, pasteClipboard: paste } = useCanvasStore.getState();
            if (selectedNodeIds.size > 0) {
                e.preventDefault();
                copy();
                const center = boardRef.current?.getViewportCenter?.() ?? { x: 0, y: 0 };
                paste(center);
            }
        }

        // Cmd+Z → undo / Cmd+Shift+Z → redo
        if (mod && e.code === 'KeyZ' && !isEditing) {
            e.preventDefault();
            if (e.shiftKey) {
                useCanvasStore.getState().redo();
            } else {
                useCanvasStore.getState().undo();
            }
        }

        if (e.code === 'KeyZ' && !mod && !e.shiftKey && !isEditing) {
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

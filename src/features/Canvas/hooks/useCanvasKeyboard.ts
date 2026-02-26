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
 * - Cmd+V: paste OS clipboard image OR internal canvas clipboard (via 'paste' event)
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
            (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
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
            // Stop propagation to window — prevents useVideoSelection's global
            // Escape handler from clearing video selections on the same keypress.
            e.stopPropagation();
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
                // Overwrite OS clipboard so old images don't linger and interfere with Cmd+V
                navigator.clipboard.writeText('[Canvas Nodes Copied]').catch(() => { });
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
                // Overwrite OS clipboard so old images don't linger
                navigator.clipboard.writeText('[Canvas Nodes Copied]').catch(() => { });
            }
        }

        // Cmd+Opt+V → move (paste + delete originals from source page)
        if (mod && e.code === 'KeyV' && e.altKey && !e.shiftKey && !isEditing) {
            const state = useCanvasStore.getState();
            if (state.clipboard && state.clipboard.nodes.length > 0) {
                e.preventDefault();
                const pos = state.lastCanvasWorldPos ?? boardRef.current?.getViewportCenter?.() ?? { x: 0, y: 0 };
                state.moveClipboard(pos);
            }
        }

        // NOTE: Cmd+V (plain paste) is NOT handled here.
        // It is handled by the 'paste' event listener below, which checks for
        // OS clipboard images first, then falls back to internal canvas clipboard.
        // We must NOT preventDefault here, otherwise the 'paste' event won't fire.

        // Cmd+D → duplicate (copy + paste in one step)
        if (mod && e.code === 'KeyD' && !e.shiftKey && !isEditing) {
            const state = useCanvasStore.getState();
            if (state.selectedNodeIds.size > 0) {
                e.preventDefault();
                state.copySelected();
                const pos = state.lastCanvasWorldPos ?? boardRef.current?.getViewportCenter?.() ?? { x: 0, y: 0 };
                state.pasteClipboard(pos);
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

    // --- Paste event: handles BOTH OS clipboard images AND internal canvas clipboard ---
    //
    // Why here and not in keydown?
    // The native 'paste' event provides clipboardData (images, text) without needing
    // any permissions. If we preventDefault() in keydown, the paste event never fires
    // and we can't read OS clipboard contents. So ALL Cmd+V paste logic lives here.
    //
    // Priority: OS clipboard image > internal canvas clipboard > do nothing
    const handlePaste = useCallback((e: ClipboardEvent) => {
        const active = document.activeElement;
        const isEditing = active instanceof HTMLElement &&
            (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (isEditing) return; // let native paste handle text in contentEditable

        const items = e.clipboardData?.items;
        if (!items) return;

        // 1) Check for image in OS clipboard (screenshots, copied images)
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) {
                    e.preventDefault();
                    const state = useCanvasStore.getState();
                    const pos = state.lastCanvasWorldPos ?? boardRef.current?.getViewportCenter?.() ?? { x: 0, y: 0 };
                    state.addImageNode(blob, pos);
                    return;
                }
            }
        }

        // 2) No image → try internal canvas clipboard
        const state = useCanvasStore.getState();
        if (state.clipboard && state.clipboard.nodes.length > 0) {
            e.preventDefault();
            const pos = state.lastCanvasWorldPos ?? boardRef.current?.getViewportCenter?.() ?? { x: 0, y: 0 };
            state.pasteClipboard(pos);
        }
    }, [boardRef]);

    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('paste', handlePaste);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('paste', handlePaste);
        };
    }, [isOpen, handleKeyDown, handlePaste]);
}

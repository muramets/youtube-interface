// =============================================================================
// Edge Rewire — imperative mouse-tracking logic for re-wiring edges
// =============================================================================

import type { CanvasEdge, CanvasNode } from '../../../core/types/canvas';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { getAnchorPoint, type Point } from './edgeGeometry';
import { startEdgeAutoPan } from '../utils/edgeAutoPan';

/** Convert screen coordinates to world coordinates */
function screenToWorld(screenX: number, screenY: number) {
    const { viewport } = useCanvasStore.getState();
    return {
        x: (screenX - viewport.x) / viewport.zoom,
        y: (screenY - viewport.y) / viewport.zoom,
    };
}

/**
 * Starts a rewire operation: deletes the existing edge and begins
 * a new pending edge from the source, tracking the mouse until release.
 */
export function startRewire(
    edge: CanvasEdge,
    srcNode: CanvasNode,
    srcH: number,
    tgt: Point,
) {
    const store = useCanvasStore.getState();
    const srcAnchor = getAnchorPoint(srcNode, edge.sourceHandle, srcH);
    store.deleteEdge(edge.id);
    store.startPendingEdge(edge.sourceNodeId, edge.sourceHandle, srcAnchor);
    store.updatePendingEdge(tgt.x, tgt.y);

    // Start auto-pan: shifts viewport when cursor is near screen edges
    const autoPan = startEdgeAutoPan((dx, dy, clientX, clientY) => {
        useCanvasStore.getState().autoPanBy(dx, dy);
        const worldPos = screenToWorld(clientX, clientY);
        store.updatePendingEdge(worldPos.x, worldPos.y);
    });

    const onMouseMove = (ev: MouseEvent) => {
        autoPan.updateCursor(ev.clientX, ev.clientY);
        const worldPos = screenToWorld(ev.clientX, ev.clientY);
        store.updatePendingEdge(worldPos.x, worldPos.y);
    };
    const onMouseUp = () => {
        autoPan.stop();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        const pe = useCanvasStore.getState().pendingEdge;
        if (pe?.snapTarget) {
            store.completePendingEdge(pe.snapTarget.nodeId, pe.snapTarget.handle);
        } else {
            store.cancelPendingEdge();
        }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

// =============================================================================
// Edge Rewire — imperative mouse-tracking logic for re-wiring edges
// =============================================================================

import type { CanvasEdge, CanvasNode } from '../../../core/types/canvas';
import { useCanvasStore } from '../../../core/stores/canvas/canvasStore';
import { getAnchorPoint, type Point } from './edgeGeometry';

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

    const onMouseMove = (ev: MouseEvent) => {
        const vp = useCanvasStore.getState().viewport;
        store.updatePendingEdge((ev.clientX - vp.x) / vp.zoom, (ev.clientY - vp.y) / vp.zoom);
    };
    const onMouseUp = () => {
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

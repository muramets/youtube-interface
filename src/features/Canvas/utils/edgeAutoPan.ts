// =============================================================================
// Edge Auto-Pan — rAF loop that scrolls the canvas when the cursor is near
// viewport edges during edge drag. Used by ConnectionHandles and rewireLogic.
// =============================================================================

const EDGE_ZONE = 60;       // px from screen edge
const MAX_SPEED = 15;        // max px per frame at the very edge
const MIN_SPEED = 1;         // min px per frame to avoid sub-pixel jitter

/**
 * Starts a rAF loop that auto-pans the canvas when the cursor
 * approaches the viewport edges during edge drag.
 *
 * @param panBy  Callback that shifts the viewport by (dx, dy) in screen pixels.
 *               Also receives the current client cursor position for world-coord updates.
 * @returns      Object with `updateCursor(clientX, clientY)` to call on mousemove
 *               and `stop()` to call on mouseup.
 */
export function startEdgeAutoPan(
    panBy: (dx: number, dy: number, clientX: number, clientY: number) => void,
) {
    let clientX = 0;
    let clientY = 0;
    let hasCursor = false;     // Don't pan until first updateCursor
    let rafId: number | null = null;

    const tick = () => {
        rafId = requestAnimationFrame(tick);
        if (!hasCursor) return;  // Wait for first mousemove

        const w = window.innerWidth;
        const h = window.innerHeight;
        let dx = 0;
        let dy = 0;

        // When cursor is near RIGHT edge → viewport.x must DECREASE to reveal
        // content further right. So dx is negative. Same logic for all 4 sides.
        if (clientX < EDGE_ZONE) {
            dx = speed(clientX);           // positive → shift viewport right → reveal left
        } else if (clientX > w - EDGE_ZONE) {
            dx = -speed(w - clientX);      // negative → shift viewport left → reveal right
        }

        if (clientY < EDGE_ZONE) {
            dy = speed(clientY);           // positive → shift viewport down → reveal top
        } else if (clientY > h - EDGE_ZONE) {
            dy = -speed(h - clientY);      // negative → shift viewport up → reveal bottom
        }

        if (dx !== 0 || dy !== 0) {
            panBy(dx, dy, clientX, clientY);
        }
    };

    rafId = requestAnimationFrame(tick);

    return {
        /** Call on every mousemove to feed cursor position to the loop */
        updateCursor(x: number, y: number) {
            clientX = x;
            clientY = y;
            hasCursor = true;
        },
        /** Stop the auto-pan loop (call on mouseup) */
        stop() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        },
    };
}

/** Map distance-from-edge (0 = at edge, EDGE_ZONE = outside zone) to speed */
function speed(distFromEdge: number): number {
    const t = Math.max(0, 1 - distFromEdge / EDGE_ZONE); // 1 at edge, 0 at zone boundary
    return Math.max(MIN_SPEED, Math.round(t * MAX_SPEED));
}

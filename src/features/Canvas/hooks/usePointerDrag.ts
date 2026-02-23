// =============================================================================
// usePointerDrag — rAF-throttled pointer tracking for drag/resize operations
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePointerDragOptions {
    /** Called each rAF frame with (clientX, clientY) while dragging */
    onMove: (clientX: number, clientY: number) => void;
    /** Called when drag ends */
    onEnd?: () => void;
    /** Minimum pixel movement before drag is considered started. Default: 4 */
    threshold?: number;
}

/**
 * Returns `[isDragging, startDrag]`.
 * Call `startDrag()` from a mousedown handler to begin tracking.
 * `isDragging` only becomes true after the pointer has moved ≥ `threshold` pixels
 * from the mousedown point — a plain click never sets isDragging to true.
 * Mouse movement is throttled via rAF to avoid layout thrashing.
 */
export function usePointerDrag({ onMove, onEnd, threshold = 4 }: UsePointerDragOptions): [boolean, () => void] {
    const [isDragging, setIsDragging] = useState(false);
    const onMoveRef = useRef(onMove);
    const onEndRef = useRef(onEnd);

    useEffect(() => {
        onMoveRef.current = onMove;
        onEndRef.current = onEnd;
    });

    const startDrag = useCallback(() => {
        // All listener management is imperative — no useEffect needed.
        // This avoids the ref-doesn't-trigger-effect problem.
        let hasStarted = false;
        let startX = -1;
        let startY = -1;

        const pending = { x: 0, y: 0, dirty: false };
        let rafId: number | null = null;

        const tick = () => {
            if (pending.dirty) {
                pending.dirty = false;
                onMoveRef.current(pending.x, pending.y);
            }
            rafId = requestAnimationFrame(tick);
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!hasStarted) {
                // Record start position on first move event
                if (startX === -1) {
                    startX = e.clientX;
                    startY = e.clientY;
                    return;
                }
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.sqrt(dx * dx + dy * dy) >= threshold) {
                    hasStarted = true;
                    setIsDragging(true);
                    // Kick off the rAF ticker now that drag has begun
                    pending.x = e.clientX;
                    pending.y = e.clientY;
                    pending.dirty = true;
                    rafId = requestAnimationFrame(tick);
                }
                return;
            }
            pending.x = e.clientX;
            pending.y = e.clientY;
            pending.dirty = true;
        };

        const handleMouseUp = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (hasStarted) {
                setIsDragging(false);
                onEndRef.current?.();
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [threshold]);

    return [isDragging, startDrag];
}

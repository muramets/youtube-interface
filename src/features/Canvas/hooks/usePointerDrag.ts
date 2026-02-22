// =============================================================================
// usePointerDrag — rAF-throttled pointer tracking for drag/resize operations
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePointerDragOptions {
    /** Called each rAF frame with (clientX, clientY) while dragging */
    onMove: (clientX: number, clientY: number) => void;
    /** Called when drag ends */
    onEnd?: () => void;
}

/**
 * Returns `[isDragging, startDrag]`.
 * Call `startDrag()` from a mousedown handler to begin tracking.
 * Mouse movement is throttled via rAF to avoid layout thrashing.
 */
export function usePointerDrag({ onMove, onEnd }: UsePointerDragOptions): [boolean, () => void] {
    const [isDragging, setIsDragging] = useState(false);
    const onMoveRef = useRef(onMove);
    const onEndRef = useRef(onEnd);

    useEffect(() => {
        onMoveRef.current = onMove;
        onEndRef.current = onEnd;
    });

    const startDrag = useCallback(() => setIsDragging(true), []);

    useEffect(() => {
        if (!isDragging) return;

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
            pending.x = e.clientX;
            pending.y = e.clientY;
            pending.dirty = true;
        };

        const handleMouseUp = () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            setIsDragging(false);
            onEndRef.current?.();
        };

        rafId = requestAnimationFrame(tick);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    return [isDragging, startDrag];
}

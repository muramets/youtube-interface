// =============================================================================
// useMarqueeSelection — shift+drag rectangle selection on the canvas
// =============================================================================

import { useState, useRef, useCallback } from 'react';

interface SelectionRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface UseMarqueeSelectionOptions {
    containerRef: React.RefObject<HTMLDivElement | null>;
    onSelectRect?: (rect: { left: number; top: number; right: number; bottom: number }) => void;
}

export interface MarqueeControls {
    selectionRect: SelectionRect | null;
    /** Returns true if marquee started (shift was held) */
    tryStart: (clientX: number, clientY: number, shiftKey: boolean) => boolean;
    /** Update marquee rect during mousemove. Returns true if in selection mode */
    move: (clientX: number, clientY: number) => boolean;
    /** End selection and fire onSelectRect callback */
    end: () => boolean;
    /** Whether a marquee drag just ended (suppresses clearSelection click) */
    wasSelecting: boolean;
    /** Reset the wasSelecting flag */
    clearWasSelecting: () => void;
}

export function useMarqueeSelection({
    containerRef,
    onSelectRect,
}: UseMarqueeSelectionOptions): MarqueeControls {
    const isSelectingRef = useRef(false);
    const startRef = useRef({ x: 0, y: 0 });
    const currentRef = useRef({ x: 0, y: 0 });
    const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
    const [wasSelecting, setWasSelecting] = useState(false);

    const tryStart = useCallback((clientX: number, clientY: number, shiftKey: boolean): boolean => {
        if (!shiftKey) {
            isSelectingRef.current = false;
            return false;
        }
        isSelectingRef.current = true;
        startRef.current = { x: clientX, y: clientY };
        currentRef.current = { x: clientX, y: clientY };
        return true;
    }, []);

    const move = useCallback((clientX: number, clientY: number): boolean => {
        if (!isSelectingRef.current) return false;

        const container = containerRef.current;
        if (!container) return false;
        const cr = container.getBoundingClientRect();
        currentRef.current = { x: clientX, y: clientY };
        const sx = startRef.current.x - cr.left;
        const sy = startRef.current.y - cr.top;
        const ex = clientX - cr.left;
        const ey = clientY - cr.top;
        setSelectionRect({
            x: Math.min(sx, ex),
            y: Math.min(sy, ey),
            w: Math.abs(ex - sx),
            h: Math.abs(ey - sy),
        });
        return true;
    }, [containerRef]);

    const end = useCallback((): boolean => {
        if (!isSelectingRef.current) return false;
        isSelectingRef.current = false;

        const sx = startRef.current.x;
        const sy = startRef.current.y;
        const ex = currentRef.current.x;
        const ey = currentRef.current.y;
        const hasArea = Math.abs(ex - sx) > 5 || Math.abs(ey - sy) > 5;
        if (hasArea && onSelectRect) {
            setWasSelecting(true);
            onSelectRect({
                left: Math.min(sx, ex),
                top: Math.min(sy, ey),
                right: Math.max(sx, ex),
                bottom: Math.max(sy, ey),
            });
        }
        setSelectionRect(null);
        return true;
    }, [onSelectRect]);

    const clearWasSelecting = useCallback(() => setWasSelecting(false), []);

    return { selectionRect, tryStart, move, end, wasSelecting, clearWasSelecting };
}

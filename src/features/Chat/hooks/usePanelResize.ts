import { useState, useCallback, useRef, useEffect } from 'react';

interface PanelResizeResult {
    panelWidth: number;
    panelHeight: number;
    isResizing: boolean;
    handleResizeStart: (edge: 'left' | 'top' | 'corner') => (e: React.MouseEvent) => void;
}

export function usePanelResize(initialWidth = 400, initialHeight = 560): PanelResizeResult {
    const [panelWidth, setPanelWidth] = useState(initialWidth);
    const [panelHeight, setPanelHeight] = useState(initialHeight);
    const [isResizing, setIsResizing] = useState(false);

    const resizingRef = useRef(false);
    const resizeEdgeRef = useRef<'left' | 'top' | 'corner'>('corner');
    const startPosRef = useRef({ x: 0, y: 0 });
    const startSizeRef = useRef({ w: 0, h: 0 });
    const sizeRef = useRef({ w: initialWidth, h: initialHeight });

    const resizeEndRef = useRef<() => void>(() => { });
    const stableResizeEnd = useCallback(() => resizeEndRef.current(), []);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!resizingRef.current) return;
        const edge = resizeEdgeRef.current;
        const dx = startPosRef.current.x - e.clientX;
        const dy = startPosRef.current.y - e.clientY;

        if (edge === 'left' || edge === 'corner') {
            setPanelWidth(Math.max(320, Math.min(700, startSizeRef.current.w + dx)));
        }
        if (edge === 'top' || edge === 'corner') {
            setPanelHeight(Math.max(360, Math.min(800, startSizeRef.current.h + dy)));
        }
    }, []);

    useEffect(() => {
        resizeEndRef.current = () => {
            resizingRef.current = false;
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', stableResizeEnd);
        };
    }, [handleResizeMove, stableResizeEnd]);

    // Keep sizeRef in sync with state
    useEffect(() => {
        sizeRef.current = { w: panelWidth, h: panelHeight };
    }, [panelWidth, panelHeight]);

    const handleResizeStart = useCallback((edge: 'left' | 'top' | 'corner') => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizingRef.current = true;
        resizeEdgeRef.current = edge;
        setIsResizing(true);
        startPosRef.current = { x: e.clientX, y: e.clientY };
        startSizeRef.current = { w: sizeRef.current.w, h: sizeRef.current.h };
        document.body.style.cursor =
            edge === 'left' ? 'ew-resize' :
                edge === 'top' ? 'ns-resize' : 'nwse-resize';
        document.body.style.userSelect = 'none';
        document.body.style.pointerEvents = 'none';
        window.addEventListener('mousemove', handleResizeMove);
        window.addEventListener('mouseup', stableResizeEnd);
    }, [handleResizeMove, stableResizeEnd]);

    // Safety cleanup on unmount
    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', stableResizeEnd);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
        };
    }, [handleResizeMove, stableResizeEnd]);

    return { panelWidth, panelHeight, isResizing, handleResizeStart };
}

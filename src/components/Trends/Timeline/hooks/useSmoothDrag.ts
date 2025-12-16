import { useRef, useState, useEffect, useCallback } from 'react';

interface UseSmoothDragOptions {
    value: number;
    onChange: (value: number) => void;
    axis: 'x' | 'y';
    sensitivity?: number;
    isLoading?: boolean;
}

interface UseSmoothDragResult {
    isDragging: boolean;
    handleMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Hook for smooth drag-to-adjust interactions with lerp smoothing.
 * Used by both VerticalSpreadControl (y-axis) and TimeDistributionControl (x-axis).
 */
export function useSmoothDrag({
    value,
    onChange,
    axis,
    sensitivity = 0.015,
    isLoading = false,
}: UseSmoothDragOptions): UseSmoothDragResult {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(0);
    const [startValue, setStartValue] = useState(0);

    // Smoothing state
    const rafRef = useRef<number | null>(null);
    const targetValueRef = useRef(value);
    const currentValueRef = useRef(value);

    // Sync refs when not dragging to prevent jumps when starting next drag
    useEffect(() => {
        if (!isDragging) {
            targetValueRef.current = value;
            currentValueRef.current = value;
        }
    }, [value, isDragging]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (isLoading) return;

        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStart(axis === 'x' ? e.clientX : e.clientY);
        setStartValue(value);

        // Initialize smoothing refs
        targetValueRef.current = value;
        currentValueRef.current = value;

        // Disable text selection and enforce cursor during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = axis === 'x' ? 'ew-resize' : 'ns-resize';
    }, [isLoading, value, axis]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const currentPos = axis === 'x' ? e.clientX : e.clientY;
            // For Y axis, "up" (negative delta) should increase value
            // For X axis, "right" (positive delta) should increase value
            const delta = axis === 'x'
                ? currentPos - dragStart
                : dragStart - currentPos;

            const rawTarget = Math.max(0, Math.min(1, startValue + delta * sensitivity));
            targetValueRef.current = rawTarget;
        };

        // Animation loop for smoothing
        const animate = () => {
            if (!isDragging) return;

            const lerpFactor = 0.15;
            const current = currentValueRef.current;
            const target = targetValueRef.current;
            const next = current + (target - current) * lerpFactor;

            currentValueRef.current = next;

            if (Math.abs(target - current) > 0.0001) {
                onChange(next);
            } else {
                onChange(target);
            }
            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);

        const handleMouseUp = () => {
            setIsDragging(false);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isDragging, dragStart, startValue, onChange, axis, sensitivity]);

    return { isDragging, handleMouseDown };
}

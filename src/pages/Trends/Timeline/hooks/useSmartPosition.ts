import { useState, useLayoutEffect, type RefObject } from 'react';

interface Position {
    x: number;
    y: number;
}

interface SmartPositionOptions {
    targetPos: Position;
    elementRef: RefObject<HTMLElement | null>;
    width: number; // Approximate width if ref not ready, or for initial guess
    height?: number;
    padding?: number;
    offsetY?: number; // Distance from target y
}

export const useSmartPosition = ({
    targetPos,
    elementRef,
    width: initialWidth, // Fallback
    padding = 16,
    offsetY = 60
}: SmartPositionOptions) => {
    const [coords, setCoords] = useState<Position>(targetPos);
    const [isBelow, setIsBelow] = useState(false); // Whether we flipped to below

    useLayoutEffect(() => {
        if (!elementRef.current) return;

        const width = elementRef.current.offsetWidth || initialWidth;
        const height = elementRef.current.offsetHeight || 40;
        const { x, y } = targetPos;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // X Axis: Center on target, but clamp
        let left = x - width / 2;
        if (left < padding) left = padding;
        else if (left + width > screenWidth - padding) left = screenWidth - padding - width;

        // Y Axis: Default above
        let top = y - offsetY;
        let below = false;

        // Check if clipped top
        if (top < padding) {
            // Try below
            const belowTop = y + 40; // Approx dot height buffer
            if (belowTop + height < screenHeight - padding) {
                top = belowTop;
                below = true;
            } else {
                // Determine which has more space or clamp to top
                top = Math.max(padding, top);
            }
        }

        setCoords({ x: left, y: top });
        setIsBelow(below);

    }, [targetPos.x, targetPos.y, elementRef, padding, offsetY, initialWidth]);

    return { coords, isBelow };
};

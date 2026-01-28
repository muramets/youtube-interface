import { useState, useEffect, useRef } from 'react';

/**
 * Throttle hook - limits how often a value updates.
 * Useful for expensive computations that don't need to run every frame.
 * 
 * @param value - The value to throttle
 * @param limit - Minimum ms between updates (default: 16ms = ~60fps)
 */
export function useThrottle<T>(value: T, limit: number = 16): T {
    const [throttledValue, setThrottledValue] = useState<T>(value);
    // eslint-disable-next-line
    const lastRan = useRef(Date.now());

    useEffect(() => {
        const now = Date.now();
        const elapsed = now - lastRan.current;

        if (elapsed >= limit) {
            lastRan.current = now;
            setThrottledValue(value);
        } else {
            const handler = setTimeout(() => {
                lastRan.current = Date.now();
                setThrottledValue(value);
            }, limit - elapsed);

            return () => clearTimeout(handler);
        }
    }, [value, limit]);

    return throttledValue;
}

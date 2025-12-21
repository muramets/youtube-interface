import { useEffect, useState } from 'react';

// Singleton event emitter for the timer
const listeners = new Set<(time: number) => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

const startTimer = () => {
    if (intervalId) return;
    intervalId = setInterval(() => {
        const now = Date.now();
        listeners.forEach(listener => listener(now));
    }, 1000);
};

const stopTimer = () => {
    if (listeners.size === 0 && intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
};

export const useGlobalTimer = () => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const listener = (time: number) => setNow(time);
        listeners.add(listener);

        if (listeners.size === 1) {
            startTimer();
        }

        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) {
                stopTimer();
            }
        };
    }, []);

    return now;
};

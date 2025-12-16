import { useEffect, useRef } from 'react';

interface UseTimelineHotkeysProps {
    onAutoFit: () => void;
}

export const useTimelineHotkeys = ({ onAutoFit }: UseTimelineHotkeysProps) => {
    // Use a ref to avoid re-binding the event listener when onAutoFit changes
    const onAutoFitRef = useRef(onAutoFit);

    useEffect(() => {
        onAutoFitRef.current = onAutoFit;
    }, [onAutoFit]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const key = e.key.toLowerCase();
            if (key === 'z' || key === 'я') {
                e.preventDefault();
                onAutoFitRef.current();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);
};

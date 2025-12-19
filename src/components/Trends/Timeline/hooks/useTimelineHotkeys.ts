import { useEffect, useRef } from 'react';

interface UseTimelineHotkeysProps {
    onAutoFit: () => void;
    onEscape: () => void;
}

export const useTimelineHotkeys = ({ onAutoFit, onEscape }: UseTimelineHotkeysProps) => {
    // Use a ref to avoid re-binding the event listener when callbacks change
    const onAutoFitRef = useRef(onAutoFit);
    const onEscapeRef = useRef(onEscape);

    useEffect(() => {
        onAutoFitRef.current = onAutoFit;
        onEscapeRef.current = onEscape;
    }, [onAutoFit, onEscape]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const key = e.key.toLowerCase();
            if (key === 'z' || key === 'я') {
                e.preventDefault();
                onAutoFitRef.current();
            }
            if (key === 'escape') {
                e.preventDefault();
                onEscapeRef.current();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);
};

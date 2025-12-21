import { useEffect, useRef } from 'react';

interface UseTimelineHotkeysProps {
    onAutoFit: () => void;
    onEscape: () => void;
    /** If true, skip Escape handling (let dropdown handle it) */
    hasActiveDropdown?: boolean;
}

export const useTimelineHotkeys = ({ onAutoFit, onEscape, hasActiveDropdown = false }: UseTimelineHotkeysProps) => {
    // Use a ref to avoid re-binding the event listener when callbacks change
    const onAutoFitRef = useRef(onAutoFit);
    const onEscapeRef = useRef(onEscape);
    const hasActiveDropdownRef = useRef(hasActiveDropdown);

    useEffect(() => {
        onAutoFitRef.current = onAutoFit;
        onEscapeRef.current = onEscape;
        hasActiveDropdownRef.current = hasActiveDropdown;
    }, [onAutoFit, onEscape, hasActiveDropdown]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const key = e.key.toLowerCase();
            if (key === 'z' || key === 'я') {
                e.preventDefault();
                onAutoFitRef.current();
            }
            if (key === 'escape') {
                // Skip if a dropdown is active (let it handle its own close)
                if (hasActiveDropdownRef.current) return;
                e.preventDefault();
                onEscapeRef.current();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);
};

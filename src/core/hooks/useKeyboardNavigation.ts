import { useState, type KeyboardEvent } from 'react';

interface UseKeyboardNavigationProps {
    listLength: number;
    onEnter?: (index: number) => void;
    onEscape?: () => void;
}

export const useKeyboardNavigation = ({
    listLength,
    onEnter,
    onEscape
}: UseKeyboardNavigationProps) => {
    const [activeIndex, setActiveIndex] = useState(-1);
    const [prevListLength, setPrevListLength] = useState(listLength);

    // Reset active index when list length changes (e.g. filtering)
    if (listLength !== prevListLength) {
        setPrevListLength(listLength);
        setActiveIndex(-1);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        if (listLength === 0 && e.key !== 'Escape') return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(prev => {
                    const next = prev + 1;
                    return next >= listLength ? listLength - 1 : next;
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => {
                    const next = prev - 1;
                    return next < -1 ? -1 : next; // allow going back to input (-1)
                });
                break;
            case 'Enter':
                if (activeIndex >= 0) {
                    // If item selected, prevent default form submission
                    e.preventDefault();
                    e.stopPropagation();
                    onEnter?.(activeIndex);
                }
                // If activeIndex is -1, we let the default behavior happen (form submit)
                break;
            case 'Escape':
                e.preventDefault();
                if (onEscape) {
                    onEscape();
                }
                break;
        }
    };

    return {
        activeIndex,
        setActiveIndex,
        handleKeyDown
    };
};

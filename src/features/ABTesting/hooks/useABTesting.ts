
import { useState, useCallback } from 'react';
import { type ABTestMode, type ABTestingSaveData, type ABTestingModalStateProps } from './useABTestingModalState';

interface UseABTestingProps {
    mode?: ABTestMode;
    titles?: string[];
    thumbnails?: string[];
    currentTitle?: string;
    currentThumbnail?: string;
    initialResults?: {
        titles: number[];
        thumbnails: number[];
    };
    onSave: (data: ABTestingSaveData) => void;
    // onResultsSave is currently unused in this hook
    onResultsSave?: (results: { titles: number[]; thumbnails: number[] }) => Promise<void>;
}

export function useABTesting({
    mode = 'both',
    titles = [],
    thumbnails = [],
    currentTitle = '',
    currentThumbnail = '',
    initialResults,
    onSave
}: UseABTestingProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeMode, setActiveMode] = useState<ABTestMode>(mode);

    const openModal = useCallback((initialMode?: ABTestMode) => {
        if (initialMode) setActiveMode(initialMode);
        setIsOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsOpen(false);
    }, []);

    // We don't need to duplicate internal state logic here,
    // we just provide props for the Modal component.
    // However, if we want to "lift" state up, we can use useABTestingModalState here too,
    // but typically the Modal component itself uses that hook internally.
    // Let's check ABTestingModal implementation.
    // It takes props and calls useABTestingModalState internally.
    // So this hook is mainly for controlling visibility and passing data.

    const modalProps: ABTestingModalStateProps = {
        isOpen,
        initialTab: activeMode,
        currentTitle,
        currentThumbnail,
        titleVariants: titles,
        thumbnailVariants: thumbnails,
        initialResults
    };

    const handleSave = (data: ABTestingSaveData) => {
        onSave(data);
        closeModal();
    };

    return {
        isOpen,
        openModal,
        closeModal,
        modalProps,
        handleSave,
        activeMode
    };
}

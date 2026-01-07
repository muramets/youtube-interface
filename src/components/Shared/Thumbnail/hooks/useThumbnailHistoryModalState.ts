import { useState, useEffect, useCallback, useMemo } from 'react';
import { type CoverVersion } from '../../../../core/utils/youtubeApi';

export interface UseThumbnailHistoryModalStateProps {
    isOpen: boolean;
    history: CoverVersion[];
    currentThumbnail: string | null;
}

/**
 * Represents a pending change made within the modal.
 * Changes are NOT applied until user clicks "Apply Version".
 * Clicking "Cancel" discards all pending changes.
 */
export interface PendingChanges {
    /** URL to apply when committing (empty string = clear thumbnail) */
    thumbnailUrl: string | null;
    /** Timestamps of versions marked for deletion */
    deletedTimestamps: number[];
}

export interface UseThumbnailHistoryModalStateReturn {
    // Navigation state
    selectedIndex: number;
    direction: number;
    isAnimating: boolean;
    selectedVersion: CoverVersion | undefined;

    // Visible history (filtered, excluding pending deletions)
    visibleHistory: CoverVersion[];

    // Pending changes state
    pendingChanges: PendingChanges;
    hasPendingChanges: boolean;

    // Computed: effective current thumbnail (considering pending changes)
    effectiveCurrentThumbnail: string | null;

    // Tooltip state
    openTooltipTimestamp: number | null;
    isCurrentTooltipOpen: boolean;
    isHistoricalTooltipOpen: boolean;

    // Navigation handlers
    handleNext: () => void;
    handlePrev: () => void;
    handleThumbnailSelect: (index: number) => void;
    onAnimationComplete: () => void;

    // Tooltip handlers
    setOpenTooltipTimestamp: (timestamp: number | null) => void;
    setIsCurrentTooltipOpen: (open: boolean) => void;
    setIsHistoricalTooltipOpen: (open: boolean) => void;

    // Change management handlers
    /**
     * Marks a version for deletion (pending, not immediate).
     * Automatically adjusts selection to next available version.
     */
    markForDeletion: (timestamp: number, url: string) => void;

    /**
     * Sets the pending thumbnail URL to apply.
     */
    setPendingThumbnail: (url: string) => void;

    /**
     * Resets all pending changes (called on Cancel).
     */
    discardChanges: () => void;

    /**
     * Returns data to commit (called on Apply).
     */
    getChangesToApply: () => {
        thumbnailUrl: string | null;
        deletedTimestamps: number[];
    };
}

/**
 * Manages all state and logic for ThumbnailHistoryModal.
 * 
 * BUSINESS LOGIC: Pending Changes Pattern
 * ----------------------------------------
 * All modifications (deletions, thumbnail selection) are tracked as "pending"
 * and NOT applied immediately. This allows the Cancel button to properly
 * discard changes and restore the original state.
 * 
 * Navigation operates on VISIBLE history (excluding pending deletions).
 */
export function useThumbnailHistoryModalState({
    isOpen,
    history,
    currentThumbnail
}: UseThumbnailHistoryModalStateProps): UseThumbnailHistoryModalStateReturn {
    // === Navigation State ===
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);

    // === Tooltip State ===
    const [openTooltipTimestamp, setOpenTooltipTimestamp] = useState<number | null>(null);
    const [isCurrentTooltipOpen, setIsCurrentTooltipOpen] = useState(false);
    const [isHistoricalTooltipOpen, setIsHistoricalTooltipOpen] = useState(false);

    // === Pending Changes State ===
    const [pendingChanges, setPendingChanges] = useState<PendingChanges>({
        thumbnailUrl: null,
        deletedTimestamps: []
    });

    // === Computed: Visible History ===
    // Filter out items marked for deletion (pending) AND the current thumbnail
    // (to prevent showing it in both "Current" and "Historical" columns)
    const effectiveCurrentThumbnail = pendingChanges.thumbnailUrl === ''
        ? null
        : (pendingChanges.thumbnailUrl ?? currentThumbnail);

    const visibleHistory = useMemo(() =>
        history.filter(v =>
            !pendingChanges.deletedTimestamps.includes(v.timestamp) &&
            v.url !== effectiveCurrentThumbnail
        ),
        [history, pendingChanges.deletedTimestamps, effectiveCurrentThumbnail]
    );

    // === Initialize on Modal Open ===
    useEffect(() => {
        if (!isOpen) return;

        // Reset pending changes
        setPendingChanges({
            thumbnailUrl: null,
            deletedTimestamps: []
        });

        // Find and select current thumbnail in history
        if (history.length > 0) {
            const currentIdx = history.findIndex(v => v.url === currentThumbnail);
            setSelectedIndex(currentIdx !== -1 ? currentIdx : 0);
        }

        // Reset animation state
        setDirection(0);
        setIsAnimating(false);
    }, [isOpen]); // Only re-run when modal opens/closes

    // === Keep Selection in Bounds (for visible history) ===
    useEffect(() => {
        if (visibleHistory.length === 0) {
            setSelectedIndex(0);
            return;
        }
        if (selectedIndex >= visibleHistory.length) {
            setSelectedIndex(Math.max(0, visibleHistory.length - 1));
        }
    }, [visibleHistory.length, selectedIndex]);

    // === Keyboard Navigation (uses visible history) ===
    useEffect(() => {
        if (!isOpen || visibleHistory.length <= 1) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isAnimating) return;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setIsAnimating(true);
                setDirection(1);
                setSelectedIndex(prev => (prev + 1) % visibleHistory.length);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setIsAnimating(true);
                setDirection(-1);
                setSelectedIndex(prev => (prev - 1 + visibleHistory.length) % visibleHistory.length);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, visibleHistory.length, isAnimating]);

    // === Navigation Handlers (use visible history) ===
    const handleNext = useCallback(() => {
        if (isAnimating || visibleHistory.length <= 1) return;
        setIsAnimating(true);
        setDirection(1);
        setSelectedIndex(prev => (prev + 1) % visibleHistory.length);
    }, [isAnimating, visibleHistory.length]);

    const handlePrev = useCallback(() => {
        if (isAnimating || visibleHistory.length <= 1) return;
        setIsAnimating(true);
        setDirection(-1);
        setSelectedIndex(prev => (prev - 1 + visibleHistory.length) % visibleHistory.length);
    }, [isAnimating, visibleHistory.length]);

    const handleThumbnailSelect = useCallback((index: number) => {
        if (index === selectedIndex) return;
        setDirection(index > selectedIndex ? 1 : -1);
        setSelectedIndex(index);
    }, [selectedIndex]);

    const onAnimationComplete = useCallback(() => {
        setIsAnimating(false);
    }, []);

    // === Pending Changes Handlers ===

    /**
     * Marks a version for deletion.
     * Automatically adjusts selection to next available version.
     */
    const markForDeletion = useCallback((timestamp: number, url: string) => {
        setPendingChanges(prev => {
            const newDeletions = prev.deletedTimestamps.includes(timestamp)
                ? prev.deletedTimestamps
                : [...prev.deletedTimestamps, timestamp];

            // If deleting the current thumbnail, mark it as cleared
            const shouldClearThumbnail = url === currentThumbnail ||
                (prev.thumbnailUrl === null && url === currentThumbnail) ||
                url === prev.thumbnailUrl;

            return {
                thumbnailUrl: shouldClearThumbnail ? '' : prev.thumbnailUrl,
                deletedTimestamps: newDeletions
            };
        });

        // Adjust selection if we're deleting the currently selected item
        // This will be handled by the useEffect that keeps selection in bounds
    }, [currentThumbnail]);

    /**
     * Sets the pending thumbnail to apply.
     */
    const setPendingThumbnail = useCallback((url: string) => {
        setPendingChanges(prev => ({
            ...prev,
            thumbnailUrl: url
        }));
    }, []);

    /**
     * Discards all pending changes (Cancel action).
     * Restores state to what it was when modal opened.
     */
    const discardChanges = useCallback(() => {
        setPendingChanges({
            thumbnailUrl: null,
            deletedTimestamps: []
        });
    }, []);

    /**
     * Returns the changes to apply (Apply action).
     */
    const getChangesToApply = useCallback(() => ({
        thumbnailUrl: pendingChanges.thumbnailUrl,
        deletedTimestamps: pendingChanges.deletedTimestamps
    }), [pendingChanges]);

    // === Computed Values ===
    // Selected version from VISIBLE history (not original)
    const selectedVersion = visibleHistory[selectedIndex];

    const hasPendingChanges = pendingChanges.thumbnailUrl !== null ||
        pendingChanges.deletedTimestamps.length > 0;

    return {
        // Navigation
        selectedIndex,
        direction,
        isAnimating,
        selectedVersion,

        // Visible history
        visibleHistory,

        // Pending changes
        pendingChanges,
        hasPendingChanges,
        effectiveCurrentThumbnail,

        // Tooltips
        openTooltipTimestamp,
        isCurrentTooltipOpen,
        isHistoricalTooltipOpen,

        // Navigation handlers
        handleNext,
        handlePrev,
        handleThumbnailSelect,
        onAnimationComplete,

        // Tooltip handlers
        setOpenTooltipTimestamp,
        setIsCurrentTooltipOpen,
        setIsHistoricalTooltipOpen,

        // Change management
        markForDeletion,
        setPendingThumbnail,
        discardChanges,
        getChangesToApply
    };
}

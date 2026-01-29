import { useState, useRef, useEffect } from 'react';
import { getABTestRank, getRankBorderClass } from '../../../pages/Details/tabs/Packaging/utils/abTestRank';

export type ABTestMode = 'title' | 'thumbnail' | 'both';

export interface ABTestingModalStateProps {
    isOpen: boolean;
    initialTab: ABTestMode;
    currentTitle: string;
    currentThumbnail: string;
    titleVariants: string[];
    thumbnailVariants: string[];
    initialResults?: {
        titles: number[];
        thumbnails: number[];
    };
}

export interface ABTestingSaveData {
    mode: ABTestMode;
    titles: string[];
    thumbnails: string[];
    results: {
        titles: number[];
        thumbnails: number[];
    };
    packagingChanged: boolean;
}

/**
 * Manages all state and logic for ABTestingModal:
 * - Title/thumbnail variants state
 * - Results (watch time share) state
 * - Validation
 * - Change detection
 * - Border color calculation for ranking
 */
export function useABTestingModalState({
    isOpen,
    initialTab,
    currentTitle,
    currentThumbnail,
    titleVariants,
    thumbnailVariants,
    initialResults = { titles: [], thumbnails: [] }
}: ABTestingModalStateProps) {
    const [activeTab, setActiveTab] = useState<ABTestMode>(initialTab);
    const [titles, setTitles] = useState<string[]>(['', '', '']);
    const [thumbnails, setThumbnails] = useState<string[]>(['', '', '']);
    const [results, setResults] = useState<{ titles: number[], thumbnails: number[] }>({
        titles: [0, 0, 0],
        thumbnails: [0, 0, 0]
    });
    const [showResults, setShowResults] = useState(false);

    const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

    // Initialize with existing data when modal opens
    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);

            // Initialize titles
            const initTitles = [...titleVariants];
            if (initTitles.length === 0 && currentTitle) {
                initTitles[0] = currentTitle;
            }
            while (initTitles.length < 3) initTitles.push('');
            setTitles(initTitles);

            // Initialize thumbnails
            const initThumbnails = [...thumbnailVariants];
            if (initThumbnails.length === 0 && currentThumbnail) {
                initThumbnails[0] = currentThumbnail;
            }
            while (initThumbnails.length < 3) initThumbnails.push('');
            setThumbnails(initThumbnails);

            // Initialize results
            const newResults = {
                titles: [...(initialResults.titles || []), 0, 0, 0].slice(0, 3),
                thumbnails: [...(initialResults.thumbnails || []), 0, 0, 0].slice(0, 3)
            };
            setResults(newResults);

            // Show results panel if any are non-zero
            const hasResults = (initialResults.titles?.some(v => v > 0)) || (initialResults.thumbnails?.some(v => v > 0));
            setShowResults(!!hasResults);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialTab, currentTitle, currentThumbnail, JSON.stringify(titleVariants), JSON.stringify(thumbnailVariants), JSON.stringify(initialResults)]);

    // Handlers
    const handleTitleChange = (index: number, value: string) => {
        const newTitles = [...titles];
        newTitles[index] = value;
        setTitles(newTitles);
    };

    const handleThumbnailUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        const objectUrl = URL.createObjectURL(file);
        const newThumbnails = [...thumbnails];

        // Revoke old URL if it was a blob
        if (newThumbnails[index].startsWith('blob:')) {
            URL.revokeObjectURL(newThumbnails[index]);
        }

        newThumbnails[index] = objectUrl;
        setThumbnails(newThumbnails);
    };

    // Cleanup blob URLs on unmount
    useEffect(() => {
        return () => {
            thumbnails.forEach(url => {
                if (url && url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
            });
        };
    }, [thumbnails]);

    const handleRemoveThumbnail = (index: number) => {
        const newThumbnails = [...thumbnails];
        newThumbnails[index] = '';
        setThumbnails(newThumbnails);
    };

    const handleResultChange = (type: 'titles' | 'thumbnails', index: number, value: number) => {
        setResults(prev => {
            const newArr = [...prev[type]];
            newArr[index] = value;
            return { ...prev, [type]: newArr };
        });
    };

    // Sync both title and thumbnail results (for "both" mode)
    const handleBothResultChange = (index: number, value: number) => {
        setResults(prev => {
            const newTitles = [...prev.titles];
            const newThumbnails = [...prev.thumbnails];
            newTitles[index] = value;
            newThumbnails[index] = value;
            return { titles: newTitles, thumbnails: newThumbnails };
        });
    };

    // Validation
    const getValidationError = (): string | null => {
        if (activeTab === 'title' || activeTab === 'both') {
            const filledTitles = titles.filter(t => t.trim()).length;
            if (filledTitles < 1) return 'At least 1 title is required';
        }
        if (activeTab === 'thumbnail' || activeTab === 'both') {
            const filledThumbnails = thumbnails.filter(t => t).length;
            if (filledThumbnails < 1) return 'At least 1 thumbnail is required';
        }
        return null;
    };

    const validationError = getValidationError();
    const isValid = !validationError;

    // Check if anything has changed from initial state
    const hasChanges = (() => {
        const currentValidTitles = titles.filter(t => t.trim());
        const currentValidThumbnails = thumbnails.filter(t => t);

        // Determine effective initial state (handling pre-filled current values)
        // If titleVariants is empty but currentTitle exists, the modal pre-fills with currentTitle
        const effectiveInitialTitles = titleVariants.length > 0
            ? titleVariants
            : (currentTitle ? [currentTitle] : []);

        const effectiveInitialThumbnails = thumbnailVariants.length > 0
            ? thumbnailVariants
            : (currentThumbnail ? [currentThumbnail] : []);

        // Check titles changed
        const titlesChanged = JSON.stringify(currentValidTitles) !== JSON.stringify(effectiveInitialTitles);

        // Check thumbnails changed
        const thumbnailsChanged = JSON.stringify(currentValidThumbnails) !== JSON.stringify(effectiveInitialThumbnails);

        // Check results changed (only count filled slots)
        // If results are hidden, we treat current results as all zeros
        const currentResults = showResults ? {
            titles: results.titles.slice(0, currentValidTitles.length),
            thumbnails: results.thumbnails.slice(0, currentValidThumbnails.length)
        } : {
            titles: currentValidTitles.map(() => 0),
            thumbnails: currentValidThumbnails.map(() => 0)
        };

        // Normalize initial results to match effective initial length
        const effectiveInitialResults = {
            titles: (initialResults.titles || []).slice(0, effectiveInitialTitles.length),
            thumbnails: (initialResults.thumbnails || []).slice(0, effectiveInitialThumbnails.length)
        };

        // Pad with zeros if needed
        while (effectiveInitialResults.titles.length < effectiveInitialTitles.length) {
            effectiveInitialResults.titles.push(0);
        }
        while (effectiveInitialResults.thumbnails.length < effectiveInitialThumbnails.length) {
            effectiveInitialResults.thumbnails.push(0);
        }

        const resultsChanged = JSON.stringify(currentResults) !== JSON.stringify(effectiveInitialResults);

        return titlesChanged || thumbnailsChanged || resultsChanged;
    })();

    // Can save only if valid AND something changed
    const canSave = isValid && hasChanges;

    // Calculate max percentage available for a slot
    const calcMax = (arr: number[], currentIndex: number) => {
        const othersSum = arr.reduce((sum, val, idx) => {
            return idx === currentIndex ? sum : sum + (val || 0);
        }, 0);
        // Fix floating point precision: 100 - 49.4 should be 50.6, not 50.59999..
        return Math.max(0, Number((100 - othersSum).toFixed(1)));
    };

    // Get border color based on ranking
    const getBorderColor = (value: number, allValues: number[], hasContent: boolean) => {
        if (!showResults || !isValid || !hasContent) return 'border-[#5F5F5F]';

        const rank = getABTestRank(value, allValues);
        return getRankBorderClass(rank);
    };

    // Prepare save data
    const prepareSaveData = (): ABTestingSaveData => {
        const currentValidTitles = titles.filter(t => t.trim());
        const currentValidThumbnails = thumbnails.filter(t => t);

        // Determine if packaging content changed (not just results)
        let packagingChanged = false;
        if (activeTab === 'title') {
            packagingChanged = JSON.stringify(currentValidTitles) !== JSON.stringify(titleVariants);
        } else if (activeTab === 'thumbnail') {
            packagingChanged = JSON.stringify(currentValidThumbnails) !== JSON.stringify(thumbnailVariants);
        } else { // both
            const titlesChange = JSON.stringify(currentValidTitles) !== JSON.stringify(titleVariants);
            const thumbnailsChange = JSON.stringify(currentValidThumbnails) !== JSON.stringify(thumbnailVariants);
            packagingChanged = titlesChange || thumbnailsChange;
        }

        /**
         * BUSINESS LOGIC: Mode-Based Data Isolation
         * ------------------------------------------
         * When saving, we only include data relevant to the selected test mode:
         * 
         * - 'title' mode:     titles populated, thumbnails = []
         * - 'thumbnail' mode: thumbnails populated, titles = []
         * - 'both' mode:      both populated
         * 
         * This prevents cross-contamination where selecting "title only" test
         * would inadvertently save the current thumbnail as a test variant.
         * Without this isolation, ThumbnailSection would incorrectly show
         * A/B test UI (split view, "Test" badge) for title-only tests.
         * 
         * The >= 2 threshold in ThumbnailSection relies on this behavior:
         * - Empty array (length 0) = no thumbnail test
         * - Single item (length 1) = would be ambiguous, but we prevent this
         * - Two+ items (length >= 2) = real thumbnail A/B test
         */
        const saveTitles = activeTab === 'thumbnail' ? [] : currentValidTitles;
        const saveThumbnails = activeTab === 'title' ? [] : currentValidThumbnails;

        return {
            mode: activeTab,
            titles: saveTitles,
            thumbnails: saveThumbnails,
            results: {
                titles: showResults ? results.titles.slice(0, saveTitles.length) : saveTitles.map(() => 0),
                thumbnails: showResults ? results.thumbnails.slice(0, saveThumbnails.length) : saveThumbnails.map(() => 0)
            },
            packagingChanged
        };
    };

    // Get save button text based on state
    const getSaveButtonText = () => {
        if (!isValid) return 'Set test';
        if (!hasChanges) return 'Set test';

        const hasExistingTitleTest = titleVariants.length >= 2;
        const hasExistingThumbnailTest = thumbnailVariants.length >= 2;

        const currentValidTitles = titles.filter(t => t.trim());
        const currentValidThumbnails = thumbnails.filter(t => t);

        let isNewTest = false;

        if (activeTab === 'title') {
            // It's a "Set Test" action ONLY if we are creating a test (2+ variants) 
            // where one didn't exist before.
            isNewTest = !hasExistingTitleTest && currentValidTitles.length >= 2;
        } else if (activeTab === 'thumbnail') {
            isNewTest = !hasExistingThumbnailTest && currentValidThumbnails.length >= 2;
        } else { // both
            // If we are upgrading EITHER part to a test (2+ vars) where it wasn't before
            const creatingTitleTest = !hasExistingTitleTest && currentValidTitles.length >= 2;
            const creatingThumbnailTest = !hasExistingThumbnailTest && currentValidThumbnails.length >= 2;
            isNewTest = creatingTitleTest || creatingThumbnailTest;
        }

        // If results changed (even if hidden/cleared), and a test already exists, it should be "Save"
        const hasExistingResults = (initialResults.titles?.some(v => v > 0)) || (initialResults.thumbnails?.some(v => v > 0));
        if (hasExistingResults && !isNewTest) return 'Save';

        return isNewTest ? 'Set test' : 'Save';
    };

    return {
        // State
        activeTab,
        setActiveTab,
        titles,
        thumbnails,
        results,
        showResults,
        setShowResults,
        fileInputRefs,

        // Validation
        validationError,
        isValid,
        hasChanges,
        canSave,

        // Handlers
        handleTitleChange,
        handleThumbnailUpload,
        handleRemoveThumbnail,
        handleResultChange,
        handleBothResultChange,

        // Utilities
        calcMax,
        getBorderColor,
        prepareSaveData,
        getSaveButtonText
    };
}

import { useState, useCallback, useEffect } from 'react';
import { DEFAULT_AB_RESULTS } from '../types';

/**
 * Manages A/B testing modal state and data.
 * 
 * KEY FEATURE: Supports "background save" for results-only changes.
 * When the user updates watch time share data without changing titles/thumbnails,
 * the `onResultsSave` callback is triggered to save results immediately to the server
 * without affecting the main packaging "dirty" state or version history.
 */

interface UseABTestingOptions {
    initialTitles?: string[];
    initialThumbnails?: string[];
    initialResults?: { titles: number[], thumbnails: number[] };
    /** Called when only results changed, allows parent to save results in background */
    onResultsSave?: (results: { titles: number[], thumbnails: number[] }) => void;
    /** Called when a single title is edited (not creating A/B test) */
    onTitleChange?: (title: string) => void;
    /** Called when a single thumbnail is edited (not creating A/B test) */
    onThumbnailChange?: (thumbnail: string) => void;
}

export const useABTesting = (options?: UseABTestingOptions) => {
    // A/B Testing state
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'title' | 'thumbnail' | 'both'>('title');

    // Data state
    const [abTestTitles, setAbTestTitles] = useState<string[]>(options?.initialTitles || []);
    const [abTestThumbnails, setAbTestThumbnails] = useState<string[]>(options?.initialThumbnails || []);
    const [abTestResults, setAbTestResults] = useState<{ titles: number[], thumbnails: number[] }>(
        options?.initialResults || DEFAULT_AB_RESULTS
    );

    // Sync state when props change (e.g. data loaded from server)
    useEffect(() => {
        if (options?.initialTitles) setAbTestTitles(options.initialTitles);
    }, [JSON.stringify(options?.initialTitles)]);

    useEffect(() => {
        if (options?.initialThumbnails) setAbTestThumbnails(options.initialThumbnails);
    }, [JSON.stringify(options?.initialThumbnails)]);

    useEffect(() => {
        if (options?.initialResults) setAbTestResults(options.initialResults);
    }, [JSON.stringify(options?.initialResults)]);

    // Handlers
    const handleOpenFromTitle = useCallback(() => {
        setActiveTab('title');
        setIsOpen(true);
    }, []);

    const handleOpenFromThumbnail = useCallback(() => {
        setActiveTab('thumbnail');
        setIsOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsOpen(false);
    }, []);

    /**
     * Handles save from the A/B modal.
     * - Always updates local state with new titles/thumbnails/results.
     * - If packagingChanged is FALSE (only results changed), triggers background save
     *   via onResultsSave callback so data persists without "Draft" status.
     * - If saving a single variant (not A/B test), syncs with main title/thumbnail.
     */
    const handleSave = useCallback((data: {
        mode: 'title' | 'thumbnail' | 'both';
        titles: string[];
        thumbnails: string[];
        results: { titles: number[], thumbnails: number[] };
        packagingChanged: boolean;
    }) => {
        setAbTestTitles(data.titles);
        setAbTestThumbnails(data.thumbnails);
        setAbTestResults(data.results);

        // If editing a single title (not creating A/B test), sync with main title
        if (data.titles.length === 1 && options?.onTitleChange) {
            options.onTitleChange(data.titles[0]);
        }

        // If editing a single thumbnail (not creating A/B test), sync with main thumbnail
        if (data.thumbnails.length === 1 && options?.onThumbnailChange) {
            options.onThumbnailChange(data.thumbnails[0]);
        }

        // If only results changed, trigger a background save
        if (!data.packagingChanged && options?.onResultsSave) {
            options.onResultsSave(data.results);
        }
    }, [options]);

    return {
        // State
        modalOpen: isOpen,
        initialTab: activeTab,
        titles: abTestTitles,
        thumbnails: abTestThumbnails,
        results: abTestResults,

        // Actions
        setTitles: setAbTestTitles,
        setThumbnails: setAbTestThumbnails,
        setResults: setAbTestResults,
        openFromTitle: handleOpenFromTitle,
        openFromThumbnail: handleOpenFromThumbnail,
        closeModal,
        saveChanges: handleSave,
    };
};

export type UseABTestingResult = ReturnType<typeof useABTesting>;

import { useState, useCallback } from 'react';
import { DEFAULT_AB_RESULTS } from '../types';

interface UseABTestingOptions {
    initialTitles?: string[];
    initialThumbnails?: string[];
    initialResults?: { titles: number[], thumbnails: number[] };
}

export const useABTesting = ({
    initialTitles,
    initialThumbnails,
    initialResults
}: UseABTestingOptions = {}) => {
    // A/B Testing state
    const [abTestModalOpen, setAbTestModalOpen] = useState(false);
    const [abTestInitialTab, setAbTestInitialTab] = useState<'title' | 'thumbnail' | 'both'>('title');

    // Data state
    const [abTestTitles, setAbTestTitles] = useState<string[]>(initialTitles || []);
    const [abTestThumbnails, setAbTestThumbnails] = useState<string[]>(initialThumbnails || []);
    const [abTestResults, setAbTestResults] = useState<{ titles: number[], thumbnails: number[] }>(
        initialResults || DEFAULT_AB_RESULTS
    );

    // Handlers
    const handleOpenFromTitle = useCallback(() => {
        setAbTestInitialTab('title');
        setAbTestModalOpen(true);
    }, []);

    const handleOpenFromThumbnail = useCallback(() => {
        setAbTestInitialTab('thumbnail');
        setAbTestModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setAbTestModalOpen(false);
    }, []);

    const handleSave = useCallback((data: {
        mode: 'title' | 'thumbnail' | 'both';
        titles: string[];
        thumbnails: string[];
        results: { titles: number[], thumbnails: number[] };
    }) => {
        setAbTestTitles(data.titles);
        setAbTestThumbnails(data.thumbnails);
        setAbTestResults(data.results);
        // Note: The parent component should handle showToast and isDirty marking
        // based on the updated values being passed back to form state
    }, []);

    return {
        // State
        modalOpen: abTestModalOpen,
        initialTab: abTestInitialTab,
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

import { useState, useCallback } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';

/**
 * BUSINESS LOGIC: CSV Upload Modal State Management
 * 
 * This hook manages the state for the CSV upload modal that appears when:
 * 1. Creating a new packaging version (if video is published)
 * 2. Restoring an old packaging version (if video is published)
 * 
 * The modal allows users to upload traffic data to "close" the current version,
 * enabling accurate view attribution between versions.
 */

interface CsvUploadModalState {
    isOpen: boolean;
    title: string;
    description: string;
    closingVersion: number | 'draft';
    onConfirm: ((sources: TrafficSource[], totalRow?: TrafficSource) => void) | null;
    onSkip: (() => void) | null;
}

export const useCsvUploadModal = () => {
    const [modalState, setModalState] = useState<CsvUploadModalState>({
        isOpen: false,
        title: '',
        description: '',
        closingVersion: 'draft',
        onConfirm: null,
        onSkip: null
    });

    /**
     * Show the CSV upload modal.
     * Returns a promise that resolves when user uploads CSV or skips.
     */
    const showModal = useCallback((params: {
        title: string;
        description: string;
        closingVersion: number | 'draft';
    }): Promise<{ sources: TrafficSource[]; totalRow?: TrafficSource } | null> => {
        return new Promise((resolve) => {
            setModalState({
                isOpen: true,
                title: params.title,
                description: params.description,
                closingVersion: params.closingVersion,
                onConfirm: (sources, totalRow) => {
                    resolve({ sources, totalRow });
                },
                onSkip: () => {
                    resolve(null);
                }
            });
        });
    }, []);

    /**
     * Close the modal
     */
    const closeModal = useCallback(() => {
        setModalState(prev => ({
            ...prev,
            isOpen: false
        }));
    }, []);

    return {
        modalState,
        showModal,
        closeModal
    };
};

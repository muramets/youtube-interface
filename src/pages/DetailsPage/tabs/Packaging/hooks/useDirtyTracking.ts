/**
 * useDirtyTracking Hook
 *
 * BUSINESS LOGIC: Tracks unsaved changes in a form
 *
 * - Compares current form values against a "loaded snapshot"
 * - Returns isDirty boolean
 * - Provides reset function to update snapshot after save
 * - Old versions are always clean (read-only)
 */

import { useState, useEffect, useCallback } from 'react';
import { type VideoLocalization, type CoverVersion } from '../../../../../utils/youtubeApi';
import { type ABTestResults } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface FormSnapshot {
    title: string;
    description: string;
    tags: string[];
    customImage: string;
    localizations: Record<string, VideoLocalization>;
    abTestTitles: string[];
    abTestThumbnails: string[];
    abTestResults: ABTestResults;
    coverHistory: CoverVersion[];
}

export interface CurrentFormValues {
    title: string;
    description: string;
    tags: string[];
    customImage: string;
    localizations: Record<string, VideoLocalization>;
    abTestTitles: string[];
    abTestThumbnails: string[];
    abTestResults: ABTestResults;
    coverHistory: CoverVersion[];
}

interface UseDirtyTrackingOptions {
    initialSnapshot: FormSnapshot;
    isReadOnly: boolean;
}

interface UseDirtyTrackingReturn {
    isDirty: boolean;
    loadedSnapshot: FormSnapshot;
    checkDirty: (current: CurrentFormValues) => void;
    resetSnapshot: (newSnapshot: FormSnapshot) => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useDirtyTracking({
    initialSnapshot,
    isReadOnly
}: UseDirtyTrackingOptions): UseDirtyTrackingReturn {
    const [isDirty, setIsDirty] = useState(false);
    const [loadedSnapshot, setLoadedSnapshot] = useState<FormSnapshot>(initialSnapshot);

    // BUSINESS LOGIC: Read-only versions are never dirty
    useEffect(() => {
        if (isReadOnly) {
            setIsDirty(false);
        }
    }, [isReadOnly]);

    // Check if current values differ from loaded snapshot
    const checkDirty = useCallback((current: CurrentFormValues) => {
        if (isReadOnly) {
            return; // Don't update dirty state for read-only views
        }

        const hasChanges =
            current.title !== loadedSnapshot.title ||
            current.description !== loadedSnapshot.description ||
            JSON.stringify(current.tags) !== JSON.stringify(loadedSnapshot.tags) ||
            current.customImage !== loadedSnapshot.customImage ||
            JSON.stringify(current.localizations) !== JSON.stringify(loadedSnapshot.localizations) ||
            JSON.stringify(current.abTestTitles) !== JSON.stringify(loadedSnapshot.abTestTitles) ||
            JSON.stringify(current.abTestThumbnails) !== JSON.stringify(loadedSnapshot.abTestThumbnails) ||
            JSON.stringify(current.abTestResults) !== JSON.stringify(loadedSnapshot.abTestResults) ||
            JSON.stringify(current.coverHistory) !== JSON.stringify(loadedSnapshot.coverHistory);

        // Only update if changed to prevent infinite loops
        if (hasChanges !== isDirty) {
            setIsDirty(hasChanges);
        }
    }, [loadedSnapshot, isDirty, isReadOnly]);

    // Reset snapshot after save or version switch
    const resetSnapshot = useCallback((newSnapshot: FormSnapshot) => {
        setLoadedSnapshot(newSnapshot);
        setIsDirty(false);
    }, []);

    return {
        isDirty,
        loadedSnapshot,
        checkDirty,
        resetSnapshot
    };
}

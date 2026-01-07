import { useState, useCallback, useMemo, useEffect } from 'react';
import type { PackagingVersion, VideoLocalization } from '../../../../../core/utils/youtubeApi';

interface PackagingSnapshot {
    title: string;
    description: string;
    tags: string[];
    coverImage: string | null;
    abTestTitles?: string[];
    abTestThumbnails?: string[];
    abTestResults?: {
        titles: number[];
        thumbnails: number[];
    };
    abTestVariants?: string[];
    localizations?: Record<string, VideoLocalization>;
    originalName?: string;
}

interface UsePackagingVersionsOptions {
    initialHistory: PackagingVersion[];
    initialCurrentVersion: number;
    isDraft: boolean;
}

export const usePackagingVersions = ({
    initialHistory,
    initialCurrentVersion,
    isDraft: initialIsDraft
}: UsePackagingVersionsOptions) => {
    // Version history
    const [packagingHistory, setPackagingHistory] = useState<PackagingVersion[]>(initialHistory);

    // Current version number (for next save)
    const [currentVersionNumber, setCurrentVersionNumber] = useState(initialCurrentVersion);

    // Is there a draft (unsaved changes beyond the latest version)?
    const [hasDraft, setHasDraft] = useState(initialIsDraft);

    // Which version is actively used by the video
    const [activeVersion, setActiveVersion] = useState<number | 'draft'>(
        initialIsDraft ? 'draft' : (initialHistory.length > 0
            ? Math.max(...initialHistory.map(v => v.versionNumber))
            : 'draft')
    );

    // Which version are we currently viewing in the form? 'draft' or a version number
    const [viewingVersion, setViewingVersion] = useState<number | 'draft'>(activeVersion);

    // ============================================================================
    // SYNC STATE: Re-initialize when video data changes (e.g., after navigation)
    // ============================================================================
    // This handles the case where user navigates away and back - the video prop
    // comes from Firestore and may have updated history that we need to load.
    useEffect(() => {
        setPackagingHistory(initialHistory);
        setCurrentVersionNumber(initialCurrentVersion);
        setHasDraft(initialIsDraft);

        const computedActiveVersion = initialIsDraft ? 'draft' : (initialHistory.length > 0
            ? Math.max(...initialHistory.map(v => v.versionNumber))
            : 'draft');
        setActiveVersion(computedActiveVersion);
        setViewingVersion(computedActiveVersion);
    }, [initialHistory, initialCurrentVersion, initialIsDraft]);

    // Sorted versions (newest first by version number)
    const sortedVersions = useMemo(() =>
        [...packagingHistory].sort((a, b) => b.versionNumber - a.versionNumber),
        [packagingHistory]
    );

    // Get a specific version's snapshot
    const getVersionSnapshot = useCallback((versionNumber: number): PackagingSnapshot | null => {
        const version = packagingHistory.find(v => v.versionNumber === versionNumber);
        return version?.configurationSnapshot || null;
    }, [packagingHistory]);

    // Switch to viewing a different version (doesn't change what's active)
    const switchToVersion = useCallback((versionNumber: number | 'draft') => {
        setViewingVersion(versionNumber);
    }, []);

    // Restore a version - makes it the active version
    const restoreVersion = useCallback((versionNumber: number) => {
        // Update endDate of current active version if it's not draft
        if (activeVersion !== 'draft') {
            setPackagingHistory(prev => prev.map(v =>
                v.versionNumber === activeVersion
                    ? { ...v, endDate: Date.now() }
                    : v
            ));
        }

        // Set new active version and update its endDate to now (most recently used)
        setActiveVersion(versionNumber);
        setViewingVersion(versionNumber);
        setHasDraft(false);

        // Update the restored version's endDate to mark it as most recently used
        setPackagingHistory(prev => prev.map(v =>
            v.versionNumber === versionNumber
                ? { ...v, endDate: Date.now() }
                : v
        ));
    }, [activeVersion]);

    // Create a new version from current state
    // Returns both the new version AND the updated history to avoid race condition
    // (React state updates are async, so getVersionsPayload would read stale state)
    const createVersion = useCallback((snapshot: PackagingSnapshot): {
        newVersion: PackagingVersion;
        updatedHistory: PackagingVersion[];
        currentPackagingVersion: number;
    } => {
        // Close out the previous active version
        let updatedHistory = packagingHistory;
        if (activeVersion !== 'draft') {
            updatedHistory = packagingHistory.map(v =>
                v.versionNumber === activeVersion
                    ? { ...v, endDate: Date.now() }
                    : v
            );
        }

        const newVersion: PackagingVersion = {
            versionNumber: currentVersionNumber,
            startDate: Date.now(),
            checkins: [],
            configurationSnapshot: snapshot
        };

        // Add new version to history
        updatedHistory = [...updatedHistory, newVersion];

        // Update React state for UI
        setPackagingHistory(updatedHistory);
        setCurrentVersionNumber(prev => prev + 1);
        setHasDraft(false);
        setActiveVersion(newVersion.versionNumber);
        setViewingVersion(newVersion.versionNumber);

        // Return synchronously for immediate use in save
        return {
            newVersion,
            updatedHistory,
            currentPackagingVersion: currentVersionNumber + 1
        };
    }, [currentVersionNumber, activeVersion, packagingHistory]);

    // Save as draft (mark that there are unsaved changes)
    const saveDraft = useCallback(() => {
        setHasDraft(true);
        setActiveVersion('draft');
        setViewingVersion('draft');
    }, []);

    // Delete a version
    const deleteVersion = useCallback((versionNumber: number) => {
        setPackagingHistory(prev => prev.filter(v => v.versionNumber !== versionNumber));

        // If we were viewing the deleted version, switch
        if (viewingVersion === versionNumber) {
            const remaining = packagingHistory.filter(v => v.versionNumber !== versionNumber);
            if (remaining.length > 0) {
                const newest = Math.max(...remaining.map(v => v.versionNumber));
                setViewingVersion(newest);
            } else {
                setViewingVersion('draft');
                setHasDraft(true);
            }
        }

        // If deleted version was active, switch to newest or draft
        if (activeVersion === versionNumber) {
            const remaining = packagingHistory.filter(v => v.versionNumber !== versionNumber);
            if (remaining.length > 0) {
                const newest = Math.max(...remaining.map(v => v.versionNumber));
                setActiveVersion(newest);
            } else {
                setActiveVersion('draft');
                setHasDraft(true);
            }
        }

        // If all versions deleted, reset version counter
        const remaining = packagingHistory.filter(v => v.versionNumber !== versionNumber);
        if (remaining.length === 0) {
            setCurrentVersionNumber(1);
        }
    }, [packagingHistory, viewingVersion, activeVersion]);

    // Mark as dirty (has unsaved changes)
    const markDirty = useCallback(() => {
        if (viewingVersion !== 'draft') {
            setHasDraft(true);
        }
    }, [viewingVersion]);

    // Get full payload for saving
    const getVersionsPayload = useCallback(() => ({
        packagingHistory,
        currentPackagingVersion: currentVersionNumber,
        isDraft: hasDraft
    }), [packagingHistory, currentVersionNumber, hasDraft]);

    return useMemo(() => ({
        // State
        packagingHistory,
        sortedVersions,
        currentVersionNumber,
        hasDraft,
        activeVersion,
        viewingVersion,

        // Actions
        switchToVersion,
        restoreVersion,
        createVersion,
        saveDraft,
        deleteVersion,
        markDirty,
        getVersionSnapshot,
        getVersionsPayload,

        // Direct setters for initialization
        setPackagingHistory,
        setHasDraft,
        setActiveVersion
    }), [
        packagingHistory,
        sortedVersions,
        currentVersionNumber,
        hasDraft,
        activeVersion,
        viewingVersion,
        switchToVersion,
        restoreVersion,
        createVersion,
        saveDraft,
        deleteVersion,
        markDirty,
        getVersionSnapshot,
        getVersionsPayload,
        setPackagingHistory,
        setHasDraft,
        setActiveVersion
    ]);
};

import { useState, useMemo, useCallback } from 'react';
import type { VideoDetails, CoverVersion, VideoLocalization } from '../../../../../core/utils/youtubeApi';
import { deepEqual } from '../../../../../core/utils/deepEqual';
import { DEFAULT_TAGS, DEFAULT_LOCALIZATIONS, DEFAULT_AB_RESULTS, DEFAULT_COVER_HISTORY } from '../types';

/**
 * Manages form state and dirty-checking for the Packaging tab.
 * 
 * KEY DESIGN DECISION: A/B test results (watch time share) are excluded from
 * dirty-checking and sync comparisons. This allows users to update results
 * without triggering "unsaved changes" warnings or affecting version history.
 * Results are saved immediately to the server in the background via a separate action.
 */

interface PackagingFormSnapshot {
    title: string;
    description: string;
    tags: string[];
    customImage: string;
    customImageName: string;
    customImageVersion: number;
    localizations: Record<string, VideoLocalization>;
    abTestTitles: string[];
    abTestThumbnails: string[];
    abTestResults: { titles: number[], thumbnails: number[] };
    coverHistory: CoverVersion[];
}

interface UsePackagingFormStateOptions {
    video: VideoDetails;
    isViewingOldVersion: boolean;
    localization: {
        getFullPayload: () => {
            title: string;
            description: string;
            tags: string[];
            localizations: Record<string, VideoLocalization>;
        };
        resetToSnapshot: (snapshot: {
            title: string;
            description: string;
            tags: string[];
            localizations?: Record<string, VideoLocalization>;
        }) => void;
        resetDirty: () => void;
    };
    abTesting: {
        titles: string[];
        thumbnails: string[];
        results: { titles: number[], thumbnails: number[] };
        setTitles: (val: string[]) => void;
        setThumbnails: (val: string[]) => void;
        setResults: (val: { titles: number[], thumbnails: number[] }) => void;
    };
}

export const usePackagingFormState = ({
    video,
    // isViewingOldVersion is currently unused in logic but kept for future "read-only" flags
    isViewingOldVersion,
    localization,
    abTesting
}: UsePackagingFormStateOptions) => {
    // Non-localized form state
    const [customImage, setCustomImage] = useState(video.customImage || '');
    const [customImageName, setCustomImageName] = useState(video.customImageName || '');
    const [customImageVersion, setCustomImageVersion] = useState(video.customImageVersion || 1);
    const [publishedVideoId, setPublishedVideoId] = useState(video.publishedVideoId || '');
    const [videoRender, setVideoRender] = useState(video.videoRender || '');
    const [audioRender, setAudioRender] = useState(video.audioRender || '');
    const [pendingHistory, setPendingHistory] = useState<CoverVersion[]>(video.coverHistory || DEFAULT_COVER_HISTORY);

    // Snapshot of the last saved state (for dirty checking)
    const [loadedSnapshot, setLoadedSnapshot] = useState<PackagingFormSnapshot>({
        title: video.title || '',
        description: video.description || '',
        tags: video.tags || DEFAULT_TAGS,
        customImage: video.customImage || '',
        customImageName: video.customImageName || '',
        customImageVersion: video.customImageVersion || 1,
        localizations: video.localizations || DEFAULT_LOCALIZATIONS,
        abTestTitles: video.abTestTitles || DEFAULT_TAGS,
        abTestThumbnails: video.abTestThumbnails || DEFAULT_TAGS,
        abTestResults: video.abTestResults || DEFAULT_AB_RESULTS as { titles: number[], thumbnails: number[] },
        coverHistory: video.coverHistory || DEFAULT_COVER_HISTORY
    });

    /**
     * Determines if the form has unsaved changes.
     * 
     * NOTE: A/B test results (watch time share) are intentionally EXCLUDED
     * from this check. Results are saved in the background independently
     * and do not affect the main packaging "dirty" state.
     */
    const isDirty = useMemo(() => {
        // Old versions were previously read-only, but now we allow editing to support "Forking".
        // So we calculate isDirty normally regardless of isViewingOldVersion.
        // if (isViewingOldVersion) return false;

        const locPayload = localization.getFullPayload();

        const currentSnapshot: PackagingFormSnapshot = {
            title: locPayload.title,
            description: locPayload.description,
            tags: locPayload.tags,
            localizations: locPayload.localizations,
            customImage,
            customImageName,
            customImageVersion,
            abTestTitles: abTesting.titles,
            abTestThumbnails: abTesting.thumbnails,
            abTestResults: abTesting.results,
            coverHistory: pendingHistory
        };

        // Note: abTestResults are intentionally excluded from dirty check 
        // Compare everything except results to determine if the form is dirty
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { abTestResults: _unusedCurrent, ...restCurrent } = currentSnapshot;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { abTestResults: _unusedLoaded, ...restLoaded } = loadedSnapshot;
        return !deepEqual(restCurrent, restLoaded);
    }, [
        localization.getFullPayload,
        customImage,
        customImageName, // Added dependency
        customImageVersion,
        abTesting.titles,
        abTesting.thumbnails,
        abTesting.results,
        pendingHistory,
        loadedSnapshot
    ]);

    // Reset form to a specific snapshot (used when loading versions)
    const resetToSnapshot = useCallback((snapshot: PackagingFormSnapshot) => {
        localization.resetToSnapshot({
            title: snapshot.title,
            description: snapshot.description,
            tags: snapshot.tags,
            localizations: snapshot.localizations
        });
        setCustomImage(snapshot.customImage);
        setCustomImageName(snapshot.customImageName);
        setCustomImageVersion(snapshot.customImageVersion);
        setPendingHistory(snapshot.coverHistory);
        abTesting.setTitles(snapshot.abTestTitles);
        abTesting.setThumbnails(snapshot.abTestThumbnails);
        abTesting.setResults(snapshot.abTestResults);

        setLoadedSnapshot(snapshot);
    }, [localization, abTesting]);

    // Update the snapshot to current form values (used after save)
    const updateSnapshotToCurrent = useCallback(() => {
        const locPayload = localization.getFullPayload();
        setLoadedSnapshot({
            title: locPayload.title,
            description: locPayload.description,
            tags: locPayload.tags,
            localizations: locPayload.localizations,
            customImage,
            customImageName,
            customImageVersion,
            abTestTitles: abTesting.titles,
            abTestThumbnails: abTesting.thumbnails,
            abTestResults: abTesting.results,
            coverHistory: pendingHistory
        });
        localization.resetDirty();
    }, [localization, customImage, customImageName, customImageVersion, abTesting, pendingHistory]);

    /**
     * Checks if incoming video props match the current loaded snapshot.
     * Used to detect external changes (e.g., from another tab or Firebase sync).
     * 
     * NOTE: A/B test results are EXCLUDED from this comparison to prevent
     * the sync loop from resetting locally-saved results before they're
     * persisted to the server.
     */
    const incomingVideoMatchesSnapshot = useCallback((videoSnapshot: PackagingFormSnapshot) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { abTestResults: _unusedIncoming, ...incomingRest } = videoSnapshot;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { abTestResults: _unusedLoaded, ...loadedRest } = loadedSnapshot;
        return deepEqual(incomingRest, loadedRest);
    }, [loadedSnapshot]);

    return {
        // State
        customImage, setCustomImage,
        customImageName, setCustomImageName,
        customImageVersion, setCustomImageVersion,
        publishedVideoId, setPublishedVideoId,
        videoRender, setVideoRender,
        audioRender, setAudioRender,
        pendingHistory, setPendingHistory,
        loadedSnapshot, setLoadedSnapshot,

        // Results of computed state
        isDirty,
        isViewingOldVersion,

        // Helpers
        resetToSnapshot,
        updateSnapshotToCurrent,
        incomingVideoMatchesSnapshot
    };
};

export type UsePackagingFormStateResult = ReturnType<typeof usePackagingFormState>;

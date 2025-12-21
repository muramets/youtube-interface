import { useState, useMemo, useCallback } from 'react';
import { type VideoDetails, type CoverVersion, type VideoLocalization } from '../../../../../core/utils/youtubeApi';
import { deepEqual } from '../../../../../core/utils/deepEqual';
import { DEFAULT_TAGS, DEFAULT_LOCALIZATIONS, DEFAULT_AB_RESULTS, DEFAULT_COVER_HISTORY } from '../types';

interface PackagingSnapshot {
    title: string;
    description: string;
    tags: string[];
    customImage: string;
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
    isViewingOldVersion,
    localization,
    abTesting
}: UsePackagingFormStateOptions) => {
    // Non-localized form state
    const [customImage, setCustomImage] = useState(video.customImage || '');
    const [publishedVideoId, setPublishedVideoId] = useState(video.publishedVideoId || '');
    const [videoRender, setVideoRender] = useState(video.videoRender || '');
    const [audioRender, setAudioRender] = useState(video.audioRender || '');
    const [pendingHistory, setPendingHistory] = useState<CoverVersion[]>(video.coverHistory || DEFAULT_COVER_HISTORY);

    // Snapshot of the last saved state (for dirty checking)
    const [loadedSnapshot, setLoadedSnapshot] = useState<PackagingSnapshot>({
        title: video.title || '',
        description: video.description || '',
        tags: video.tags || DEFAULT_TAGS,
        customImage: video.customImage || '',
        localizations: video.localizations || DEFAULT_LOCALIZATIONS,
        abTestTitles: video.abTestTitles || DEFAULT_TAGS,
        abTestThumbnails: video.abTestThumbnails || DEFAULT_TAGS,
        abTestResults: video.abTestResults || DEFAULT_AB_RESULTS as { titles: number[], thumbnails: number[] },
        coverHistory: video.coverHistory || DEFAULT_COVER_HISTORY
    });

    // Check if form is dirty using deep equality
    const isDirty = useMemo(() => {
        // Old versions are read-only, never dirty
        if (isViewingOldVersion) return false;

        const locPayload = localization.getFullPayload();

        const currentSnapshot: PackagingSnapshot = {
            title: locPayload.title,
            description: locPayload.description,
            tags: locPayload.tags,
            localizations: locPayload.localizations,
            customImage,
            abTestTitles: abTesting.titles,
            abTestThumbnails: abTesting.thumbnails,
            abTestResults: abTesting.results,
            coverHistory: pendingHistory
        };

        return !deepEqual(currentSnapshot, loadedSnapshot);
    }, [
        isViewingOldVersion,
        localization.getFullPayload, // This needs to be stable or useMemo'd in hook
        customImage,
        abTesting.titles,
        abTesting.thumbnails,
        abTesting.results,
        pendingHistory,
        loadedSnapshot
    ]);

    // Reset form to a specific snapshot (used when loading versions)
    const resetToSnapshot = useCallback((snapshot: PackagingSnapshot) => {
        localization.resetToSnapshot({
            title: snapshot.title,
            description: snapshot.description,
            tags: snapshot.tags,
            localizations: snapshot.localizations
        });
        setCustomImage(snapshot.customImage);
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
            abTestTitles: abTesting.titles,
            abTestThumbnails: abTesting.thumbnails,
            abTestResults: abTesting.results,
            coverHistory: pendingHistory
        });
        localization.resetDirty();
    }, [localization, customImage, abTesting, pendingHistory]);

    // Add a helper to check if incoming video props have changed significantly
    // This replaces the complex logic in PackagingTab.tsx around loading
    const incomingVideoMatchesSnapshot = useCallback((videoSnapshot: PackagingSnapshot) => {
        return deepEqual(videoSnapshot, loadedSnapshot);
    }, [loadedSnapshot]);

    return {
        // State
        customImage, setCustomImage,
        publishedVideoId, setPublishedVideoId,
        videoRender, setVideoRender,
        audioRender, setAudioRender,
        pendingHistory, setPendingHistory,

        // Dirty State
        isDirty,
        loadedSnapshot,

        // Actions
        resetToSnapshot,
        updateSnapshotToCurrent,
        incomingVideoMatchesSnapshot
    };
};

export type UsePackagingFormStateResult = ReturnType<typeof usePackagingFormState>;

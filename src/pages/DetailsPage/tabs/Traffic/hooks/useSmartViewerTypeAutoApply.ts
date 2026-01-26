import { useEffect, useRef } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { VideoDetails } from '../../../../../core/utils/youtubeApi';
import { useViewerTypeStore } from '../../../../../core/stores/useViewerTypeStore';
import { assistantLogger } from '../../../../../core/utils/logger';
import { durationToSeconds } from '../utils/formatters';
import type { ViewerType } from '../../../../../core/types/viewerType';

/**
 * Hook to automatically apply "Viewer Type" based on AVD vs Video Duration.
 * 
 * Logic (Pure Percentages):
 * - Bouncer: < 1%
 * - Trialist: 1.1% - 10%
 * - Explorer: 10.1% - 30%
 * - Interested: 30.1% - 60%
 * - Core: 60.1% - 95%
 * - Passive: > 95%
 */
export const useSmartViewerTypeAutoApply = (
    isAssistantEnabled: boolean,
    displayedSources: TrafficSource[],
    mainVideo: VideoDetails
) => {
    const { edges, setViewerTypes } = useViewerTypeStore();

    const edgesRef = useRef(edges);
    useEffect(() => {
        edgesRef.current = edges;
    }, [edges]);

    useEffect(() => {
        if (!isAssistantEnabled) return;

        // Ensure we have duration to work with
        const videoDurationStr = mainVideo.mergedVideoData?.duration || mainVideo.duration;
        if (!videoDurationStr) return;

        const totalDurationSeconds = durationToSeconds(videoDurationStr);
        if (totalDurationSeconds <= 0) return;

        const updates: Array<{ sourceVideoId: string; type: ViewerType; source: 'smart_assistant' }> = [];

        displayedSources.forEach(source => {
            if (!source.videoId) return;

            // Skip if already assigned
            if (edgesRef.current[source.videoId]?.type) return;

            const avdSeconds = durationToSeconds(source.avgViewDuration);
            const percentage = (avdSeconds / totalDurationSeconds) * 100;

            let type: ViewerType;

            if (percentage < 1) {
                type = 'bouncer';
            } else if (percentage <= 10) {
                type = 'trialist';
            } else if (percentage <= 30) {
                type = 'explorer';
            } else if (percentage <= 60) {
                type = 'interested';
            } else if (percentage <= 95) {
                type = 'core';
            } else {
                type = 'passive';
            }

            updates.push({ sourceVideoId: source.videoId, type, source: 'smart_assistant' });
        });

        if (updates.length > 0) {
            setViewerTypes(updates);
            assistantLogger.info(`Auto-applied Viewer Type to ${updates.length} videos`);
        }

    }, [isAssistantEnabled, displayedSources, setViewerTypes, mainVideo]);
};

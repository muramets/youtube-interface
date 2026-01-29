import { useEffect, useRef } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import { useTrafficTypeStore } from '../../../../../core/stores/useTrafficTypeStore';
import { assistantLogger } from '../../../../../core/utils/logger';

/**
 * Hook to automatically apply "Suggested (Autoplay)" traffic type to videos
 * that meet the specific heuristic: impressions === 0 && views > 0
 * 
 * Only active when isAssistantEnabled is true.
 */
export const useSmartTrafficAutoApply = (
    isAssistantEnabled: boolean,
    displayedSources: TrafficSource[]
) => {
    const { edges, setTrafficType } = useTrafficTypeStore();

    const edgesRef = useRef(edges);
    useEffect(() => {
        edgesRef.current = edges;
    }, [edges]);

    useEffect(() => {
        if (!isAssistantEnabled) return;

        let appliedCount = 0;

        displayedSources.forEach(source => {
            if (!source.videoId) return;

            // Rule: 0 Impressions, >0 Views implies Autoplay
            const isZeroImpressions = source.impressions === 0;
            const hasViews = source.views > 0;

            if (isZeroImpressions && hasViews) {
                const currentEdge = edgesRef.current[source.videoId];

                // OPTIMIZATION: Check if traffic type is already set.
                if (currentEdge?.type) return;

                // Rule: 0 Impressions, >0 Views IMPLIES Autoplay
                setTrafficType(source.videoId, 'autoplay', 'smart_assistant');
                appliedCount++;
            }
        });

        if (appliedCount > 0) {
            assistantLogger.info(`Auto-applied Autoplay type to ${appliedCount} videos`);
        }

    }, [isAssistantEnabled, displayedSources, setTrafficType]);
};

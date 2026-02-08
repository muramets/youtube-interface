import { useEffect, useRef } from 'react';
import type { TrafficSource } from '../../../../../core/types/traffic';
import type { TrafficType } from '../../../../../core/types/videoTrafficType';
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
    const { edges, setTrafficTypes } = useTrafficTypeStore();

    const edgesRef = useRef(edges);
    useEffect(() => {
        edgesRef.current = edges;
    }, [edges]);

    useEffect(() => {
        if (!isAssistantEnabled) return;

        const updates: Array<{ sourceVideoId: string; type: TrafficType; source: 'smart_assistant' }> = [];

        displayedSources.forEach(source => {
            if (!source.videoId) return;

            // Rule: 0 Impressions, >0 Views implies Autoplay
            const isZeroImpressions = source.impressions === 0;
            const hasViews = source.views > 0;

            if (isZeroImpressions && hasViews) {
                const currentEdge = edgesRef.current[source.videoId];

                // OPTIMIZATION: Check if traffic type is already set.
                if (currentEdge?.type) return;

                updates.push({ sourceVideoId: source.videoId, type: 'autoplay', source: 'smart_assistant' });
            }
        });

        if (updates.length > 0) {
            setTrafficTypes(updates);
            assistantLogger.info(`Auto-applied Autoplay type to ${updates.length} videos`);
        }

    }, [isAssistantEnabled, displayedSources, setTrafficTypes]);
};

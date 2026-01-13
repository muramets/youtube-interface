import { useEffect } from 'react';
import { TrafficSource } from '../../../../../core/types/traffic';
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

    useEffect(() => {
        if (!isAssistantEnabled) return;

        let appliedCount = 0;

        displayedSources.forEach(source => {
            if (!source.videoId) return;

            // Rule: 0 Impressions, >0 Views implies Autoplay
            const isZeroImpressions = source.impressions === 0;
            const hasViews = source.views > 0;

            if (isZeroImpressions && hasViews) {
                const currentEdge = edges[source.videoId];

                // Only apply if not already set (or if we want to overwrite 'manual' which is risky, 
                // but user said "if assistant enabled... apply". 
                // Let's settle on: Apply if NOT set, OR if set by assistant previously. 
                // But safest is: Apply if undefined.
                // Re-reading user request: "нужно проставлять и везде сохранять в базе" 
                // and "если... smart assistant все еще включен - он все меняет и для них traffic type"
                // This implies aggressive setting.

                // Let's just check if it's NOT already 'autoplay'.
                if (!currentEdge || currentEdge.type !== 'autoplay') {
                    setTrafficType(source.videoId, 'autoplay', 'smart_assistant');
                    appliedCount++;
                }
            }
        });

        if (appliedCount > 0) {
            assistantLogger.info(`Auto-applied Autoplay type to ${appliedCount} videos`);
        }

    }, [isAssistantEnabled, displayedSources, edges, setTrafficType]);
};

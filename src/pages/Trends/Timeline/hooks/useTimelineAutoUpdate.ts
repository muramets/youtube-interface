import { useState, useCallback } from 'react';
import type { TrendVideo, TimelineStats } from '../../../../core/types/trends';

interface UseTimelineAutoUpdateProps {
    videos: TrendVideo[];
    forcedStats?: TimelineStats;
    skipAutoFitRef?: React.RefObject<boolean>;
    filterHash?: string;
}

export const useTimelineAutoUpdate = ({ videos, forcedStats, skipAutoFitRef, filterHash }: UseTimelineAutoUpdateProps) => {
    // State for MANUAL updates
    const [manualVersion, setManualVersion] = useState(0);

    // State for derived updates (replaces refs)
    const [prevProps, setPrevProps] = useState({
        count: videos.length,
        stats: forcedStats,
        hash: filterHash
    });

    // We track the auto-increment version in state now to trigger re-renders safely
    const [autoVersion, setAutoVersion] = useState(0);
    const [shouldAutoFit, setShouldAutoFit] = useState(false);

    // --- Derivation Logic (Run during render) ---
    const currentCount = videos.length;

    const hasStatsChanged = prevProps.stats !== forcedStats;
    const hasHashChanged = prevProps.hash !== filterHash;
    const hasCountChanged = prevProps.count !== currentCount;

    if (hasStatsChanged || hasHashChanged || hasCountChanged) {
        // Update history
        setPrevProps({
            count: currentCount,
            stats: forcedStats,
            hash: filterHash
        });

        // Logic 1: Significant Change?
        let shouldUpdate = false;
        let fit = false;

        // Logic 2: Filter/Context Switch
        if (hasStatsChanged || hasHashChanged) {
            // eslint-disable-next-line react-hooks/refs
            const isSkipRequested = skipAutoFitRef?.current === true;
            fit = hasHashChanged ? true : !isSkipRequested;
            shouldUpdate = true;
        }
        // Logic 3: Count Changed (but Context Same)
        else if (hasCountChanged) {
            if (!forcedStats) {
                // eslint-disable-next-line react-hooks/refs
                const isSkipRequested = skipAutoFitRef?.current === true;
                fit = !isSkipRequested;
                shouldUpdate = true;
            }
        }

        if (shouldUpdate) {
            setAutoVersion(v => v + 1);
            setShouldAutoFit(fit);
        }
    }

    const forceStructureUpdate = useCallback((fit: boolean = true) => {
        setShouldAutoFit(fit);
        setManualVersion(v => v + 1);
    }, []);

    // Combine manual + auto versions for a unique token
    const structureVersion = manualVersion + autoVersion;

    return {
        structureVersion,
        shouldAutoFit,
        forceStructureUpdate
    };
};

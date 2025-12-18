import { useState, useRef, useEffect, useCallback } from 'react';
import type { TrendVideo, TimelineStats } from '../../../../types/trends';

interface UseTimelineAutoUpdateProps {
    videos: TrendVideo[];
    forcedStats?: TimelineStats;
    skipAutoFitRef?: React.RefObject<boolean>;
}

export const useTimelineAutoUpdate = ({ videos, forcedStats, skipAutoFitRef }: UseTimelineAutoUpdateProps) => {
    // State to control structure updates ('Z' key forces update)
    const [structureVersion, setStructureVersion] = useState(0);
    // Track whether the current structure version update should trigger an auto-fit
    const [shouldAutoFit, setShouldAutoFit] = useState(false);

    // Smart Structure Updates:
    // We want the timeline to re-calculate structure (Fit) automatically in specific cases,
    // but stay "Frozen" in others (to preserve context).
    const prevVideoCountRef = useRef(videos.length);
    const prevForcedStatsRef = useRef(forcedStats);

    useEffect(() => {
        const currentCount = videos.length;
        const prevCount = prevVideoCountRef.current;
        const prevStats = prevForcedStatsRef.current;
        const hasStatsChanged = prevStats !== forcedStats;

        // Update refs
        prevVideoCountRef.current = currentCount;
        prevForcedStatsRef.current = forcedStats;

        // 1. Significance Check: If count didn't change and stats didn't change, do nothing.
        if (currentCount === prevCount && !hasStatsChanged) return;

        // Determine if we should fit on this update
        const isSkipRequested = skipAutoFitRef?.current === true;

        // 2. Context Switch (Global <-> Local OR Global stats update)
        // If the context defining the "World" changes, we MUST update.
        if (hasStatsChanged) {
            setShouldAutoFit(!isSkipRequested);
            setStructureVersion(v => v + 1);
            return;
        }

        // 3. Filter Changes (Count Changed)
        if (currentCount !== prevCount) {
            // STRICT FREEZE:
            // If we are in Global Mode (forcedStats provided), we NEVER update structure
            // regardless of whether videos are being added or removed.
            // User must press Z to refit.
            if (forcedStats) {
                return;
            }

            // Local Mode: Always re-calculate structure and fit
            setShouldAutoFit(!isSkipRequested);
            setStructureVersion(v => v + 1);
        }
    }, [videos.length, forcedStats, skipAutoFitRef]);

    const forceStructureUpdate = useCallback((fit: boolean = true) => {
        setShouldAutoFit(fit);
        setStructureVersion(v => v + 1);
    }, []);

    return {
        structureVersion,
        shouldAutoFit,
        forceStructureUpdate
    };
};

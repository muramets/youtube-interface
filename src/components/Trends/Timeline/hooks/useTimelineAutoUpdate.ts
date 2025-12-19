import { useState, useRef, useEffect, useCallback } from 'react';
import type { TrendVideo, TimelineStats } from '../../../../types/trends';

interface UseTimelineAutoUpdateProps {
    videos: TrendVideo[];
    forcedStats?: TimelineStats;
    skipAutoFitRef?: React.RefObject<boolean>;
    filterHash?: string;
}

export const useTimelineAutoUpdate = ({ videos, forcedStats, skipAutoFitRef, filterHash }: UseTimelineAutoUpdateProps) => {
    // State to control structure updates ('Z' key forces update)
    const [structureVersion, setStructureVersion] = useState(0);
    // Track whether the current structure version update should trigger an auto-fit
    const [shouldAutoFit, setShouldAutoFit] = useState(false);

    // Smart Structure Updates:
    // We want the timeline to re-calculate structure (Fit) automatically in specific cases,
    // but stay "Frozen" in others (to preserve context).
    const prevVideoCountRef = useRef(videos.length);
    const prevForcedStatsRef = useRef(forcedStats);
    const prevFilterHashRef = useRef(filterHash);

    useEffect(() => {
        const currentCount = videos.length;
        const prevCount = prevVideoCountRef.current;
        const prevStats = prevForcedStatsRef.current;
        const prevHash = prevFilterHashRef.current;

        const hasStatsChanged = prevStats !== forcedStats;
        const hasHashChanged = filterHash !== prevHash;

        // Update refs
        prevVideoCountRef.current = currentCount;
        prevForcedStatsRef.current = forcedStats;
        prevFilterHashRef.current = filterHash;

        // 1. Significance Check: If nothing significant changed, do nothing.
        if (currentCount === prevCount && !hasStatsChanged && !hasHashChanged) return;

        // Determine if we should fit on this update
        const isSkipRequested = skipAutoFitRef?.current === true;

        // 2. Filter/Context Switch (Global <-> Local OR Filter Hash Change)
        // If the context defining the "World" changes, we MUST update.
        // This includes Niche Filters changing (Hash Change).
        if (hasStatsChanged || hasHashChanged) {
            // New logic: If Hash changed (explicit filter change), ALWAYS fit (ignore skip).
            // If only Stats changed (e.g. Mode toggle Global->Filtered), respect skip.
            const shouldFit = hasHashChanged ? true : !isSkipRequested;

            setShouldAutoFit(shouldFit);
            setStructureVersion(v => v + 1);
            return;
        }

        // 3. Filter Changes (Count Changed) BUT Hash Same (e.g. Visibility Toggle)
        if (currentCount !== prevCount) {
            // STRICT FREEZE (Business Logic):
            // If we are in Global Mode (forcedStats provided) AND the Filter Hash hasn't changed,
            // we assume this is a "Visibility Toggle" of channels (e.g. clicking eye icon).
            // User REQ: Visibility toggles should be MANUAL updates only to avoid disorienting jumps.
            // We DO NOT update structure here. User must press 'Z' (manual fit) to refit/update.
            if (forcedStats) {
                return;
            }

            // Local Mode: Always re-calculate structure and fit for any change
            setShouldAutoFit(!isSkipRequested);
            setStructureVersion(v => v + 1);
        }
    }, [videos.length, forcedStats, skipAutoFitRef, filterHash]);

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

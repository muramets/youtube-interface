import { useMemo } from 'react';
import { formatDuration } from '../utils/formatDuration';

// ─── Constants ──────────────────────────────────────────────────────────
const CANDIDATE_INTERVALS_S = [15, 30, 60, 120, 300, 600, 900, 1800];
const MIN_LABEL_SPACING_PX = 70;

export interface RulerTick {
    px: number;
    label: string | null;
    isMajor: boolean;
}

/**
 * Generates ruler ticks from the timeline duration and pxPerSecond.
 * Extracted to a dedicated hook file so TimelineRuler.tsx only exports
 * React components (required by react-refresh/only-export-components).
 */
export function useRulerTicks(pxPerSecond: number, timelineDuration: number): RulerTick[] {
    return useMemo(() => {
        if (pxPerSecond <= 0) return [];

        const labelInterval = CANDIDATE_INTERVALS_S.find(
            (interval) => interval * pxPerSecond >= MIN_LABEL_SPACING_PX
        ) ?? CANDIDATE_INTERVALS_S[CANDIDATE_INTERVALS_S.length - 1];

        const minorInterval = labelInterval / 2;
        const ticks: RulerTick[] = [];
        const maxTime = Math.ceil(timelineDuration / minorInterval) * minorInterval;

        for (let t = 0; t <= maxTime; t += minorInterval) {
            const isLabel = t % labelInterval === 0;
            ticks.push({
                px: Math.round(t * pxPerSecond),
                label: isLabel ? formatDuration(t) : null,
                isMajor: isLabel,
            });
        }
        return ticks;
    }, [timelineDuration, pxPerSecond]);
}

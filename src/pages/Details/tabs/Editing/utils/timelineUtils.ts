import type { TimelineTrack } from '../../../../../core/types/editing';
import { getEffectiveDuration } from '../../../../../core/types/editing';

/** Minimum display width in pixels for very short tracks */
const MIN_TRACK_WIDTH = 60;

/** Compute the display width (px) for a single track */
function trackDisplayWidth(track: TimelineTrack, pxPerSecond: number): number {
    return Math.max(MIN_TRACK_WIDTH, Math.round(getEffectiveDuration(track) * pxPerSecond));
}

/**
 * Precompute cumulative elapsed durations (seconds) for an array of tracks.
 * Returns an array of length `tracks.length + 1` where result[i] is the
 * total duration of all tracks before index i.
 */
export function cumulativeElapsedArray(tracks: TimelineTrack[]): number[] {
    const result = new Array<number>(tracks.length + 1);
    result[0] = 0;
    for (let i = 0; i < tracks.length; i++) {
        result[i + 1] = result[i] + getEffectiveDuration(tracks[i]);
    }
    return result;
}

/**
 * Convert a timeline position (seconds) to a pixel offset.
 * Accounts for the minimum track width (60px) for very short tracks.
 */
export function positionToPixel(
    tracks: TimelineTrack[],
    position: number,
    pxPerSecond: number,
    cumulativeElapsed?: number[],
): number {
    let px = 0;
    for (let i = 0; i < tracks.length; i++) {
        const td = getEffectiveDuration(tracks[i]);
        const displayW = trackDisplayWidth(tracks[i], pxPerSecond);
        const elapsed = cumulativeElapsed ? cumulativeElapsed[i] : tracks.slice(0, i).reduce((s, t) => s + getEffectiveDuration(t), 0);
        if (position <= elapsed + td) {
            const fraction = td > 0 ? (position - elapsed) / td : 0;
            return px + fraction * displayW;
        }
        px += displayW;
    }
    return px;
}

/**
 * Convert a pixel offset to a timeline position (seconds).
 * Inverse of `positionToPixel`. Clamps to [0, totalDuration].
 */
export function pixelToPosition(
    tracks: TimelineTrack[],
    px: number,
    pxPerSecond: number,
    totalDuration: number,
): number {
    let elapsed = 0;
    let pxAccum = 0;
    for (const t of tracks) {
        const td = getEffectiveDuration(t);
        const displayW = trackDisplayWidth(t, pxPerSecond);
        if (px <= pxAccum + displayW) {
            const fraction = displayW > 0 ? (px - pxAccum) / displayW : 0;
            return Math.max(0, Math.min(totalDuration, elapsed + fraction * td));
        }
        elapsed += td;
        pxAccum += displayW;
    }
    return totalDuration;
}

/**
 * Find which track contains a given timeline position (seconds),
 * and compute the seek offset within that track.
 */
export function findTrackAtPosition(
    tracks: TimelineTrack[],
    positionS: number,
    cumulativeElapsed: number[],
): { index: number; track: TimelineTrack; seekWithinTrack: number; elapsed: number } | null {
    for (let i = 0; i < tracks.length; i++) {
        const td = getEffectiveDuration(tracks[i]);
        if (positionS < cumulativeElapsed[i] + td) {
            return {
                index: i,
                track: tracks[i],
                seekWithinTrack: (positionS - cumulativeElapsed[i]) + tracks[i].trimStart,
                elapsed: cumulativeElapsed[i],
            };
        }
    }
    return null;
}

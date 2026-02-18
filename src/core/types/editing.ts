import { DEFAULT_GENRES, type Track } from './track';

// ─── Timeline Track ────────────────────────────────────────────────────
export interface TimelineTrack {
    /** Unique ID within the editing session (not the same as Track.id — allows dupes) */
    id: string;
    /** Reference to the source Track from musicStore */
    trackId: string;
    /** Which variant is used */
    variant: 'vocal' | 'instrumental';
    /** Duration in seconds (copied from Track for quick access) */
    duration: number;
    /** Per-track volume 0–1 */
    volume: number;
    /** Genre of the track */
    genre: string;
    /** Hex color derived from genre (e.g. '#F59E0B') */
    genreColor: string;
    /** Snapshot of essential track metadata */
    title: string;
    artist?: string;
    coverUrl?: string;
    /** Audio URL for the selected variant */
    audioUrl: string;
    /** Firebase Storage path for the selected variant (for server-side rendering) */
    audioStoragePath?: string;
    /** Pre-computed waveform peaks for the selected variant */
    peaks?: number[];
    /** Seconds trimmed from the beginning (audio starts at trimStart) */
    trimStart: number;
    /** Seconds trimmed from the end (audio ends at duration - trimEnd) */
    trimEnd: number;
}

/** Effective playback duration after trim (single source of truth). */
export function getEffectiveDuration(t: TimelineTrack): number {
    return t.duration - t.trimStart - t.trimEnd;
}

// ─── Render Resolution ─────────────────────────────────────────────────
export type RenderResolution = '720p' | '1080p' | '1440p' | '4k';

export interface ResolutionConfig {
    label: string;
    width: number;
    height: number;
}

export const RESOLUTION_PRESETS: Record<RenderResolution, ResolutionConfig> = {
    '720p': { label: '720p HD', width: 1280, height: 720 },
    '1080p': { label: '1080p FHD', width: 1920, height: 1080 },
    '1440p': { label: '1440p QHD', width: 2560, height: 1440 },
    '4k': { label: '4K UHD', width: 3840, height: 2160 },
};

// ─── Editing Store State ───────────────────────────────────────────────
export interface EditingState {
    // Persistence
    videoId: string | null;
    // Timeline
    tracks: TimelineTrack[];
    // Image
    imageUrl: string | null;
    imageStoragePath: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    // Render settings
    resolution: RenderResolution;
    loopCount: number;
    volume: number;          // 0–1 master volume for render
    // Playback
    playbackPosition: number; // seconds
    isPlaying: boolean;
    // Track Browser panel
    isBrowserOpen: boolean;
    // Lock
    isLocked: boolean;
}

// ─── Helper to create a TimelineTrack from a musicStore Track ──────────
export function createTimelineTrack(track: Track, variant: 'vocal' | 'instrumental', genres?: { id: string; color: string }[]): TimelineTrack {
    const isVocal = variant === 'vocal';
    const genreDef = (genres || DEFAULT_GENRES).find((g) => g.id === track.genre);
    return {
        id: `${track.id}-${variant}-${crypto.randomUUID()}`,
        trackId: track.id,
        variant,
        duration: track.duration,
        volume: 1,
        genre: track.genre,
        genreColor: genreDef?.color || '#9CA3AF',
        title: track.title,
        artist: track.artist,
        coverUrl: track.coverUrl,
        audioUrl: (isVocal ? track.vocalUrl : track.instrumentalUrl) || '',
        audioStoragePath: isVocal ? track.vocalStoragePath : track.instrumentalStoragePath,
        peaks: isVocal ? track.vocalPeaks : track.instrumentalPeaks,
        trimStart: 0,
        trimEnd: 0,
    };
}

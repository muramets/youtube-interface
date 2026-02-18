import type { RenderResolution } from './editing';
import type { TimelineTrack } from './editing';
import type { Track } from './track';
import { DEFAULT_GENRES } from './track';

// ─── Serialized Track (lightweight — no peaks, no audioUrl) ────────────
export interface SerializedTimelineTrack {
    id: string;
    trackId: string;
    variant: 'vocal' | 'instrumental';
    volume: number;
    trimStart: number;
    trimEnd: number;
}

// ─── Firestore Document Shape ──────────────────────────────────────────
export interface EditingSession {
    // Image
    imageStoragePath: string | null;
    imageUrl: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    // Timeline
    tracks: SerializedTimelineTrack[];
    // Settings
    resolution: RenderResolution;
    loopCount: number;
    volume: number;
    // Lock
    isLocked?: boolean;
    // Meta
    updatedAt: unknown; // FieldValue on write, Timestamp on read
}

// ─── Serialize: TimelineTrack → lightweight Firestore-safe shape ───────
export function serializeTrack(t: TimelineTrack): SerializedTimelineTrack {
    return {
        id: t.id,
        trackId: t.trackId,
        variant: t.variant,
        volume: t.volume,
        trimStart: t.trimStart,
        trimEnd: t.trimEnd,
    };
}

// ─── Hydrate: SerializedTimelineTrack → full TimelineTrack ─────────────
// Resolves audioUrl, peaks, title, artist, coverUrl, genre, genreColor
// from the full Track in musicStore.
// Returns null if the source track no longer exists.
export function hydrateTrack(
    s: SerializedTimelineTrack,
    musicTracks: Track[],
    genres?: { id: string; color: string }[],
): TimelineTrack | null {
    const source = musicTracks.find((t) => t.id === s.trackId);
    if (!source) return null;

    const isVocal = s.variant === 'vocal';
    const genreDef = (genres || DEFAULT_GENRES).find((g) => g.id === source.genre);

    return {
        id: s.id,
        trackId: s.trackId,
        variant: s.variant,
        duration: source.duration,
        volume: s.volume,
        genre: source.genre,
        genreColor: genreDef?.color || '#9CA3AF',
        title: source.title,
        artist: source.artist,
        coverUrl: source.coverUrl,
        audioUrl: (isVocal ? source.vocalUrl : source.instrumentalUrl) || '',
        audioStoragePath: isVocal ? source.vocalStoragePath : source.instrumentalStoragePath,
        peaks: isVocal ? source.vocalPeaks : source.instrumentalPeaks,
        trimStart: s.trimStart,
        trimEnd: s.trimEnd,
    };
}

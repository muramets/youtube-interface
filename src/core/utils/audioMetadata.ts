// =============================================================================
// AUDIO METADATA: Extract ID3 tags from audio files
// =============================================================================

import { parseBlob, type IAudioMetadata } from 'music-metadata-browser';

/**
 * Extracted metadata from an audio file.
 */
export interface AudioMetadata {
    title?: string;
    artist?: string;
    lyrics?: string;
    bpm?: number;
    genre?: string;
    coverBlob?: Blob;
    coverType?: string;
    comment?: string;
}

/**
 * Parse metadata (ID3 tags) from an audio file.
 * Extracts title, artist, cover art, lyrics, BPM, genre, and comments.
 * 
 * Works with MP3 (ID3v2), FLAC (Vorbis), WAV, OGG, etc.
 */
export async function extractAudioMetadata(file: File): Promise<AudioMetadata> {
    try {
        const metadata: IAudioMetadata = await parseBlob(file);
        const common = metadata.common;

        const result: AudioMetadata = {};

        // Title
        if (common.title) {
            result.title = common.title;
        }

        // Artist
        if (common.artist) {
            result.artist = common.artist;
        }

        // Lyrics (USLT tag in ID3v2)
        if (common.lyrics && common.lyrics.length > 0) {
            // In browser, lyrics entries may be strings directly
            const lyricsText = common.lyrics
                .map((l) => typeof l === 'string' ? l : (l as { text?: string }).text || '')
                .filter(Boolean)
                .join('\n\n');
            if (lyricsText) {
                result.lyrics = lyricsText;
            }
        }

        // BPM
        if (common.bpm) {
            result.bpm = Math.round(common.bpm);
        }

        // Genre
        if (common.genre && common.genre.length > 0) {
            result.genre = common.genre[0];
        }

        // Cover art (APIC frame in ID3v2)
        if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            result.coverBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
            result.coverType = pic.format;
        }

        // Comment (Suno stores creation info here)
        if (common.comment && common.comment.length > 0) {
            const commentText = common.comment
                .map((c) => typeof c === 'string' ? c : c)
                .join('\n');
            result.comment = commentText;
        }

        return result;
    } catch (error) {
        console.warn('[AudioMetadata] Failed to parse metadata:', error);
        return {};
    }
}

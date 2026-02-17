/**
 * mp4MetadataPatch.ts — Post-processing patches for MP4 binary output
 *
 * Rewrites Mediabunny-branded metadata atoms to match standard NLE output,
 * preventing fingerprint-based detection by video platforms.
 *
 * All patches are in-place (same byte length) to avoid shifting offsets
 * in the moov box (stco/co64), which would corrupt the file.
 *
 * Changes applied:
 * 1. Handler names: MediabunnyVideoHandler → VideoHandler
 *                   MediabunnySoundHandler → SoundHandler
 */

// ─── String helpers ────────────────────────────────────────────────────

/** Encode an ASCII string to a Uint8Array */
function asciiEncode(str: string): Uint8Array {
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
    return buf;
}

/**
 * Search for `needle` in `haystack` and return the byte offset, or -1.
 * Simple brute-force — the buffers are small (<500 MB) and we search once.
 */
function findBytes(haystack: Uint8Array, needle: Uint8Array, startOffset = 0): number {
    const len = haystack.length - needle.length;
    outer: for (let i = startOffset; i <= len; i++) {
        for (let j = 0; j < needle.length; j++) {
            if (haystack[i + j] !== needle[j]) continue outer;
        }
        return i;
    }
    return -1;
}

/**
 * Replace `needle` with `replacement` in-place.
 * If replacement is shorter, the remaining bytes are zero-padded.
 */
function replaceInPlace(data: Uint8Array, needle: Uint8Array, replacement: Uint8Array): boolean {
    const offset = findBytes(data, needle);
    if (offset === -1) return false;

    // Write replacement bytes
    data.set(replacement, offset);

    // Zero-pad any leftover space (null bytes are harmless in handler name fields)
    for (let i = replacement.length; i < needle.length; i++) {
        data[offset + i] = 0;
    }
    return true;
}

// ─── Main patch function ───────────────────────────────────────────────

const HANDLER_REPLACEMENTS: [Uint8Array, Uint8Array][] = [
    [asciiEncode('MediabunnyVideoHandler'), asciiEncode('VideoHandler')],
    [asciiEncode('MediabunnySoundHandler'), asciiEncode('SoundHandler')],
];

/**
 * Apply all metadata patches to a finished MP4 buffer.
 * Call this on the raw ArrayBuffer before creating a Blob for download.
 *
 * Only performs safe in-place replacements (same byte span, zero-padded)
 * to avoid corrupting moov chunk offsets.
 */
export function patchMp4Metadata(buffer: ArrayBuffer): ArrayBuffer {
    const data = new Uint8Array(buffer);
    for (const [needle, replacement] of HANDLER_REPLACEMENTS) {
        replaceInPlace(data, needle, replacement);
    }
    return buffer;
}

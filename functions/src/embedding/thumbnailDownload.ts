// =============================================================================
// Thumbnail Download — shared helper for downloading YouTube video thumbnails
//
// Resolution fallback chain: maxresdefault → sddefault → mqdefault.
// Validates content-type to reject HTML redirects.
// Used by both thumbnailDescription and visualEmbedding generators.
// =============================================================================

import axios from "axios";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Thumbnail resolutions to try, highest quality first.
 *  IMPORTANT: Only 16:9 formats are used. `sddefault` (640×480, 4:3) is
 *  intentionally excluded — YouTube adds black letterbox bars for 16:9 videos,
 *  which pollutes visual embeddings and degrades similarity search accuracy.  */
const THUMBNAIL_RESOLUTIONS = [
    "maxresdefault",  // 1280×720, not always available
    "mqdefault",      // 320×180, guaranteed
] as const;

const DOWNLOAD_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Download with fallback chain
// ---------------------------------------------------------------------------

/**
 * Download YouTube video thumbnail with resolution fallback chain.
 * @returns Buffer with image data and MIME type, or null if all resolutions fail
 */
export async function downloadThumbnail(
    videoId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
    for (const resolution of THUMBNAIL_RESOLUTIONS) {
        const url = `https://i.ytimg.com/vi/${videoId}/${resolution}.jpg`;
        try {
            const response = await axios.get(url, {
                responseType: "arraybuffer",
                timeout: DOWNLOAD_TIMEOUT_MS,
            });

            // Validate content type — reject HTML redirects
            const contentType = response.headers["content-type"] as string | undefined;
            if (!contentType || !contentType.startsWith("image/")) {
                continue;
            }

            return {
                buffer: Buffer.from(response.data),
                mimeType: contentType.split(";")[0],
            };
        } catch {
            // 404 or network error — try next resolution
            continue;
        }
    }
    return null;
}

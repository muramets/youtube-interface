/**
 * Resolves the thumbnail URL for a video using a 3-rule cascade:
 *   1. Firestore thumbnail exists → passthrough (Firebase Storage URL or YouTube CDN from sync)
 *   2. custom-* video without thumbnail → undefined (no YouTube CDN available)
 *   3. Regular YouTube video → CDN fallback (mqdefault.jpg, 320×180)
 */
export function resolveThumbnailUrl(
    videoId: string,
    firestoreThumbnail?: string | null,
): string | undefined {
    if (firestoreThumbnail) return firestoreThumbnail;
    if (videoId.startsWith('custom-')) return undefined;
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

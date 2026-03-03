// =============================================================================
// Thumbnails — Gemini Files API caching for video thumbnails
// =============================================================================

type Part = import("@google/genai").Part;

import { uploadToGemini } from "./fileUpload.js";

// --- Types ---

/**
 * Cached entry for a thumbnail uploaded to Gemini Files API.
 * Files live on Google's servers for 48h — we use 47h TTL for safety.
 */
export interface ThumbnailCacheEntry {
    fileUri: string;
    mimeType: string;
    uploadedAt: number; // epoch ms
}

export type ThumbnailCache = Record<string, ThumbnailCacheEntry>;

const THUMBNAIL_TTL_MS = 47 * 60 * 60 * 1000; // 47h (1h safety margin before 48h expiry)

// --- Fetch + cache thumbnails ---

/**
 * Upload thumbnail URLs to the Gemini Files API and return fileData Parts.
 * Reuses cached fileUris when available (< 47h old), only uploading new/expired ones.
 * Returns both the Parts array AND the updated cache for persistence.
 */
export async function fetchThumbnailParts(
    apiKey: string,
    urls: string[],
    cache?: ThumbnailCache,
): Promise<{ parts: Part[]; updatedCache: ThumbnailCache }> {
    const now = Date.now();
    const updatedCache: ThumbnailCache = { ...(cache ?? {}) };

    // Classify each URL as cached (reusable) or needs upload
    const cacheHits: string[] = [];
    const cacheExpired: string[] = [];
    const cacheMisses: string[] = [];

    for (const url of urls) {
        const entry = cache?.[url];
        if (entry && (now - entry.uploadedAt) < THUMBNAIL_TTL_MS) {
            cacheHits.push(url);
        } else if (entry) {
            cacheExpired.push(url);
        } else {
            cacheMisses.push(url);
        }
    }

    console.info(`[thumbnails] ${urls.length} URLs — ${cacheHits.length} cached, ${cacheExpired.length} expired, ${cacheMisses.length} new`);

    const needsUpload = [...cacheExpired, ...cacheMisses];

    // Upload new/expired thumbnails in parallel
    if (needsUpload.length > 0) {
        console.info(`[thumbnails] Uploading ${needsUpload.length} thumbnail(s) via Files API`);
        const results = await Promise.allSettled(
            needsUpload.map(async (url) => {
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`[thumbnails] ❌ Fetch failed: ${url} → HTTP ${response.status}`);
                    throw new Error(`HTTP ${response.status}`);
                }
                const buffer = await response.arrayBuffer();
                const mimeType = response.headers.get('content-type') || 'image/jpeg';
                const sizeKb = Math.round(buffer.byteLength / 1024);
                console.info(`[thumbnails] Uploading ${sizeKb}KB (${mimeType}) to Files API…`);
                const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
                const { uri } = await uploadToGemini(apiKey, blob, mimeType, 'thumbnail');
                console.info(`[thumbnails] ✅ Uploaded: ${url.slice(0, 60)}… → ${uri}`);

                // Update cache
                updatedCache[url] = { fileUri: uri, mimeType, uploadedAt: now };
                return { url, uri, mimeType };
            })
        );
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
            console.warn(`[thumbnails] ⚠️ ${failed.length}/${needsUpload.length} uploads failed:`,
                failed.map(r => (r as PromiseRejectedResult).reason?.message));
            // Evict failed URLs from cache so middleware can detect the failure
            // (otherwise expired-but-not-re-uploaded entries linger from the spread copy)
            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'rejected') {
                    delete updatedCache[needsUpload[i]];
                }
            }
        }
    }

    // Build Parts from cache (all URLs should now be cached)
    const parts: Part[] = [];
    for (const url of urls) {
        const entry = updatedCache[url];
        if (entry) {
            parts.push({ fileData: { fileUri: entry.fileUri, mimeType: entry.mimeType } } as Part);
        } else {
            console.warn(`[thumbnails] ⚠️ No cached entry for ${url.slice(0, 60)}… — skipping`);
        }
    }

    // Prune expired entries not in current URLs (housekeeping)
    for (const key of Object.keys(updatedCache)) {
        if ((now - updatedCache[key].uploadedAt) >= THUMBNAIL_TTL_MS && !urls.includes(key)) {
            delete updatedCache[key];
        }
    }

    console.info(`[thumbnails] Result: ${parts.length} fileData part(s), cache size: ${Object.keys(updatedCache).length}`);
    return { parts, updatedCache };
}

// --- Build user message parts ---

export function buildUserParts(
    text: string,
    attachments?: Array<{ geminiFileUri: string; mimeType: string }>,
    thumbnailParts?: Part[],
): Part[] {
    const parts: Part[] = [];
    if (attachments && attachments.length > 0) {
        for (const att of attachments) {
            parts.push({
                fileData: { fileUri: att.geminiFileUri, mimeType: att.mimeType },
            });
        }
    }
    if (thumbnailParts && thumbnailParts.length > 0) {
        parts.push(...thumbnailParts);
    }
    if (text.trim()) {
        parts.push({ text });
    }
    return parts;
}

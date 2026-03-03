// =============================================================================
// thumbnailMiddleware — intercepts tool results with visualContextUrls,
// enforces the 15-thumbnail approval gate, downloads images via Files API.
//
// Contract:
//   - Input:  any tool response (only acts if visualContextUrls is present)
//   - Output: { imageParts, updatedCache, cleanedResponse, blockedCount? }
//   - cleanedResponse NEVER contains visualContextUrls (always stripped)
//   - blockedCount > 0 means caller must emit confirmLargePayload SSE event
// =============================================================================

import type { Part } from "@google/genai";
import type { ThumbnailCache } from "./thumbnails.js";
import { fetchThumbnailParts } from "./thumbnails.js";

export interface ThumbnailEnhanceResult {
    imageParts: Part[];
    updatedCache: ThumbnailCache;
    cleanedResponse: Record<string, unknown>;
    /** Defined when the gate blocked the request. Caller must emit confirmLargePayload SSE. */
    blockedCount?: number;
}

const LARGE_PAYLOAD_THRESHOLD = 15;

/**
 * Post-process a tool response that may contain visualContextUrls.
 *
 * If the response has no visualContextUrls — returns it unchanged (no-op).
 * If it has URLs below the threshold — downloads them via Files API.
 * If it has URLs at or above the threshold and the user has not approved —
 *   blocks the download, adds a _systemNote for Gemini, and returns blockedCount.
 */
export async function enhanceWithThumbnails(
    response: Record<string, unknown> & { visualContextUrls?: string[] },
    largePayloadApproved: boolean,
    apiKey: string,
    cache: ThumbnailCache,
    reportProgress?: (msg: string) => void,
): Promise<ThumbnailEnhanceResult> {
    const urls = response.visualContextUrls;

    if (!urls || urls.length === 0) {
        return { imageParts: [], updatedCache: cache, cleanedResponse: response };
    }

    // Always strip the internal field before returning to Gemini
    const cleanedResponse: Record<string, unknown> = { ...response };
    delete cleanedResponse.visualContextUrls;

    if (urls.length >= LARGE_PAYLOAD_THRESHOLD && !largePayloadApproved) {
        cleanedResponse._systemNote =
            `LARGE_PAYLOAD_BLOCKED: ${urls.length} thumbnails found. ` +
            `Inform the user of the exact count and that a confirmation UI has been shown. ` +
            `Do not attempt to call viewThumbnails again until the user confirms.`;
        return { imageParts: [], updatedCache: cache, cleanedResponse, blockedCount: urls.length };
    }

    reportProgress?.(`Uploading ${urls.length} thumbnail${urls.length === 1 ? '' : 's'}...`);

    const result = await fetchThumbnailParts(apiKey, urls, cache);

    // Report partial failures to Gemini so it can mention them in its response
    const failedCount = urls.filter(url => !result.updatedCache[url]).length;
    if (failedCount > 0) {
        cleanedResponse._failedThumbnails = failedCount;
    }

    return {
        imageParts: result.parts,
        updatedCache: result.updatedCache,
        cleanedResponse,
    };
}

// =============================================================================
// thumbnailMiddleware — intercepts tool results with visualContextUrls,
// enforces the 15-thumbnail approval gate, extracts image URLs.
//
// Provider-agnostic: returns raw URLs instead of Gemini-specific Parts.
// Each provider converts URLs to its native format (e.g. Gemini Files API).
//
// Contract:
//   - Input:  any tool response (only acts if visualContextUrls is present)
//   - Output: { imageUrls, cleanedResponse, blockedCount? }
//   - cleanedResponse NEVER contains visualContextUrls (always stripped)
//   - blockedCount > 0 means caller must emit confirmLargePayload SSE event
// =============================================================================

export interface ThumbnailEnhanceResult {
    imageUrls: string[];
    cleanedResponse: Record<string, unknown>;
    /** Defined when the gate blocked the request. Caller must emit confirmLargePayload SSE. */
    blockedCount?: number;
}

const LARGE_PAYLOAD_THRESHOLD = 15;

/**
 * Post-process a tool response that may contain visualContextUrls.
 *
 * If the response has no visualContextUrls — returns it unchanged (no-op).
 * If it has URLs below the threshold — extracts them for the provider to process.
 * If it has URLs at or above the threshold and the user has not approved —
 *   blocks the request, adds a _systemNote for the model, and returns blockedCount.
 */
export function enhanceWithThumbnails(
    response: Record<string, unknown> & { visualContextUrls?: string[] },
    largePayloadApproved: boolean,
): ThumbnailEnhanceResult {
    const urls = response.visualContextUrls;

    if (!urls || urls.length === 0) {
        return { imageUrls: [], cleanedResponse: response };
    }

    // Always strip the internal field before returning to the model
    const cleanedResponse: Record<string, unknown> = { ...response };
    delete cleanedResponse.visualContextUrls;

    if (urls.length >= LARGE_PAYLOAD_THRESHOLD && !largePayloadApproved) {
        cleanedResponse._systemNote =
            `LARGE_PAYLOAD_BLOCKED: ${urls.length} thumbnails found. ` +
            `Inform the user of the exact count and that a confirmation UI has been shown. ` +
            `Do not attempt to call viewThumbnails again until the user confirms.`;
        return { imageUrls: [], cleanedResponse, blockedCount: urls.length };
    }

    return {
        imageUrls: urls,
        cleanedResponse,
    };
}

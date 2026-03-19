// =============================================================================
// Gemini Provider Context — Typed helper for Gemini-specific options
//
// Gemini needs provider-specific data (thumbnail cache, large payload gate,
// attachment callbacks) that other providers don't. This module provides a
// typed interface and a helper to safely pack/unpack it via providerContext.
//
// Usage:
//   // At call site — pack:
//   const opts: ProviderStreamOpts = {
//     ...baseOpts,
//     providerContext: geminiContext({ thumbnailCache, largePayloadApproved }),
//   };
//
//   // Inside Gemini provider — unpack:
//   const ctx = opts.providerContext as GeminiProviderContext;
// =============================================================================

import type { ThumbnailCache } from "./thumbnails.js";
import type { CacheState } from "./cacheManager.js";

/** Gemini-specific data passed via ProviderStreamOpts.providerContext. */
export interface GeminiProviderContext {
    /** Cached Gemini Files API entries for thumbnails (reused across calls). */
    thumbnailCache?: ThumbnailCache;
    /** Whether the user has approved loading a large batch of thumbnails (>= 15). */
    largePayloadApproved?: boolean;
    /**
     * Callback to persist re-uploaded Gemini file URIs back to Firestore.
     * Called when a history attachment's Gemini URI has expired and is re-uploaded.
     */
    onAttachmentUpdate?: (
        messageId: string,
        attachmentIndex: number,
        geminiFileUri: string,
        geminiFileExpiry: number,
    ) => Promise<void>;
    /**
     * Callback when thumbnail middleware blocks a large batch pending user confirmation.
     * The caller emits a confirmLargePayload SSE event.
     */
    onLargePayloadBlocked?: (count: number) => void;
    /**
     * Current-message file attachments already uploaded to Gemini Files API.
     * Passed separately from ProviderStreamOpts.attachments because the data
     * is Gemini-specific (geminiFileUri). Full attachment refactoring (upload
     * on server, provider-agnostic) is planned for a later phase.
     */
    currentMessageGeminiRefs?: Array<{ geminiFileUri: string; mimeType: string }>;
    /** Gemini CachedContent state from conversation doc (for cache reuse). */
    cacheState?: CacheState;
    /** Callback to persist updated cache state to Firestore conversation doc. */
    onCacheUpdate?: (cacheState: CacheState | null) => Promise<void>;
}

/**
 * Pack Gemini-specific context into a generic Record for providerContext.
 *
 * Type-safe at the call site:
 * ```
 * providerContext: geminiContext({ thumbnailCache })
 * ```
 */
export function geminiContext(ctx: GeminiProviderContext): Record<string, unknown> {
    return ctx as Record<string, unknown>;
}

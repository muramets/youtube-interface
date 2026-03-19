// =============================================================================
// Gemini Cache Manager — CachedContent lifecycle (resolve, create, invalidate)
//
// Manages Gemini CachedContent resources for conversation-level caching.
// Cache stores system prompt + tools + history as a prefix. Subsequent messages
// reuse the cached prefix, paying only 10% of input token cost.
//
// All functions return null on failure — caller falls back to normal request.
// Cache operations are fire-and-forget: never block the response path.
// =============================================================================

import { logger } from "firebase-functions/v2";

type Content = import("@google/genai").Content;
type Tool = import("@google/genai").Tool;

// --- Constants ---

/** Cache time-to-live: 10 minutes (active chat session). */
export const CACHE_TTL = "600s";

/** Minimum estimated tokens to justify cache creation. */
const MIN_CACHED_TOKENS_ESTIMATE = 4096;

/** Buffer before expiry to avoid using a cache that expires mid-request. */
const EXPIRY_BUFFER_MS = 60_000;

// --- Types ---

/** Persisted cache state (stored in Firestore conversation doc). */
export interface CacheState {
    /** Full CachedContent resource name: "cachedContents/{id}". */
    cacheId: string;
    /** Expiry timestamp (Unix ms). */
    expiry: number;
    /** Model ID that created this cache. */
    model: string;
    /** Hash of system prompt — invalidate on persona/instruction change. */
    promptHash: string;
    /** Number of history messages when cache was created — detect cross-provider gaps. */
    historyLen: number;
}

/** Content to be cached (system prompt + tools + conversation history). */
export interface CacheableContent {
    systemPrompt?: string;
    tools: Tool[];
    history: Content[];
    displayName?: string;
}

// --- Hash ---

/**
 * Simple fast hash for cache invalidation (NOT cryptographic).
 * Deterministic: same input → same output.
 */
export function hashPrompt(systemPrompt: string): string {
    return `${systemPrompt.length}:${systemPrompt.slice(0, 64)}:${systemPrompt.slice(-64)}`;
}

// --- Resolve ---

/**
 * Check if an existing cache is still valid for the current request.
 *
 * Optimistic: does NOT call ai.caches.get() (saves 50-200ms per message).
 * If the cache was evicted early, generateContentStream will fail →
 * caller catches → retries without cache.
 *
 * Returns cacheId on hit, null on miss/invalidation.
 */
export async function resolveCache(
    apiKey: string,
    cacheState: CacheState,
    currentModel: string,
    currentSystemPrompt?: string,
    currentHistoryLen?: number,
): Promise<string | null> {
    // Model changed → cache is invalid (cache is model-specific).
    // Don't attempt delete — Gemini API returns 403 when deleting a cache
    // created for a different model. Cache expires naturally (10 min TTL).
    if (cacheState.model !== currentModel) {
        logger.warn("geminiCache:modelMismatch", {
            cached: cacheState.model,
            current: currentModel,
        });
        return null;
    }

    // System prompt changed → cache is invalid (persona, instructions).
    // Don't attempt delete — Gemini API returns 403. Cache expires naturally (10 min TTL).
    if (currentSystemPrompt && cacheState.promptHash !== hashPrompt(currentSystemPrompt)) {
        logger.warn("geminiCache:promptChanged", { cacheId: cacheState.cacheId });
        return null;
    }

    // History grew unexpectedly (cross-provider: Gemini→Claude→Gemini added messages not in cache).
    // Cache stores historyLen at creation. If current history is longer than expected
    // (cached historyLen + 2 for the last user+model exchange), cache is stale.
    // Expected: historyLen grows by exactly 2 per Gemini turn (user msg + model response).
    // Don't attempt delete — Gemini API returns 403. Cache expires naturally (10 min TTL).
    if (currentHistoryLen != null && cacheState.historyLen > 0) {
        const expectedLen = cacheState.historyLen + 2;
        if (currentHistoryLen > expectedLen) {
            logger.warn("geminiCache:historyGrew", {
                cachedLen: cacheState.historyLen,
                currentLen: currentHistoryLen,
                expectedLen,
            });
            return null;
        }
    }

    // Cache expired or about to expire (60s buffer avoids mid-request expiry)
    if (cacheState.expiry < Date.now() + EXPIRY_BUFFER_MS) {
        logger.info("geminiCache:expired", { cacheId: cacheState.cacheId });
        return null;
    }

    return cacheState.cacheId;
}

// --- Create ---

/**
 * Create a new CachedContent resource (fire-and-forget, after response).
 *
 * If existingCacheId is provided, deletes the old cache asynchronously.
 * Returns CacheState on success, null on failure or below threshold.
 */
export async function createCache(
    apiKey: string,
    model: string,
    content: CacheableContent,
    existingCacheId?: string,
    historyMsgCount?: number,
): Promise<CacheState | null> {
    try {
        // Delete old cache (fire-and-forget — natural TTL expiry is the safety net)
        if (existingCacheId) {
            invalidateCache(apiKey, existingCacheId);
        }

        // Estimate token count: ~4 chars per token
        const systemLen = content.systemPrompt?.length ?? 0;
        const toolsLen = JSON.stringify(content.tools).length;
        const historyLen = JSON.stringify(content.history).length;
        const estimatedTokens = (systemLen + toolsLen + historyLen) / 4;

        if (estimatedTokens < MIN_CACHED_TOKENS_ESTIMATE) {
            return null;
        }

        const { getClient } = await import("./client.js");
        const ai = await getClient(apiKey);

        const result = await ai.caches.create({
            model,
            config: {
                ttl: CACHE_TTL,
                systemInstruction: content.systemPrompt || undefined,
                tools: content.tools.length > 0 ? content.tools : undefined,
                contents: content.history.length > 0 ? content.history : undefined,
                displayName: content.displayName,
            },
        });

        // Parse expiry — defensive: some Google APIs may omit Z suffix
        const raw = result.expireTime!;
        const expiryMs = new Date(raw.endsWith('Z') ? raw : raw + 'Z').getTime();

        const newState: CacheState = {
            cacheId: result.name!,
            expiry: expiryMs,
            model,
            promptHash: hashPrompt(content.systemPrompt ?? ''),
            historyLen: historyMsgCount ?? 0,
        };

        return newState;
    } catch (error) {
        logger.warn("geminiCache:createFailed", { model, error });
        return null;
    }
}

// --- Invalidate ---

/**
 * Delete a CachedContent resource (fire-and-forget).
 * On error, cache expires naturally (10 min TTL) — non-fatal.
 */
export function invalidateCache(apiKey: string, cacheId: string): void {
    import("./client.js")
        .then(({ getClient }) => getClient(apiKey))
        .then(ai => ai.caches.delete({ name: cacheId }))
        .catch(error => {
            logger.warn("geminiCache:deleteFailed", { cacheId, error });
        });
}

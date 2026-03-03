// =============================================================================
// Session — module-level mutable refs for streaming sessions
//
// These live outside Zustand because AbortController and nonces are non-
// serializable / non-reactive. All slices that need them import from here.
// =============================================================================

import type { ChatState } from './types';

// --- Session-only thinking cache (ephemeral, clears on page reload) ---
// Keyed by messageId → { text, elapsedMs }. Populated after AI response is persisted.
interface SessionThinkingEntry { text: string; elapsedMs: number; }

const sessionThinkingCache = new Map<string, SessionThinkingEntry>();

/** Get cached thinking data for a specific message (session-only, not persisted). */
export function getSessionThinking(messageId: string): SessionThinkingEntry | null {
    return sessionThinkingCache.get(messageId) ?? null;
}

export function cacheSessionThinking(messageId: string, entry: SessionThinkingEntry): void {
    sessionThinkingCache.set(messageId, entry);
}

/**
 * Mutable session refs — use a single object so mutations are always visible
 * to all importers via the same object reference.
 */
export const session = {
    /** AbortController lives outside Zustand (non-serializable) */
    activeAbortController: null as AbortController | null,

    /**
     * Generation nonce — scopes streaming UI updates to a specific sendMessage call.
     * When the user switches conversations mid-stream, we increment this so that
     * the old stream's callbacks become no-ops (UI-only; the stream itself finishes).
     */
    streamingNonce: 0,

    /** Timestamp when the current streaming response started (for thinking elapsed calc). */
    streamStartMs: 0,
};

/**
 * Start a new streaming session — creates AbortController, increments nonce,
 * resets all transient streaming state. Single source of truth for both
 * sendMessage and confirmLargePayload.
 */
export function startStreamingSession(
    set: (partial: Partial<ChatState>) => void,
): { nonce: number; controller: AbortController } {
    const controller = new AbortController();
    session.activeAbortController = controller;
    const nonce = ++session.streamingNonce;
    set({ isStreaming: true, streamingText: '', retryAttempt: 0, activeToolCalls: [], thinkingText: '', error: null, lastFailedRequest: null });
    session.streamStartMs = Date.now();
    return { nonce, controller };
}

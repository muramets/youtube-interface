// =============================================================================
// AI Proxy Service — Client-side caller for AI Cloud Function endpoints
// =============================================================================

import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../../../config/firebase';
import type { AiChatResult } from '../../types/chat/chat';
import { parseSSEEvent } from '../../types/sseEvents';

// --- Types ---

interface StreamChatOpts {
    channelId: string;
    conversationId: string;
    model: string;
    systemPrompt?: string;
    systemLayers?: { settings: number; persistentContext: number; crossMemory: number };
    text: string;
    attachments?: Array<{ type: string; url: string; name: string; mimeType: string; fileRef?: string }>;
    thumbnailUrls?: string[];
    contextMeta?: { videoCards?: number; trafficSources?: number; canvasNodes?: number; totalItems?: number };
    onStream: (fullText: string) => void;
    /** Called when the AI model initiates a tool call (before execution). */
    onToolCall?: (name: string, args: Record<string, unknown>, toolCallIndex: number) => void;
    /** Called after a tool finishes executing with its result. */
    onToolResult?: (name: string, result: Record<string, unknown>, toolCallIndex: number) => void;
    /** Called when a tool emits a progress update during execution. */
    onToolProgress?: (toolName: string, message: string, toolCallIndex: number) => void;
    /** Called when the AI model emits thinking tokens. */
    onThought?: (text: string) => void;
    /** Thinking depth option id (matches model's thinkingOptions). */
    thinkingOptionId?: string;
    /** User confirmed loading a large batch of thumbnails (≥15) via the confirmation UI. */
    largePayloadApproved?: boolean;
    /** Called when the server blocks a large thumbnail batch and needs user confirmation. */
    onConfirmLargePayload?: (count: number) => void;
    /** Called when the server retries a failed AI request. attempt is 1-based. */
    onRetry?: (attempt: number) => void;
    signal?: AbortSignal;
}

interface GeminiUploadResult {
    uri: string;
    expiryMs: number;
}

// --- CF URL ---

/**
 * Get the URL for the aiChat CF.
 */
function getAiChatUrl(): string {
    const projectId = auth.app.options.projectId;
    // Firebase Functions v2 uses Cloud Run URLs
    // The actual URL will be known after first deploy — use the standard pattern
    return `https://us-central1-${projectId}.cloudfunctions.net/aiChat`;
}

// --- Stream Chat (SSE) ---

export async function streamChat(opts: StreamChatOpts): Promise<AiChatResult> {
    const {
        channelId,
        conversationId,
        model,
        systemPrompt,
        text,
        attachments,
        thumbnailUrls,
        contextMeta,
        onStream,
        onToolCall,
        onToolResult,
        onToolProgress,
        onThought,
        thinkingOptionId,
        largePayloadApproved,
        onConfirmLargePayload,
        onRetry,
        signal,
    } = opts;

    // Get Firebase Auth token
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const idToken = await user.getIdToken();

    // Build request body — history is now read server-side
    const body = {
        channelId,
        conversationId,
        text,
        model,
        systemPrompt: systemPrompt || undefined,
        systemLayers,
        attachments,
        thumbnailUrls,
        contextMeta,
        thinkingOptionId,
        largePayloadApproved,
    };

    // --- Fetch with automatic retry for transient failures ---
    const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);
    const MAX_RETRIES = 2;
    const BASE_DELAY_MS = 1000;

    let response!: Response;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        response = await fetch(getAiChatUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify(body),
            signal,
        });

        if (response.ok) break;

        // Don't retry if user cancelled or if error is not transient
        if (signal?.aborted || !RETRYABLE_STATUSES.has(response.status)) {
            break;
        }

        // Don't retry on last attempt
        if (attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 1s → 2s
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `AI request failed (${response.status})`);
    }

    // Custom error class for server-sent errors (distinguishes from JSON parse errors)
    class SSEDataError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'SSEDataError';
        }
    }

    // Parse SSE stream with inactivity timeout
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let result: AiChatResult = { text: '' };
    let receivedAnyData = false;

    // --- Inactivity timeout: abort reader if no data arrives.
    // Set to 120s (not 90s) to give the server guaranteed time to send the retry SSE event
    // before the client gives up. Server timeout is 90s — the extra 30s covers network lag
    // between server iterationAbort → SSE write → client receive. ---
    const STREAM_TIMEOUT_MS = 120_000;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    const inactivityController = new AbortController();

    const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            console.warn('[chat] Stream inactivity timeout — aborting reader');
            inactivityController.abort();
            reader.cancel().catch(() => { /* ignore */ });
        }, STREAM_TIMEOUT_MS);
    };

    const clearInactivityTimer = () => {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
    };

    // Start the timer immediately — covers the gap where server processes before first SSE chunk
    resetInactivityTimer();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Data arrived — reset the inactivity timer
            receivedAnyData = true;
            resetInactivityTimer();

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE events (delimited by \n\n)
            const events = buffer.split('\n\n');
            buffer = events.pop() || ''; // Keep incomplete last chunk in buffer

            for (const event of events) {
                // SSE spec: concatenate all data: lines with \n
                const dataLines = event
                    .split('\n')
                    .filter((line) => line.startsWith('data: '))
                    .map((line) => line.slice(6));

                if (dataLines.length === 0) continue;

                const payload = dataLines.join('\n');
                const sseEvent = parseSSEEvent(payload);
                if (!sseEvent) continue;

                switch (sseEvent.type) {
                    case 'chunk':
                        onStream(sseEvent.text);
                        break;
                    case 'toolCall':
                        onToolCall?.(sseEvent.name, sseEvent.args, sseEvent.toolCallIndex);
                        break;
                    case 'toolResult':
                        onToolResult?.(sseEvent.name, sseEvent.result, sseEvent.toolCallIndex);
                        break;
                    case 'toolProgress':
                        onToolProgress?.(sseEvent.toolName, sseEvent.message, sseEvent.toolCallIndex);
                        break;
                    case 'thought':
                        onThought?.(sseEvent.text);
                        break;
                    case 'done':
                        result = {
                            text: sseEvent.text,
                            tokenUsage: sseEvent.tokenUsage,
                            normalizedUsage: sseEvent.normalizedUsage,
                            toolCalls: sseEvent.toolCalls,
                            summary: sseEvent.summary,
                            usedSummary: sseEvent.usedSummary,
                            contextBreakdown: sseEvent.contextBreakdown,
                            status: sseEvent.status,
                            partial: sseEvent.partial,
                        };
                        break;
                    case 'confirmLargePayload':
                        onConfirmLargePayload?.(sseEvent.count);
                        break;
                    case 'retry':
                        onRetry?.(sseEvent.attempt);
                        break;
                    case 'error':
                        throw new SSEDataError(sseEvent.error);
                }
            }
        }
    } catch (err) {
        // If the reader was cancelled by our inactivity timer, throw a clear timeout error
        if (inactivityController.signal.aborted) {
            throw new Error('AI response timed out — no data received for 120 seconds. Please try again.');
        }
        throw err;
    } finally {
        clearInactivityTimer();
    }

    // Guard: stream ended without any meaningful response
    if (!result.text && !receivedAnyData) {
        throw new Error('AI response was empty — the server closed the connection without sending data. Please try again.');
    }

    return result;
}

// --- Upload file (via CF) ---

export async function uploadFile(
    storagePath: string,
    mimeType: string,
    displayName: string
): Promise<GeminiUploadResult> {
    const callable = httpsCallable<
        { storagePath: string; mimeType: string; displayName: string },
        GeminiUploadResult
    >(functions, 'geminiUpload');

    const result = await callable({ storagePath, mimeType, displayName });
    return result.data;
}

// --- Generate Title (via CF) ---

export async function generateChatTitle(
    firstMessage: string,
    model?: string,
    channelId?: string,
    conversationId?: string,
): Promise<string> {
    const callable = httpsCallable<
        { firstMessage: string; model?: string; channelId?: string; conversationId?: string },
        { title: string }
    >(functions, 'generateChatTitle');

    const result = await callable({ firstMessage, model, channelId, conversationId });
    return result.data.title;
}

// --- Conclude Conversation (Layer 4 memory) ---

export async function concludeConversation(
    channelId: string,
    conversationId: string,
    guidance?: string,
    model?: string
): Promise<{ memoryId: string; content: string }> {
    const callable = httpsCallable<
        { channelId: string; conversationId: string; guidance?: string; model?: string },
        { memoryId: string; content: string }
    >(functions, 'concludeConversation');

    const result = await callable({ channelId, conversationId, guidance, model });
    return result.data;
}

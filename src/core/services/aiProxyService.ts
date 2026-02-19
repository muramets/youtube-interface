// =============================================================================
// AI Proxy Service — Client-side caller for Gemini CF endpoints
// =============================================================================

import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../../config/firebase';

// --- Types ---

interface StreamChatOpts {
    channelId: string;
    conversationId: string;
    model: string;
    systemPrompt?: string;
    text: string;
    attachments?: Array<{ geminiFileUri: string; mimeType: string }>;
    thumbnailUrls?: string[];
    onStream: (fullText: string) => void;
    signal?: AbortSignal;
}

interface StreamChatResult {
    text: string;
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    summary?: string;
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

export async function streamChat(opts: StreamChatOpts): Promise<StreamChatResult> {
    const {
        channelId,
        conversationId,
        model,
        systemPrompt,
        text,
        attachments,
        thumbnailUrls,
        onStream,
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
        attachments,
        thumbnailUrls,
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
    let result: StreamChatResult = { text: '' };
    let receivedAnyData = false;

    // --- 60s inactivity timeout: abort reader if no data arrives ---
    const STREAM_TIMEOUT_MS = 60_000;
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

                try {
                    const data = JSON.parse(payload);

                    if (data.type === 'chunk') {
                        onStream(data.text);
                    } else if (data.type === 'done') {
                        result = { text: data.text, tokenUsage: data.tokenUsage, summary: data.summary };
                    } else if (data.type === 'error') {
                        throw new SSEDataError(data.error);
                    }
                } catch (parseErr) {
                    // Propagate server errors; skip malformed JSON events
                    if (parseErr instanceof SSEDataError) {
                        throw parseErr;
                    }
                }
            }
        }
    } catch (err) {
        // If the reader was cancelled by our inactivity timer, throw a clear timeout error
        if (inactivityController.signal.aborted) {
            throw new Error('AI response timed out — no data received for 60 seconds. Please try again.');
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

// --- Upload to Gemini (via CF) ---

export async function uploadToGemini(
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
    model?: string
): Promise<string> {
    const callable = httpsCallable<
        { firstMessage: string; model?: string },
        { title: string }
    >(functions, 'generateChatTitle');

    const result = await callable({ firstMessage, model });
    return result.data.title;
}

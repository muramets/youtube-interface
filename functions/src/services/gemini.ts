// =============================================================================
// Gemini AI Service — Server-Side Proxy
// Lazy-loads @google/genai and firebase-admin to avoid CF deployment timeout.
// =============================================================================

// --- Lazy-loaded SDK types ---
type GoogleGenAI = import("@google/genai").GoogleGenAI;
type Content = import("@google/genai").Content;
type Part = import("@google/genai").Part;

// --- Singleton client (per CF instance) ---
let cachedClient: GoogleGenAI | null = null;
let cachedKey = "";

export async function getClient(apiKey: string): Promise<GoogleGenAI> {
    if (cachedClient && cachedKey === apiKey) return cachedClient;
    const { GoogleGenAI } = await import("@google/genai");
    cachedClient = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
    return cachedClient;
}

// --- Types ---

export interface ChatAttachment {
    type: "image" | "audio" | "video" | "file";
    url: string;
    name: string;
    mimeType: string;
    geminiFileUri?: string;
    geminiFileExpiry?: number;
}

export interface HistoryMessage {
    id: string;
    role: "user" | "model";
    text: string;
    attachments?: ChatAttachment[];
    /**
     * Per-message context items attached by the user (Layer 2).
     * Each item has `type` ('video-card' | 'suggested-traffic' | 'canvas-selection')
     * plus type-specific fields (title, ownership, nodes, sourceVideo, etc.).
     * Untyped on server because CF cannot import client-side AppContextItem types.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appContext?: any[];
}

export interface StreamChatOpts {
    apiKey: string;
    model: string;
    systemPrompt?: string;
    history: HistoryMessage[];
    text: string;
    attachments?: Array<{ geminiFileUri: string; mimeType: string }>;
    thumbnailUrls?: string[];
    thumbnailCache?: ThumbnailCache;
    onChunk: (fullText: string) => void;
    signal?: AbortSignal;
    /** Callback to persist re-uploaded Gemini URIs back to Firestore */
    onAttachmentUpdate?: (
        messageId: string,
        attachmentIndex: number,
        geminiFileUri: string,
        geminiFileExpiry: number
    ) => Promise<void>;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

// --- Gemini URI TTL ---

function isGeminiUriValid(expiryMs?: number): boolean {
    if (!expiryMs) return false;
    return expiryMs > Date.now() + 5 * 60 * 1000;
}

// --- File upload ---

export async function uploadToGemini(
    apiKey: string,
    fileOrBlob: File | Blob,
    mimeType: string,
    displayName?: string
): Promise<{ uri: string; expiryMs: number }> {
    const ai = await getClient(apiKey);
    const uploaded = await ai.files.upload({
        file: fileOrBlob,
        config: { mimeType, displayName },
    });
    if (!uploaded.uri) throw new Error("Gemini File API did not return a URI");
    const expiryMs = uploaded.expirationTime
        ? new Date(uploaded.expirationTime).getTime()
        : Date.now() + 48 * 60 * 60 * 1000;
    return { uri: uploaded.uri, expiryMs };
}

/**
 * Download file from Firebase Storage URL and re-upload to Gemini.
 */
export async function reuploadFromStorage(
    apiKey: string,
    storageUrl: string,
    mimeType: string,
    name: string
): Promise<{ uri: string; expiryMs: number }> {
    const response = await fetch(storageUrl);
    const blob = await response.blob();
    return uploadToGemini(apiKey, blob, mimeType, name);
}

/**
 * Upload a file to Gemini from a Firebase Storage path (server-side, no URL needed).
 */
export async function uploadFromStoragePath(
    apiKey: string,
    storagePath: string,
    mimeType: string,
    displayName: string
): Promise<{ uri: string; expiryMs: number }> {
    const admin = await import("firebase-admin");
    const bucket = admin.default.storage().bucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    return uploadToGemini(apiKey, blob, mimeType, displayName);
}

// --- Build Gemini history ---

import { formatContextLabel } from "./memory.js";

async function buildHistory(
    messages: HistoryMessage[],
    apiKey: string,
    onAttachmentUpdate?: StreamChatOpts["onAttachmentUpdate"]
): Promise<Content[]> {
    return Promise.all(
        messages.map(async (msg) => {
            const parts: Part[] = [];

            if (msg.attachments && msg.attachments.length > 0) {
                for (let i = 0; i < msg.attachments.length; i++) {
                    const att = msg.attachments[i];
                    try {
                        let fileUri = att.geminiFileUri;
                        if (!fileUri || !isGeminiUriValid(att.geminiFileExpiry)) {
                            const result = await reuploadFromStorage(
                                apiKey,
                                att.url,
                                att.mimeType,
                                att.name
                            );
                            fileUri = result.uri;
                            onAttachmentUpdate?.(msg.id, i, result.uri, result.expiryMs);
                        }
                        parts.push({
                            fileData: { fileUri, mimeType: att.mimeType },
                        });
                    } catch {
                        // Skip unloadable attachments
                    }
                }
            }

            // Layer 2: Prepend context label for user messages with appContext
            let text = msg.text;
            if (msg.role === 'user' && msg.appContext && msg.appContext.length > 0) {
                const label = formatContextLabel(msg.appContext);
                text = `${label}\n\n${msg.text}`;
            }

            parts.push({ text });
            return { role: msg.role, parts };
        })
    );
}

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

/**
 * Upload thumbnail URLs to the Gemini Files API and return fileData Parts.
 * Reuses cached fileUris when available (< 47h old), only uploading new/expired ones.
 * Returns both the Parts array AND the updated cache for persistence.
 */
async function fetchThumbnailParts(
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

function buildUserParts(
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

// --- Custom error for timeout ---

export class GeminiTimeoutError extends Error {
    constructor(message = "AI model did not respond within 90 seconds. Please try again.") {
        super(message);
        this.name = "GeminiTimeoutError";
    }
}

// --- Streaming chat ---

/** Inactivity timeout: abort if no chunk arrives within this window. */
const STREAM_INACTIVITY_TIMEOUT_MS = 90_000;

export async function streamChat(
    opts: StreamChatOpts
): Promise<{ text: string; tokenUsage?: TokenUsage; updatedThumbnailCache?: ThumbnailCache }> {
    const {
        apiKey,
        model,
        systemPrompt,
        history,
        text,
        attachments,
        thumbnailUrls,
        thumbnailCache,
        onChunk,
        signal,
        onAttachmentUpdate,
    } = opts;

    const t0 = Date.now();
    console.log(`[streamChat] Starting — model=${model}, history=${history.length} msgs, attachments=${attachments?.length ?? 0}, thumbnails=${thumbnailUrls?.length ?? 0}`);

    const ai = await getClient(apiKey);
    const historyContents = await buildHistory(history, apiKey, onAttachmentUpdate);
    const t1 = Date.now();
    console.log(`[streamChat] buildHistory: ${t1 - t0}ms — ${historyContents.length} content entries`);

    // Upload thumbnail images to Files API with caching (graceful degradation)
    let thumbnailParts: Part[] | undefined;
    let updatedThumbnailCache: ThumbnailCache | undefined;
    if (thumbnailUrls && thumbnailUrls.length > 0) {
        const result = await fetchThumbnailParts(apiKey, thumbnailUrls, thumbnailCache);
        thumbnailParts = result.parts;
        updatedThumbnailCache = result.updatedCache;
    }
    const t2 = Date.now();
    console.log(`[streamChat] fetchThumbnails (Files API): ${t2 - t1}ms — ${thumbnailParts?.length ?? 0} parts`);

    const userParts = buildUserParts(text, attachments, thumbnailParts);
    const contents: Content[] = [
        ...historyContents,
        { role: "user", parts: userParts },
    ];

    // Diagnostic: log payload composition
    const totalParts = contents.reduce((sum, c) => sum + (c.parts?.length ?? 0), 0);
    const inlineImages = userParts.filter((p: Part) => 'inlineData' in p);
    const inlineImageSizes = inlineImages.map((p: Part) => {
        const data = (p as { inlineData: { data: string; mimeType: string } }).inlineData;
        return `${data.mimeType} ${Math.round(data.data.length * 0.75 / 1024)}KB`;
    });
    const fileDataParts = userParts.filter((p: Part) => 'fileData' in p);
    console.log(`[streamChat] Payload: ${contents.length} content entries, ${totalParts} total parts`);
    console.log(`[streamChat] User message: ${userParts.length} parts — ${inlineImages.length} inline images [${inlineImageSizes.join(', ')}], ${fileDataParts.length} fileData, ${userParts.filter((p: Part) => 'text' in p).length} text`);
    if (systemPrompt) {
        console.log(`[streamChat] System prompt: ${systemPrompt.length} chars`);
    }

    // --- Inactivity timeout: abort if Gemini doesn't respond within 60s ---
    const timeoutController = new AbortController();
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

    const resetTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            console.error(`[streamChat] ⏰ Inactivity timeout — no chunks for ${STREAM_INACTIVITY_TIMEOUT_MS / 1000}s`);
            timeoutController.abort();
        }, STREAM_INACTIVITY_TIMEOUT_MS);
    };

    // Combine caller's signal with our timeout signal
    const combinedAbort = new AbortController();
    signal?.addEventListener("abort", () => combinedAbort.abort(signal.reason));
    timeoutController.signal.addEventListener("abort", () =>
        combinedAbort.abort(new GeminiTimeoutError())
    );

    // Start the timer before the API call (covers initial response wait)
    resetTimer();

    try {
        console.log(`[streamChat] Calling generateContentStream...`);
        const response = await ai.models.generateContentStream({
            model,
            contents,
            config: {
                systemInstruction: systemPrompt || undefined,
                abortSignal: combinedAbort.signal,
            },
        });
        const t3 = Date.now();
        console.log(`[streamChat] generateContentStream returned in ${t3 - t2}ms — starting to iterate chunks`);

        let fullText = "";
        let tokenUsage: TokenUsage | undefined;
        let chunkCount = 0;

        for await (const chunk of response) {
            // Reset inactivity timer on each chunk
            resetTimer();
            chunkCount++;

            const chunkText = chunk.text ?? "";
            fullText += chunkText;
            onChunk(fullText);

            if (chunkCount <= 3 || chunkCount % 10 === 0) {
                console.log(`[streamChat] chunk #${chunkCount}: +${chunkText.length} chars (total: ${fullText.length})`);
            }

            if (combinedAbort.signal.aborted) {
                const reason = combinedAbort.signal.reason;
                if (reason instanceof GeminiTimeoutError) throw reason;
                throw new DOMException("Generation stopped", "AbortError");
            }

            if (chunk.usageMetadata) {
                tokenUsage = {
                    promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                    completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                    totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
                };
            }
        }

        const tEnd = Date.now();
        console.log(`[streamChat] ✅ Done — ${chunkCount} chunks, ${fullText.length} chars, ${tEnd - t0}ms total`);
        if (tokenUsage) console.log(`[streamChat] Tokens: prompt=${tokenUsage.promptTokens}, completion=${tokenUsage.completionTokens}, total=${tokenUsage.totalTokens}`);
        return { text: fullText, tokenUsage, updatedThumbnailCache };
    } catch (err) {
        // Map AbortError caused by our timeout to GeminiTimeoutError
        if (
            timeoutController.signal.aborted &&
            !(err instanceof GeminiTimeoutError)
        ) {
            throw new GeminiTimeoutError();
        }
        throw err;
    } finally {
        if (inactivityTimer) clearTimeout(inactivityTimer);
    }
}

// --- Title generation ---

export async function generateTitle(
    apiKey: string,
    firstMessage: string,
    model: string
): Promise<string> {
    try {
        const ai = await getClient(apiKey);
        const response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `Generate a very short title (3-5 words, no quotes) for a chat that starts with this message:\n\n"${firstMessage.slice(0, 200)}"`,
                        },
                    ],
                },
            ],
        });
        return response.text?.trim() || "New Chat";
    } catch {
        return "New Chat";
    }
}

// --- Re-export memory module for backward compatibility ---
// aiChat.ts dynamically imports { buildMemory, streamChat } from this file
export { buildMemory } from "./memory.js";
export type { MemoryResult } from "./memory.js";


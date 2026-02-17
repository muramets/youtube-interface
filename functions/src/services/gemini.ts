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

async function getClient(apiKey: string): Promise<GoogleGenAI> {
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
}

export interface StreamChatOpts {
    apiKey: string;
    model: string;
    systemPrompt?: string;
    history: HistoryMessage[];
    text: string;
    attachments?: Array<{ geminiFileUri: string; mimeType: string }>;
    thumbnailUrls?: string[];
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

            parts.push({ text: msg.text });
            return { role: msg.role, parts };
        })
    );
}

/**
 * Fetch thumbnail URLs and convert to inlineData Parts for Gemini.
 * Uses parallel fetch with graceful error handling (skips failed downloads).
 */
async function fetchThumbnailParts(urls: string[]): Promise<Part[]> {
    console.log(`[thumbnails] Fetching ${urls.length} thumbnail(s):`, urls);
    const results = await Promise.allSettled(
        urls.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`[thumbnails] FAIL ${url} → HTTP ${response.status}`);
                throw new Error(`HTTP ${response.status}`);
            }
            const buffer = await response.arrayBuffer();
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            const base64 = Buffer.from(buffer).toString('base64');
            console.log(`[thumbnails] OK ${url} → ${mimeType}, ${Math.round(buffer.byteLength / 1024)}KB`);
            return {
                inlineData: { data: base64, mimeType },
            } as Part;
        })
    );
    const parts = results
        .filter((r): r is PromiseFulfilledResult<Part> => r.status === 'fulfilled')
        .map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        console.warn(`[thumbnails] ${failed.length}/${urls.length} failed:`,
            failed.map(r => (r as PromiseRejectedResult).reason?.message));
    }
    console.log(`[thumbnails] Sending ${parts.length} image part(s) to Gemini`);
    return parts;
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

// --- Streaming chat ---

export async function streamChat(
    opts: StreamChatOpts
): Promise<{ text: string; tokenUsage?: TokenUsage }> {
    const {
        apiKey,
        model,
        systemPrompt,
        history,
        text,
        attachments,
        thumbnailUrls,
        onChunk,
        signal,
        onAttachmentUpdate,
    } = opts;

    const ai = await getClient(apiKey);
    const historyContents = await buildHistory(history, apiKey, onAttachmentUpdate);

    // Fetch thumbnail images in parallel (non-blocking, graceful degradation)
    const thumbnailParts = thumbnailUrls && thumbnailUrls.length > 0
        ? await fetchThumbnailParts(thumbnailUrls)
        : undefined;

    const userParts = buildUserParts(text, attachments, thumbnailParts);
    const contents: Content[] = [
        ...historyContents,
        { role: "user", parts: userParts },
    ];

    const response = await ai.models.generateContentStream({
        model,
        contents,
        config: {
            systemInstruction: systemPrompt || undefined,
        },
    });

    let fullText = "";
    let tokenUsage: TokenUsage | undefined;

    for await (const chunk of response) {
        const chunkText = chunk.text ?? "";
        fullText += chunkText;
        onChunk(fullText);

        if (signal?.aborted) {
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

    return { text: fullText, tokenUsage };
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

// --- Token estimation ---

import { MODEL_CONTEXT_LIMITS } from "../config/models.js";

/** Rough per-token char count: ~4 chars per token for mixed content. */
const CHARS_PER_TOKEN = 4;

/** Tokens allocated to each file/image attachment in the estimate. */
const ATTACHMENT_TOKEN_ESTIMATE = 1500;

/** History gets at most 60% of model context; rest is reserved for response + system prompt. */
const HISTORY_BUDGET_RATIO = 0.6;

/** Minimum # of recent messages to always keep verbatim in the sliding window. */
const MIN_RECENT_MESSAGES = 10;

function estimateTokens(messages: HistoryMessage[]): number {
    let total = 0;
    for (const msg of messages) {
        total += Math.ceil(msg.text.length / CHARS_PER_TOKEN);
        if (msg.attachments) {
            total += msg.attachments.length * ATTACHMENT_TOKEN_ESTIMATE;
        }
    }
    return total;
}

// --- Summary generation ---

const SUMMARY_SYSTEM_PROMPT = `You are a conversation memory system. Your task is to create a comprehensive, 
structured summary that will REPLACE the original messages in future AI context.

CRITICAL: Any detail you omit will be permanently lost — the AI will have "amnesia" about it.

You MUST preserve:
1. ALL specific decisions, choices, and conclusions (with reasoning)
2. ALL technical details: names, numbers, configurations, code snippets, file paths
3. Context and motivations behind each decision
4. Unresolved questions, pending tasks, or open threads
5. User preferences, communication style, and recurring themes
6. Chronological flow of how the conversation evolved

Format: Use structured markdown with clear sections and bullet points.
Length: Be thorough. A longer, complete summary is better than a short one with gaps.`;

export async function generateSummary(
    apiKey: string,
    messages: HistoryMessage[],
    existingSummary: string | undefined,
    model: string
): Promise<string> {
    const ai = await getClient(apiKey);

    let userPrompt: string;
    if (existingSummary) {
        // Incremental update — extend existing summary
        const newMessagesText = messages
            .map(m => `[${m.role}]: ${m.text}`)
            .join("\n\n");
        userPrompt = `Here is the existing conversation summary:\n\n${existingSummary}\n\n---\n\nHere are NEW messages that happened AFTER the summary above:\n\n${newMessagesText}\n\n---\n\nProduce an UPDATED comprehensive summary that integrates both the existing summary and the new messages. Keep all important details from the existing summary and add the new information.`;
    } else {
        // First summary — summarize from scratch
        const conversationText = messages
            .map(m => `[${m.role}]: ${m.text}`)
            .join("\n\n");
        userPrompt = `Summarize the following conversation:\n\n${conversationText}`;
    }

    const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
            systemInstruction: SUMMARY_SYSTEM_PROMPT,
        },
    });

    return response.text?.trim() || existingSummary || "";
}

// --- Build memory (decides full history vs summary + recent) ---

export interface MemoryResult {
    /** Messages to pass to Gemini as history. */
    history: HistoryMessage[];
    /** If a new summary was generated, return it for caching. */
    newSummary?: string;
    /** ID of the last message included in the summary. */
    summarizedUpTo?: string;
    /** Whether summary was used (for logging). */
    usedSummary: boolean;
}

export async function buildMemory(opts: {
    apiKey: string;
    model: string;
    allMessages: HistoryMessage[];
    existingSummary?: string;
    existingSummarizedUpTo?: string;
}): Promise<MemoryResult> {
    const { apiKey, model, allMessages, existingSummary, existingSummarizedUpTo } = opts;

    const totalTokens = estimateTokens(allMessages);
    const budget = (MODEL_CONTEXT_LIMITS[model] || 1_000_000) * HISTORY_BUDGET_RATIO;

    // If everything fits — use full history, no summarization needed
    if (totalTokens <= budget) {
        return { history: allMessages, usedSummary: false };
    }

    // Need truncation: summary + sliding window of recent messages
    // Figure out which messages are already summarized vs new
    let summarizedIdx = -1;
    if (existingSummarizedUpTo) {
        summarizedIdx = allMessages.findIndex(m => m.id === existingSummarizedUpTo);
    }

    // Determine sliding window size — keep as many recent messages as budget allows
    // Reserve ~20% of budget for summary text
    const recentBudget = budget * 0.8;

    // Walk backwards from end to fill recent window
    let recentTokens = 0;
    let windowStart = allMessages.length;
    for (let i = allMessages.length - 1; i >= 0; i--) {
        const msgTokens =
            Math.ceil(allMessages[i].text.length / CHARS_PER_TOKEN) +
            (allMessages[i].attachments?.length || 0) * ATTACHMENT_TOKEN_ESTIMATE;
        if (recentTokens + msgTokens > recentBudget && windowStart < allMessages.length - MIN_RECENT_MESSAGES + 1) {
            break;
        }
        recentTokens += msgTokens;
        windowStart = i;
    }
    windowStart = Math.min(windowStart, Math.max(0, allMessages.length - MIN_RECENT_MESSAGES));

    const recentMessages = allMessages.slice(windowStart);

    // Determine messages that need to be summarized (those before the window)
    const messagesToSummarize = allMessages.slice(0, windowStart);

    // Check if we need a new summary
    let summary = existingSummary || "";
    let newSummary: string | undefined;
    let newSummarizedUpTo: string | undefined;

    if (messagesToSummarize.length > 0) {
        const lastSummarizedMsg = messagesToSummarize[messagesToSummarize.length - 1];

        // Only regenerate if there are unsummarized messages before the window
        if (lastSummarizedMsg.id !== existingSummarizedUpTo) {
            // Find messages that are new since last summary
            const newMessages = summarizedIdx >= 0
                ? messagesToSummarize.slice(summarizedIdx + 1)
                : messagesToSummarize;

            if (newMessages.length > 0) {
                summary = await generateSummary(apiKey, newMessages, existingSummary, model);
                newSummary = summary;
                newSummarizedUpTo = lastSummarizedMsg.id;
            }
        }
    }

    // Inject summary as a synthetic "model" message at the start
    const summaryMessage: HistoryMessage = {
        id: "__summary__",
        role: "model",
        text: `[Conversation Summary — Earlier Messages]\n\n${summary}`,
    };

    return {
        history: [summaryMessage, ...recentMessages],
        newSummary,
        summarizedUpTo: newSummarizedUpTo,
        usedSummary: true,
    };
}


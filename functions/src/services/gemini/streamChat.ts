// =============================================================================
// Stream Chat — Agentic loop with tool calling and thinking support
// =============================================================================

type Content = import("@google/genai").Content;
type Part = import("@google/genai").Part;

// Lazy-loaded SDK factory functions (avoids top-level import of @google/genai)
let _createPartFromFunctionCall: ((name: string, args: Record<string, unknown>) => Part) | null = null;
let _createPartFromFunctionResponse: ((id: string, name: string, response: Record<string, unknown>) => Part) | null = null;

async function getPartFactories(): Promise<{
    createFC: (name: string, args: Record<string, unknown>) => Part;
    createFR: (id: string, name: string, response: Record<string, unknown>) => Part;
}> {
    if (!_createPartFromFunctionCall || !_createPartFromFunctionResponse) {
        const sdk = await import("@google/genai");
        _createPartFromFunctionCall = sdk.createPartFromFunctionCall;
        _createPartFromFunctionResponse = sdk.createPartFromFunctionResponse;
    }
    return {
        createFC: _createPartFromFunctionCall,
        createFR: _createPartFromFunctionResponse,
    };
}

import { getClient, isGeminiUriValid } from "./client.js";
import type { HistoryMessage, TokenUsage, ToolCallRecord } from "./client.js";
import type { ThumbnailCache } from "./thumbnails.js";
import { reuploadFromStorage } from "./fileUpload.js";
import { fetchThumbnailParts, buildUserParts } from "./thumbnails.js";
import { enhanceWithThumbnails } from "./thumbnailMiddleware.js";
import { formatContextLabel } from "../memory.js";
import { TOOL_DECLARATIONS, executeTool } from "../tools/index.js";
import type { ToolContext } from "../tools/index.js";
import { MODEL_REGISTRY } from "../../config/models.js";

// --- StreamChat options ---

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
    /** Called when Gemini initiates a tool call (before execution). */
    onToolCall?: (name: string, args: Record<string, unknown>, toolCallIndex: number) => void;
    /** Called after a tool finishes executing with its result. */
    onToolResult?: (name: string, result: Record<string, unknown>, toolCallIndex: number) => void;
    /** Called when Gemini emits thinking/reasoning tokens. */
    onThought?: (thought: string) => void;
    /** Called during tool execution to report intermediate progress steps. */
    onToolProgress?: (toolName: string, message: string, toolCallIndex: number) => void;
    /** Called when thumbnail middleware blocks a large batch pending user confirmation. */
    onLargePayloadBlocked?: (count: number) => void;
    /** Called when a transient error (inactivity timeout or 503 UNAVAILABLE) triggers automatic retry. */
    onRetry?: (attempt: number) => void;
    /** User confirmed loading a large batch of thumbnails (≥15) via the confirmation UI. */
    largePayloadApproved?: boolean;
    signal?: AbortSignal;
    /** Callback to persist re-uploaded Gemini URIs back to Firestore */
    onAttachmentUpdate?: (
        messageId: string,
        attachmentIndex: number,
        geminiFileUri: string,
        geminiFileExpiry: number
    ) => Promise<void>;
    /** Context for tool execution (userId, channelId). Required for agentic mode. */
    toolContext?: ToolContext;
    /** Thinking depth option id (must match an id in the model's thinkingOptions). */
    thinkingOptionId?: string;
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

// --- Custom error for timeout ---

export class GeminiTimeoutError extends Error {
    constructor(message = "AI model did not respond within 90 seconds. Please try again.") {
        super(message);
        this.name = "GeminiTimeoutError";
    }
}

// --- Transient error detection ---

/**
 * Returns true for transient Gemini API errors that are safe to retry:
 * - GeminiTimeoutError: stream stalled (no chunks for 90s)
 * - 503 UNAVAILABLE: API overloaded, rejects immediately
 */
function isTransientApiError(err: unknown): boolean {
    if (err instanceof GeminiTimeoutError) return true;
    if (err instanceof Error) {
        const anyErr = err as unknown as Record<string, unknown>;
        // Structural check — covers most SDK versions (.status or .code, numeric)
        if (anyErr.status === 503 || anyErr.code === 503) return true;
        // Fallback: SDK embeds JSON error payload in message string
        if (err.message.includes('503') && err.message.includes('UNAVAILABLE')) return true;
    }
    return false;
}

// --- Constants ---

/** Inactivity timeout: abort if no chunk arrives within this window. */
const STREAM_INACTIVITY_TIMEOUT_MS = 90_000;

/** Maximum agentic loop iterations to prevent infinite tool-calling loops. */
const MAX_AGENTIC_ITERATIONS = 10;

/** Maximum number of automatic retries per iteration (covers both timeout and 503). */
const MAX_STREAM_RETRIES = 2;

/** Delay before retrying a 503 UNAVAILABLE error — gives the overloaded server a moment. */
const RETRY_503_DELAY_MS = 2_000;

// --- Main streaming function ---

export async function streamChat(
    opts: StreamChatOpts
): Promise<{ text: string; tokenUsage?: TokenUsage; toolCalls?: ToolCallRecord[]; updatedThumbnailCache?: ThumbnailCache }> {
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
        onToolCall,
        onToolResult,
        onThought,
        onToolProgress,
        onLargePayloadBlocked,
        largePayloadApproved,
        onRetry,
        signal,
        onAttachmentUpdate,
        toolContext,
        thinkingOptionId,
    } = opts;

    const t0 = Date.now();
    console.log(`[streamChat] Starting — model=${model}, history=${history.length} msgs, attachments=${attachments?.length ?? 0}, thumbnails=${thumbnailUrls?.length ?? 0}`);

    const ai = await getClient(apiKey);
    const historyContents = await buildHistory(history, apiKey, onAttachmentUpdate);
    const t1 = Date.now();
    console.log(`[streamChat] buildHistory: ${t1 - t0}ms — ${historyContents.length} content entries`);

    // Upload thumbnail images to Files API with caching (graceful degradation)
    let thumbnailParts: Part[] | undefined;
    // Single mutable cache that accumulates entries across the entire call (initial + agentic loop)
    let currentThumbnailCache: ThumbnailCache = thumbnailCache ?? {};
    if (thumbnailUrls && thumbnailUrls.length > 0) {
        const result = await fetchThumbnailParts(apiKey, thumbnailUrls, currentThumbnailCache);
        thumbnailParts = result.parts;
        currentThumbnailCache = result.updatedCache;
    }
    const t2 = Date.now();
    console.log(`[streamChat] fetchThumbnails (Files API): ${t2 - t1}ms — ${thumbnailParts?.length ?? 0} parts`);

    const userParts = buildUserParts(text, attachments, thumbnailParts);
    const contents: Content[] = [
        ...historyContents,
        { role: "user", parts: userParts },
    ];

    // TODO: Consider switching to console.debug() or gating behind a flag
    // to reduce Cloud Logging costs at scale (OBS-5)
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

    // --- Tool definitions (only if context is available for execution) ---
    const toolConfig = TOOL_DECLARATIONS.length > 0 && toolContext
        ? { tools: [{ functionDeclarations: TOOL_DECLARATIONS }] }
        : {};

    // --- Thinking config (per-model parameter mapping) ---
    const modelConfig = MODEL_REGISTRY.find(m => m.id === model);
    const buildThinkingConfig = (): Record<string, unknown> => {
        if (!modelConfig) return { thinkingConfig: { includeThoughts: true } };

        const option = thinkingOptionId
            ? modelConfig.thinkingOptions.find(o => o.id === thinkingOptionId)
            : modelConfig.thinkingOptions.find(o => o.id === modelConfig.thinkingDefault);

        if (!option) return { thinkingConfig: { includeThoughts: true } };

        if (modelConfig.thinkingParam === 'thinkingLevel') {
            return { thinkingConfig: { includeThoughts: true, thinkingLevel: option.value } };
        } else {
            return { thinkingConfig: { includeThoughts: true, thinkingBudget: option.value } };
        }
    };
    const thinkingConfig = buildThinkingConfig();

    // === Agentic loop: iterate until Gemini returns text (not function calls) ===
    let fullText = "";
    let tokenUsage: TokenUsage | undefined;
    const allToolCalls: ToolCallRecord[] = [];
    let iteration = 0;

    // Mutable contents — we append function responses within the loop
    const agenticContents = [...contents];

    while (iteration < MAX_AGENTIC_ITERATIONS) {
        iteration++;
        console.log(`[streamChat] Iteration ${iteration}/${MAX_AGENTIC_ITERATIONS} — calling generateContentStream...`);

        // Variables declared outside the retry loop so tool-call execution can access them after break
        let iterationText = "";
        let chunkCount = 0;
        const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
        // Collect raw parts from model response to preserve thought_signature
        const rawModelParts: Part[] = [];

        // Checkpoint: save fullText before this iteration so we can restore on retry
        const fullTextCheckpoint = fullText;

        // --- Per-iteration retry loop for inactivity timeouts ---
        for (let attempt = 1; attempt <= MAX_STREAM_RETRIES + 1; attempt++) {
            // Reset per-attempt state
            iterationText = "";
            chunkCount = 0;
            functionCalls.length = 0;
            rawModelParts.length = 0;

            // Restore fullText to checkpoint (no-op on first attempt)
            fullText = fullTextCheckpoint;

            // Fresh per-attempt abort controller
            const iterationAbort = new AbortController();
            let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

            // Propagate caller cancel to this iteration
            const handleCallerAbort = () => iterationAbort.abort(signal?.reason);
            signal?.addEventListener("abort", handleCallerAbort);

            // Inactivity timer — aborts only this attempt
            const resetTimer = () => {
                if (inactivityTimer) clearTimeout(inactivityTimer);
                inactivityTimer = setTimeout(() => {
                    console.error(`[streamChat] ⏰ Inactivity timeout — no chunks for ${STREAM_INACTIVITY_TIMEOUT_MS / 1000}s (attempt ${attempt})`);
                    iterationAbort.abort(new GeminiTimeoutError());
                }, STREAM_INACTIVITY_TIMEOUT_MS);
            };

            try {
                resetTimer(); // start timer before API call

                const response = await ai.models.generateContentStream({
                    model,
                    contents: agenticContents,
                    config: {
                        systemInstruction: systemPrompt || undefined,
                        abortSignal: iterationAbort.signal,
                        ...toolConfig,
                        ...thinkingConfig,
                    },
                });

                for await (const chunk of response) {
                    resetTimer(); // reset on each chunk
                    chunkCount++;

                    // Collect function calls and thoughts from this chunk
                    if (chunk.candidates?.[0]?.content?.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            // Log only thought-flagged parts (diagnostic for thinking leak)
                            if (part.thought) {
                                console.log(`[streamChat] 🧠 thought part: ${part.text?.length ?? 0}ch`);
                            }

                            if (part.functionCall) {
                                const fc = part.functionCall;
                                functionCalls.push({
                                    name: fc.name!,
                                    args: (fc.args ?? {}) as Record<string, unknown>,
                                });
                                // Preserve original part (includes thought_signature)
                                rawModelParts.push(part);
                            } else if (part.thought && part.text) {
                                // Extract thinking/reasoning tokens
                                onThought?.(part.text);
                                // Preserve thought parts for signature continuity
                                rawModelParts.push(part);
                            }
                        }
                    }

                    // Collect text — manually extract from parts, skipping thought-flagged ones.
                    // DO NOT use chunk.text: it's a convenience accessor that concatenates ALL
                    // part.text values including thoughts, causing them to leak into the response.
                    let chunkText = "";
                    if (chunk.candidates?.[0]?.content?.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            if (part.text && !part.thought && !part.functionCall) {
                                chunkText += part.text;
                            }
                        }
                    }
                    if (chunkText) {
                        iterationText += chunkText;
                        fullText += chunkText;
                        onChunk(fullText);

                        if (chunkCount <= 3 || chunkCount % 10 === 0) {
                            console.log(`[streamChat] chunk #${chunkCount}: +${chunkText.length} chars (total: ${fullText.length})`);
                        }
                    }

                    if (iterationAbort.signal.aborted) {
                        const reason = iterationAbort.signal.reason;
                        if (reason instanceof GeminiTimeoutError) throw reason;
                        throw new DOMException("Generation stopped", "AbortError");
                    }

                    if (chunk.usageMetadata) {
                        tokenUsage = {
                            promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                            completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                            totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
                            cachedTokens: (chunk.usageMetadata as Record<string, unknown>).cachedContentTokenCount as number | undefined,
                        };
                    }
                }

                console.log(`[streamChat] Iteration ${iteration} done — ${chunkCount} chunks, ${iterationText.length} chars text, ${functionCalls.length} function calls`);
                // Success — exit retry loop
                break;

            } catch (err) {
                // The SDK throws DOMException("This operation was aborted") on abort —
                // it does NOT propagate our abort reason. Check the SIGNAL's reason instead.
                const abortReason = iterationAbort.signal.reason;
                const isInactivityTimeout = abortReason instanceof GeminiTimeoutError;

                if (isInactivityTimeout || isTransientApiError(err)) {
                    // If the caller cancelled, don't retry — propagate immediately
                    if (signal?.aborted) throw err;

                    if (attempt <= MAX_STREAM_RETRIES) {
                        const label = isInactivityTimeout ? 'timeout' : '503 UNAVAILABLE';
                        console.log(`[streamChat] Retry attempt ${attempt}/${MAX_STREAM_RETRIES} after ${label} — iteration ${iteration}`);
                        if (!isInactivityTimeout) {
                            // Brief delay before retrying 503: give the overloaded server a moment
                            await new Promise(r => setTimeout(r, RETRY_503_DELAY_MS));
                        }
                        onRetry?.(attempt);
                        continue; // next attempt
                    }
                    // Exhausted all retries — propagate
                    throw isInactivityTimeout
                        ? abortReason  // throw the original GeminiTimeoutError (clear message for user)
                        : err;
                }
                // Non-transient errors propagate immediately
                throw err;
            } finally {
                if (inactivityTimer) clearTimeout(inactivityTimer);
                signal?.removeEventListener("abort", handleCallerAbort);
            }
        }

        // If no function calls, we're done — Gemini returned a final text response
        if (functionCalls.length === 0) {
            break;
        }

        // --- Execute function calls ---
        if (!toolContext) {
            console.warn(`[streamChat] Gemini returned function calls but no toolContext — skipping`);
            break;
        }

        // Append Gemini's original response (preserves thought_signature in functionCall parts)
        const { createFR } = await getPartFactories();
        const modelParts: Part[] = [];
        if (iterationText) {
            modelParts.push({ text: iterationText });
        }
        // Use raw parts from model response — they contain thought_signature
        modelParts.push(...rawModelParts);
        agenticContents.push({ role: "model", parts: modelParts });

        // Execute all tools in parallel and collect responses
        // Emit toolCall SSE events immediately so UI shows pending badges
        const batchStartIndex = allToolCalls.length;
        for (let i = 0; i < functionCalls.length; i++) {
            const fc = functionCalls[i];
            onToolCall?.(fc.name, fc.args, batchStartIndex + i);
        }

        const results = await Promise.all(
            functionCalls.map((fc, i) => {
                const callIndex = batchStartIndex + i;
                console.log(`[streamChat] Executing tool: ${fc.name}(${JSON.stringify(fc.args)})`);
                const toolCtxWithProgress: ToolContext = {
                    ...toolContext,
                    reportProgress: (message: string) => {
                        onToolProgress?.(fc.name, message, callIndex);
                    },
                };
                return executeTool({ name: fc.name, args: fc.args }, toolCtxWithProgress);
            }),
        );

        const functionResponseParts: Part[] = [];
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const fc = functionCalls[i];
            const callIndex = batchStartIndex + i;

            // Run thumbnail middleware on every tool response (no-op if no visualContextUrls)
            const { imageParts, updatedCache, cleanedResponse, blockedCount } =
                await enhanceWithThumbnails(
                    result.response,
                    largePayloadApproved ?? false,
                    apiKey,
                    currentThumbnailCache,
                    (msg) => onToolProgress?.(result.name, msg, callIndex),
                );
            currentThumbnailCache = updatedCache;

            if (blockedCount) {
                onLargePayloadBlocked?.(blockedCount);
            }

            // Strip internal Gemini hints before exposing to UI / persisting to Firestore.
            // The full cleanedResponse (with _systemNote) still goes to Gemini via createFR.
            const uiResponse: Record<string, unknown> = { ...cleanedResponse };
            delete uiResponse._systemNote;
            delete uiResponse._failedThumbnails;

            onToolResult?.(result.name, uiResponse, callIndex);
            allToolCalls.push({
                name: result.name,
                args: fc.args,
                result: uiResponse,
            });

            functionResponseParts.push(
                createFR("", result.name, cleanedResponse),
            );
            if (imageParts.length > 0) {
                functionResponseParts.push(...imageParts);
            }
        }

        // Append function responses for next iteration
        agenticContents.push({ role: "user", parts: functionResponseParts });
    }

    if (iteration >= MAX_AGENTIC_ITERATIONS) {
        console.warn(`[streamChat] ⚠️ Reached max iterations (${MAX_AGENTIC_ITERATIONS}) — stopping agentic loop`);
    }

    const tEnd = Date.now();
    console.log(`[streamChat] ✅ Done — ${iteration} iteration(s), ${allToolCalls.length} tool calls, ${fullText.length} chars, ${tEnd - t0}ms total`);
    if (tokenUsage) {
        const cached = tokenUsage.cachedTokens ? ` cached=${tokenUsage.cachedTokens}` : ' cached=0';
        console.log(`[streamChat] Tokens: prompt=${tokenUsage.promptTokens}, completion=${tokenUsage.completionTokens}, total=${tokenUsage.totalTokens}${cached}`);
    }
    return {
        text: fullText,
        tokenUsage,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        // Return the fully accumulated cache (initial upload + any mid-conversation fetches)
        updatedThumbnailCache: currentThumbnailCache,
    };
}

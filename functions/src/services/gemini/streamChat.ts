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
    onToolCall?: (name: string, args: Record<string, unknown>) => void;
    /** Called after a tool finishes executing with its result. */
    onToolResult?: (name: string, result: Record<string, unknown>) => void;
    /** Called when Gemini emits thinking/reasoning tokens. */
    onThought?: (thought: string) => void;
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

// --- Constants ---

/** Inactivity timeout: abort if no chunk arrives within this window. */
const STREAM_INACTIVITY_TIMEOUT_MS = 90_000;

/** Maximum agentic loop iterations to prevent infinite tool-calling loops. */
const MAX_AGENTIC_ITERATIONS = 10;

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

    try {
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

            const response = await ai.models.generateContentStream({
                model,
                contents: agenticContents,
                config: {
                    systemInstruction: systemPrompt || undefined,
                    abortSignal: combinedAbort.signal,
                    ...toolConfig,
                    ...thinkingConfig,
                },
            });

            let iterationText = "";
            let chunkCount = 0;
            const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

            for await (const chunk of response) {
                // Reset inactivity timer on each chunk
                resetTimer();
                chunkCount++;

                // Collect function calls and thoughts from this chunk
                if (chunk.candidates?.[0]?.content?.parts) {
                    for (const part of chunk.candidates[0].content.parts) {
                        if (part.functionCall) {
                            const fc = part.functionCall;
                            functionCalls.push({
                                name: fc.name!,
                                args: (fc.args ?? {}) as Record<string, unknown>,
                            });
                        }
                        // Extract thinking/reasoning tokens (not included in chunk.text)
                        if (part.thought && part.text) {
                            onThought?.(part.text);
                        }
                    }
                }

                // Collect text
                const chunkText = chunk.text ?? "";
                if (chunkText) {
                    iterationText += chunkText;
                    fullText += chunkText;
                    onChunk(fullText);

                    if (chunkCount <= 3 || chunkCount % 10 === 0) {
                        console.log(`[streamChat] chunk #${chunkCount}: +${chunkText.length} chars (total: ${fullText.length})`);
                    }
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
                        cachedTokens: (chunk.usageMetadata as Record<string, unknown>).cachedContentTokenCount as number | undefined,
                    };
                }
            }

            console.log(`[streamChat] Iteration ${iteration} done — ${chunkCount} chunks, ${iterationText.length} chars text, ${functionCalls.length} function calls`);

            // If no function calls, we're done — Gemini returned a final text response
            if (functionCalls.length === 0) {
                break;
            }

            // --- Execute function calls ---
            if (!toolContext) {
                console.warn(`[streamChat] Gemini returned function calls but no toolContext — skipping`);
                break;
            }

            // Append Gemini's response (with function calls) to contents
            const { createFC, createFR } = await getPartFactories();
            const modelParts: Part[] = [];
            if (iterationText) {
                modelParts.push({ text: iterationText });
            }
            for (const fc of functionCalls) {
                modelParts.push(createFC(fc.name, fc.args));
            }
            agenticContents.push({ role: "model", parts: modelParts });

            // Execute all tools in parallel and collect responses
            // Emit toolCall SSE events immediately so UI shows pending badges
            for (const fc of functionCalls) {
                onToolCall?.(fc.name, fc.args);
            }

            const results = await Promise.all(
                functionCalls.map(fc => {
                    console.log(`[streamChat] Executing tool: ${fc.name}(${JSON.stringify(fc.args)})`);
                    return executeTool({ name: fc.name, args: fc.args }, toolContext);
                }),
            );

            const functionResponseParts: Part[] = [];
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const fc = functionCalls[i];

                onToolResult?.(result.name, result.response);
                allToolCalls.push({
                    name: result.name,
                    args: fc.args,
                    result: result.response,
                });

                functionResponseParts.push(
                    createFR("", result.name, result.response),
                );
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
            updatedThumbnailCache,
        };
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

// =============================================================================
// Claude Stream Chat — Agentic loop with tool calling and thinking support
//
// Mirrors the Gemini streamChat architecture:
//   1. buildHistory() — convert HistoryMessage[] to Claude MessageParam[]
//   2. buildThinkingConfig() — map thinkingOptionId to Claude API shape
//   3. Streaming via client.messages.stream() with event-based processing
//   4. Agentic loop — tool_use detection → executeToolBatch → tool_result → re-stream
//   5. Retry with withStreamRetry() for transient errors
//
// Key differences from Gemini:
//   - Claude uses role 'assistant' (not 'model')
//   - Claude accepts image URLs directly (no Files API upload)
//   - Tool results go in user messages as tool_result content blocks
//   - Thinking uses budget_tokens (not thinkingLevel)
//   - Claude requires max_tokens parameter
// =============================================================================

import type Anthropic from "@anthropic-ai/sdk";
import type {
    MessageParam,
    ContentBlockParam,
    Tool,
    ToolResultBlockParam,
    ToolUseBlockParam,
    ThinkingBlockParam,
    RedactedThinkingBlockParam,
    ImageBlockParam,
    TextBlockParam,
    DocumentBlockParam,
    ThinkingConfigParam,
    CacheControlEphemeral,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import { APIError } from "@anthropic-ai/sdk/error.js";

import { getClaudeClient } from "./client.js";
import type {
    HistoryMessage,
    TokenUsage,
    ToolCallRecord,
    ToolDefinition,
    AttachmentRef,
    StreamCallbacks,
} from "../ai/types.js";
import { AiStreamTimeoutError, withStreamRetry } from "../ai/retry.js";
import { executeToolBatch } from "../ai/toolExecution.js";
import { formatContextLabel } from "../memory.js";
import { MODEL_REGISTRY } from "../../config/models.js";
import {
    computeIterationCost,
    aggregateIterations,
    type IterationSnapshot,
    type NormalizedTokenUsage,
} from "../../shared/models.js";
import type { ToolContext } from "../tools/types.js";

// =============================================================================
// Types
// =============================================================================

/** Claude-specific streamChat options (internal, not exported to provider layer). */
export interface ClaudeStreamChatOpts {
    apiKey: string;
    model: string;
    systemPrompt?: string;
    history: HistoryMessage[];
    text: string;
    attachments?: AttachmentRef[];
    imageUrls?: string[];
    tools: ToolDefinition[];
    toolContext?: ToolContext;
    thinkingOptionId?: string;
    callbacks: StreamCallbacks;
    signal?: AbortSignal;
}

/** Result type from Claude streamChat (mapped to StreamResult by factory). */
export interface ClaudeStreamChatResult {
    text: string;
    tokenUsage?: TokenUsage;
    normalizedUsage?: NormalizedTokenUsage;
    toolCalls?: ToolCallRecord[];
    /** True when the stream was aborted — usage is partial. */
    partial?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Inactivity timeout: abort if no event arrives within this window. */
const STREAM_INACTIVITY_TIMEOUT_MS = 90_000;

/** Maximum agentic loop iterations to prevent infinite tool-calling loops. */
const MAX_AGENTIC_ITERATIONS = 10;

/** Maximum number of automatic retries per iteration. */
const MAX_STREAM_RETRIES = 2;

/** Delay before retrying a transient error. */
const RETRY_DELAY_MS = 2_000;

/**
 * Default max_tokens for Claude API calls.
 * Claude requires this parameter explicitly (unlike Gemini).
 */
const DEFAULT_MAX_TOKENS = 16_384;

/** Default thinking budget when auto mode is selected. */
const DEFAULT_THINKING_BUDGET = 10_240;

/**
 * Minimum thinking budget allowed by the Claude API.
 * The API requires budget_tokens >= 1024.
 */
const MIN_THINKING_BUDGET = 1_024;

/** Cache control directive — 1-hour TTL for analytical conversations. */
const CACHE_CONTROL: CacheControlEphemeral = { type: "ephemeral", ttl: "1h" };

// =============================================================================
// Attachment Conversion
// =============================================================================

/**
 * Maximum text attachment size to include inline (bytes).
 * ~125K tokens — leaves room for history + system prompt within 200K context.
 */
const MAX_TEXT_ATTACHMENT_BYTES = 500_000;

/**
 * Convert a provider-agnostic AttachmentRef to a Claude content block (sync).
 *
 * Used for history attachments where content is NOT re-fetched:
 *   - Images → `image` block with URL source
 *   - PDFs → `document` block with URL source
 *   - Text files → `text` block with file description (content was sent on original turn)
 *   - Everything else → `text` block with file name/type description
 */
function toClaudeAttachmentBlock(att: AttachmentRef): ContentBlockParam {
    if (att.type === "image") {
        return {
            type: "image",
            source: { type: "url", url: att.url },
        } as ImageBlockParam;
    }
    if (att.mimeType === "application/pdf") {
        return {
            type: "document",
            source: { type: "url", url: att.url },
        } as DocumentBlockParam;
    }
    // Text files in history — content was already processed on the original turn
    if (att.mimeType.startsWith("text/")) {
        return {
            type: "text",
            text: `[Previously attached file: ${att.name} (${att.mimeType})]`,
        } as TextBlockParam;
    }
    // Unsupported type — include as text description
    return {
        type: "text",
        text: `[Attached file: ${att.name} (${att.mimeType})]`,
    } as TextBlockParam;
}

/**
 * Fetch text file content from a Firebase Storage URL and return as a text block.
 * Used for current-message text attachments (CSV, plain text, etc.).
 *
 * Truncates at MAX_TEXT_ATTACHMENT_BYTES to prevent context overflow.
 */
async function fetchTextAttachmentBlock(att: AttachmentRef): Promise<TextBlockParam> {
    try {
        const response = await fetch(att.url);
        if (!response.ok) {
            console.warn(`[claude:attachment] Failed to fetch ${att.name}: HTTP ${response.status}`);
            return { type: "text", text: `[Could not read file: ${att.name} (${att.mimeType})]` } as TextBlockParam;
        }

        let content = await response.text();
        let truncated = false;

        if (content.length > MAX_TEXT_ATTACHMENT_BYTES) {
            content = content.slice(0, MAX_TEXT_ATTACHMENT_BYTES);
            truncated = true;
        }

        const header = truncated
            ? `[File: ${att.name} — truncated to first ${Math.round(MAX_TEXT_ATTACHMENT_BYTES / 1000)}KB]`
            : `[File: ${att.name}]`;

        return { type: "text", text: `${header}\n${content}` } as TextBlockParam;
    } catch (err) {
        console.error(`[claude:attachment] Error fetching ${att.name}:`, err);
        return { type: "text", text: `[Could not read file: ${att.name} (${att.mimeType})]` } as TextBlockParam;
    }
}

// =============================================================================
// History Builder
// =============================================================================

/**
 * Convert provider-agnostic HistoryMessage[] to Claude MessageParam[].
 *
 * Handles:
 *   - Role mapping: 'model' -> 'assistant'
 *   - Layer 2 context labels for user messages with appContext
 *   - Image/PDF attachments as native content blocks
 *   - Non-supported attachments as text descriptions
 *   - Summary synthetic messages (id starting with '__summary__')
 */
function buildHistory(messages: HistoryMessage[]): MessageParam[] {
    return messages.map((msg) => {
        const role: "user" | "assistant" = msg.role === "model" ? "assistant" : "user";

        // Build content blocks
        const blocks: ContentBlockParam[] = [];

        // Attachments → native content blocks via shared helper
        if (msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
                blocks.push(toClaudeAttachmentBlock(att));
            }
        }

        // Text content with optional context label
        let text = msg.text;
        if (role === "user" && msg.appContext && msg.appContext.length > 0) {
            const label = formatContextLabel(msg.appContext);
            text = `${label}\n\n${text}`;
        }

        blocks.push({ type: "text", text } as TextBlockParam);

        return { role, content: blocks };
    });
}

// =============================================================================
// Thinking Config Builder
// =============================================================================

/**
 * Build the `thinking` config param for Claude API from MODEL_REGISTRY options.
 *
 * Two modes:
 *   - 'adaptive' (Opus 4.6, Sonnet 4.6): { type: "adaptive" } — effort is set via output_config
 *   - 'budget' (legacy/Haiku): { type: "enabled", budget_tokens: N } or { type: "disabled" }
 *
 * Special values for budget mode:
 *   - value = 0 (id: 'off') → thinking disabled
 *   - value = -1 (id: 'auto') → use DEFAULT_THINKING_BUDGET
 *   - value > 0 → use as budget_tokens directly
 */
function buildThinkingConfig(
    model: string,
    thinkingOptionId?: string,
): { thinking: ThinkingConfigParam; effort?: string } | undefined {
    const modelConfig = MODEL_REGISTRY.find((m) => m.id === model);
    if (!modelConfig) return undefined;

    const option = thinkingOptionId
        ? modelConfig.thinkingOptions.find((o) => o.id === thinkingOptionId)
        : modelConfig.thinkingOptions.find((o) => o.id === modelConfig.thinkingDefault);

    if (!option) return undefined;

    // Adaptive mode (Opus 4.6, Sonnet 4.6)
    if (modelConfig.thinkingMode === 'adaptive') {
        const effort = option.value as string;
        if (effort === 'off') {
            return { thinking: { type: "disabled" } };
        }
        // Adaptive thinking — effort is passed separately via output_config
        return { thinking: { type: 'adaptive' as const }, effort };
    }

    // Budget mode (legacy — Haiku etc.)
    const budget = option.value as number;

    // Off: disable thinking entirely
    if (budget === 0) {
        return { thinking: { type: "disabled" } };
    }

    // Auto: use a reasonable default
    if (budget === -1) {
        return { thinking: { type: "enabled", budget_tokens: DEFAULT_THINKING_BUDGET } };
    }

    // Explicit budget (enforce minimum)
    return {
        thinking: {
            type: "enabled",
            budget_tokens: Math.max(budget, MIN_THINKING_BUDGET),
        },
    };
}

// =============================================================================
// Tool Conversion
// =============================================================================

/**
 * Convert provider-agnostic ToolDefinition[] to Claude Tool format.
 *
 * Claude uses `input_schema` with a required `type: 'object'` property.
 */
function toClaudeTools(tools: ToolDefinition[]): Tool[] {
    return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parametersJsonSchema as Tool.InputSchema,
    }));
}

// =============================================================================
// Cache Breakpoints
// =============================================================================

/**
 * Apply incremental cache breakpoint (BP3) on the last content block
 * of the second-to-last message. Returns a new messages array without
 * mutating the original.
 *
 * Skips BP3 if fewer than 2 messages (e.g. first message with no history).
 */
function applyCacheBreakpoints(messages: MessageParam[]): MessageParam[] {
    if (messages.length < 2) return messages;

    const idx = messages.length - 2;
    const msg = messages[idx];
    const content = msg.content;

    // String content — wrap in text block with cache_control
    if (typeof content === "string") {
        const result = [...messages];
        result[idx] = {
            ...msg,
            content: [{ type: "text" as const, text: content, cache_control: CACHE_CONTROL }],
        };
        return result;
    }

    // Array content — clone last block and add cache_control
    if (Array.isArray(content) && content.length > 0) {
        const newContent = [...content];
        // All Anthropic content block types support optional cache_control
        newContent[newContent.length - 1] = {
            ...content[content.length - 1],
            cache_control: CACHE_CONTROL,
        } as ContentBlockParam;
        const result = [...messages];
        result[idx] = { ...msg, content: newContent };
        return result;
    }

    return messages;
}

// =============================================================================
// Transient Error Detection
// =============================================================================

/**
 * Claude-specific transient error predicate.
 * Returns true for errors that are safe to retry:
 *   - AiStreamTimeoutError: stream stalled (no events for 90s)
 *   - HTTP 529: API overloaded
 *   - HTTP 500: Internal server error
 *   - HTTP 503: Service unavailable
 *
 * Passed to withStreamRetry() as the `isTransient` predicate.
 */
function isClaudeTransient(err: unknown): boolean {
    if (err instanceof AiStreamTimeoutError) return true;
    if (err instanceof APIError) {
        return err.status === 529 || err.status === 500 || err.status === 503;
    }
    return false;
}

// =============================================================================
// Main Streaming Function
// =============================================================================

/**
 * Stream a Claude chat completion with agentic tool-calling loop.
 *
 * Flow:
 *   1. Build history + current message
 *   2. Configure thinking + tools
 *   3. Stream response, collecting text, thoughts, and tool_use blocks
 *   4. If tool_use blocks found → execute tools → append results → re-stream
 *   5. Repeat until no more tool_use blocks or MAX_ITERATIONS
 *   6. Return accumulated text + token usage + tool call records
 */
export async function streamChat(
    opts: ClaudeStreamChatOpts,
): Promise<ClaudeStreamChatResult> {
    const {
        apiKey,
        model,
        systemPrompt,
        history,
        text,
        attachments,
        imageUrls,
        tools,
        toolContext,
        thinkingOptionId,
        callbacks,
        signal,
    } = opts;

    const t0 = Date.now();
    console.log(
        `[claude:streamChat] Starting — model=${model}, history=${history.length} msgs, ` +
        `attachments=${attachments?.length ?? 0}, images=${imageUrls?.length ?? 0}`,
    );

    // --- Build message history ---
    const historyMessages = buildHistory(history);
    const t1 = Date.now();
    console.log(
        `[claude:streamChat] buildHistory: ${t1 - t0}ms — ${historyMessages.length} messages`,
    );

    // --- Build current user message ---
    const userBlocks: ContentBlockParam[] = [];

    // Current-message attachments → native content blocks
    // Text files (CSV, plain text, etc.) are fetched and included inline.
    if (attachments && attachments.length > 0) {
        for (const att of attachments) {
            if (att.mimeType.startsWith("text/")) {
                userBlocks.push(await fetchTextAttachmentBlock(att));
            } else {
                userBlocks.push(toClaudeAttachmentBlock(att));
            }
        }
    }

    // Inline image URLs (thumbnails from context)
    if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls) {
            userBlocks.push({
                type: "image",
                source: { type: "url", url },
            } as ImageBlockParam);
        }
    }

    // User text
    userBlocks.push({ type: "text", text } as TextBlockParam);

    // --- Assemble full message list ---
    const messages: MessageParam[] = [
        ...historyMessages,
        { role: "user", content: userBlocks },
    ];

    // --- Tool definitions ---
    const claudeTools = tools.length > 0 && toolContext ? toClaudeTools(tools) : [];

    // Apply cache breakpoint on last tool definition (BP2)
    if (claudeTools.length > 0) {
        claudeTools[claudeTools.length - 1].cache_control = CACHE_CONTROL;
    }

    // --- Model config (for pricing + normalization) ---
    const modelConfig = MODEL_REGISTRY.find(m => m.id === model);

    // --- Thinking config ---
    const thinkingResult = buildThinkingConfig(model, thinkingOptionId);
    const thinkingConfig = thinkingResult?.thinking;
    const thinkingEffort = thinkingResult?.effort;
    const thinkingEnabled = thinkingConfig && thinkingConfig.type !== 'disabled';

    // --- max_tokens: when thinking is enabled, budget_tokens counts toward max_tokens ---
    // Claude requires max_tokens >= budget_tokens, so we set it high enough.
    let maxTokens = DEFAULT_MAX_TOKENS;
    if (thinkingEnabled && thinkingConfig.type === 'enabled' && 'budget_tokens' in thinkingConfig) {
        // Budget mode: ensure max_tokens accommodates thinking budget + response tokens
        maxTokens = Math.max(maxTokens, thinkingConfig.budget_tokens + DEFAULT_MAX_TOKENS);
    } else if (thinkingEnabled && thinkingConfig.type === 'adaptive') {
        // Adaptive mode: Claude decides thinking budget, set generous max_tokens
        maxTokens = 16_000;
    }

    // Diagnostic logging
    console.log(
        `[claude:streamChat] Payload: ${messages.length} messages, ` +
        `${claudeTools.length} tools, thinking=${thinkingConfig?.type ?? 'none'}` +
        `${thinkingEffort ? ` effort=${thinkingEffort}` : ''}, ` +
        `max_tokens=${maxTokens}`,
    );
    if (systemPrompt) {
        console.log(`[claude:streamChat] System prompt: ${systemPrompt.length} chars`);
    }

    // === Agentic loop ===
    let fullText = "";
    let tokenUsage: TokenUsage | undefined;
    const allToolCalls: ToolCallRecord[] = [];
    const iterationSnapshots: IterationSnapshot[] = [];
    let iteration = 0;

    // Mutable messages list — we append tool results within the loop
    const agenticMessages = [...messages];

    while (iteration < MAX_AGENTIC_ITERATIONS) {
        iteration++;
        console.log(
            `[claude:streamChat] Iteration ${iteration}/${MAX_AGENTIC_ITERATIONS} — ` +
            `calling messages.stream()...`,
        );

        // --- Stream with retry ---
        const iterationResult = await withStreamRetry(
            () => streamIteration({
                client: getClaudeClient(apiKey),
                model,
                systemPrompt,
                messages: agenticMessages,
                tools: claudeTools,
                thinkingConfig,
                thinkingEffort,
                maxTokens,
                callbacks,
                signal,
                fullTextBefore: fullText,
            }),
            {
                maxRetries: MAX_STREAM_RETRIES,
                isTransient: isClaudeTransient,
                delayMs: RETRY_DELAY_MS,
                onRetry: (attempt) => {
                    console.log(
                        `[claude:streamChat] Retry attempt ${attempt}/${MAX_STREAM_RETRIES} — ` +
                        `iteration ${iteration}`,
                    );
                    callbacks.onRetry?.(attempt);
                },
                signal,
            },
        );

        // Accumulate text + tokens (sum across iterations, not overwrite)
        fullText = iterationResult.fullText;
        if (iterationResult.tokenUsage) {
            // Build per-iteration snapshot for normalized usage
            // Claude: input_tokens EXCLUDES cached, so total = input + cache_read + cache_write
            const tu = iterationResult.tokenUsage;
            const cached = tu.cachedTokens ?? 0;
            const cacheWrite = tu.cacheWriteTokens ?? 0;
            const thinkingTokens = Math.ceil(iterationResult.thinkingChars / 4);
            const snapshotTokens = {
                input: {
                    total: tu.promptTokens + cached + cacheWrite,
                    fresh: tu.promptTokens,
                    cached,
                    cacheWrite,
                },
                output: {
                    total: tu.completionTokens,
                    thinking: thinkingTokens,
                },
            };
            if (modelConfig) {
                iterationSnapshots.push({
                    ...snapshotTokens,
                    cost: computeIterationCost(modelConfig.pricing, snapshotTokens),
                });
            } else {
                iterationSnapshots.push({
                    ...snapshotTokens,
                    cost: { input: 0, cached: 0, cacheWrite: 0, output: 0, total: 0, withoutCache: 0, thinkingSubset: 0 },
                });
            }

            // Legacy accumulation (unchanged for backward compat)
            if (tokenUsage) {
                const newCached = (tokenUsage.cachedTokens ?? 0) + (tu.cachedTokens ?? 0);
                const newCacheWrite = (tokenUsage.cacheWriteTokens ?? 0) + (tu.cacheWriteTokens ?? 0);
                tokenUsage = {
                    promptTokens: tokenUsage.promptTokens + tu.promptTokens,
                    completionTokens: tokenUsage.completionTokens + tu.completionTokens,
                    totalTokens: tokenUsage.totalTokens + tu.totalTokens,
                    cachedTokens: newCached > 0 ? newCached : undefined,
                    cacheWriteTokens: newCacheWrite > 0 ? newCacheWrite : undefined,
                };
            } else {
                tokenUsage = tu;
            }
        }

        console.log(
            `[claude:streamChat] Iteration ${iteration} done — ` +
            `${iterationResult.iterationText.length} chars text, ` +
            `${iterationResult.toolUseBlocks.length} tool_use blocks` +
            `${iterationResult.partial ? ' (PARTIAL — aborted)' : ''}`,
        );

        // If aborted, stop the agentic loop — usage is partial
        if (iterationResult.partial) {
            break;
        }

        // If no tool_use blocks, we're done
        if (iterationResult.toolUseBlocks.length === 0) {
            break;
        }

        // --- Execute tool calls ---
        if (!toolContext) {
            console.warn(
                `[claude:streamChat] Claude returned tool_use blocks but no toolContext — skipping`,
            );
            break;
        }

        // Append assistant message with all content blocks (text + thinking + tool_use)
        agenticMessages.push({
            role: "assistant",
            content: iterationResult.assistantBlocks,
        });

        // Execute tools via shared batch executor
        const batchStartIndex = allToolCalls.length;
        const toolCalls = iterationResult.toolUseBlocks.map((tu) => ({
            name: tu.name,
            args: tu.input as Record<string, unknown>,
        }));

        const batch = await executeToolBatch({
            calls: toolCalls,
            toolContext,
            callbacks: {
                onToolCall: callbacks.onToolCall,
                onToolResult: callbacks.onToolResult,
                onToolProgress: callbacks.onToolProgress,
            },
            batchStartIndex,
            processImages: async (response) => {
                // Claude accepts image URLs directly — no upload needed
                const urls = extractVisualContextUrls(response);
                const cleanedResponse = { ...response };
                delete cleanedResponse.visualContextUrls;
                return {
                    imageUrls: urls,
                    cleanedResponse,
                };
            },
        });

        // --- Build tool_result content blocks for Claude ---
        const toolResultBlocks: ContentBlockParam[] = [];
        for (let i = 0; i < batch.results.length; i++) {
            const entry = batch.results[i];
            const toolUseBlock = iterationResult.toolUseBlocks[i];

            // Record for final result
            allToolCalls.push({
                name: entry.name,
                args: entry.args,
                result: entry.result,
            });

            // Build tool_result block
            const resultContent: Array<TextBlockParam | ImageBlockParam> = [];

            // Tool response text
            resultContent.push({
                type: "text",
                text: JSON.stringify(entry.result),
            } as TextBlockParam);

            // Inline image URLs from tool response (Claude accepts URLs directly)
            if (entry.imageUrls && entry.imageUrls.length > 0) {
                for (const url of entry.imageUrls) {
                    resultContent.push({
                        type: "image",
                        source: { type: "url", url },
                    } as ImageBlockParam);
                }
            }

            toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: toolUseBlock.id,
                content: resultContent,
            } as ToolResultBlockParam);
        }

        // Append user message with tool_result blocks
        agenticMessages.push({
            role: "user",
            content: toolResultBlocks,
        });
    }

    if (iteration >= MAX_AGENTIC_ITERATIONS) {
        console.warn(
            `[claude:streamChat] Reached max iterations (${MAX_AGENTIC_ITERATIONS}) — ` +
            `stopping agentic loop`,
        );
    }

    const tEnd = Date.now();
    console.log(
        `[claude:streamChat] Done — ${iteration} iteration(s), ` +
        `${allToolCalls.length} tool calls, ${fullText.length} chars, ${tEnd - t0}ms total`,
    );
    if (tokenUsage) {
        console.log(
            `[claude:streamChat] Tokens: prompt=${tokenUsage.promptTokens}, ` +
            `completion=${tokenUsage.completionTokens}, ` +
            `total=${tokenUsage.totalTokens}`,
        );
        console.log(
            `[claude:streamChat] Cache: ${tokenUsage.cachedTokens ?? 0} read, ` +
            `${tokenUsage.cacheWriteTokens ?? 0} write tokens`,
        );
    }

    // Aggregate iteration snapshots into normalizedUsage
    let normalizedUsage: NormalizedTokenUsage | undefined;
    // Detect if any iteration was aborted (partial usage)
    const wasAborted = signal?.aborted === true;
    if (iterationSnapshots.length > 0 && modelConfig) {
        normalizedUsage = aggregateIterations(iterationSnapshots, modelConfig);
        if (wasAborted) {
            normalizedUsage.partial = true;
        }
    }

    return {
        text: fullText,
        tokenUsage,
        normalizedUsage,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        partial: wasAborted,
    };
}

// =============================================================================
// Stream Iteration (single API call)
// =============================================================================

interface StreamIterationOpts {
    client: Anthropic;
    model: string;
    systemPrompt?: string;
    messages: MessageParam[];
    tools: Tool[];
    thinkingConfig?: ThinkingConfigParam;
    thinkingEffort?: string;
    maxTokens: number;
    callbacks: StreamCallbacks;
    signal?: AbortSignal;
    fullTextBefore: string;
}

interface StreamIterationResult {
    /** Text produced in this iteration only. */
    iterationText: string;
    /** Full accumulated text (previous + this iteration). */
    fullText: string;
    /** Token usage from this iteration. */
    tokenUsage?: TokenUsage;
    /** Approximate thinking token count (chars / 4). */
    thinkingChars: number;
    /** Tool use blocks from the model response (empty if none). */
    toolUseBlocks: Array<{ id: string; name: string; input: unknown }>;
    /**
     * All content blocks from the assistant response — needed to build
     * the assistant message for the next agentic turn.
     * Includes text, thinking, and tool_use blocks.
     */
    assistantBlocks: ContentBlockParam[];
    /** True when stream was aborted — usage is partial (input exact, output approximate). */
    partial?: boolean;
}

/**
 * Execute a single streaming API call to Claude.
 *
 * Uses the MessageStream event-based API with an inactivity timeout.
 * Collects text, thinking, and tool_use blocks from the response.
 */
async function streamIteration(
    opts: StreamIterationOpts,
): Promise<StreamIterationResult> {
    const {
        client,
        model,
        systemPrompt,
        messages,
        tools,
        thinkingConfig,
        thinkingEffort,
        maxTokens,
        callbacks,
        signal,
        fullTextBefore,
    } = opts;

    let iterationText = "";
    let fullText = fullTextBefore;
    let tokenUsage: TokenUsage | undefined;
    let thinkingChars = 0;
    const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = [];
    const assistantBlocks: ContentBlockParam[] = [];
    let partial = false;
    // Early usage from "message" event (fires before content, available even on abort)
    let earlyInputTokens: number | undefined;
    let earlyCacheRead: number | undefined;
    let earlyCacheWrite: number | undefined;

    // Inactivity timeout
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutReject: ((err: Error) => void) | null = null;

    const resetTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            console.error(
                `[claude:streamChat] Inactivity timeout — no events for ` +
                `${STREAM_INACTIVITY_TIMEOUT_MS / 1000}s`,
            );
            timeoutReject?.(
                new AiStreamTimeoutError(
                    "Claude did not respond within 90 seconds. Please try again.",
                ),
            );
        }, STREAM_INACTIVITY_TIMEOUT_MS);
    };

    try {
        // Build API params
        const params: Anthropic.MessageCreateParamsNonStreaming = {
            model,
            max_tokens: maxTokens,
            messages: applyCacheBreakpoints(messages),
            ...(systemPrompt ? {
                system: [{ type: "text" as const, text: systemPrompt, cache_control: CACHE_CONTROL }],
            } : {}),
            ...(tools.length > 0 ? { tools } : {}),
            ...(thinkingConfig ? { thinking: thinkingConfig } : {}),
            ...(thinkingEffort ? { output_config: { effort: thinkingEffort as 'low' | 'medium' | 'high' | 'max' } } : {}),
        };

        // Create stream — wrap in a promise race with timeout
        const streamPromise = new Promise<void>((resolve, reject) => {
            timeoutReject = reject;
            resetTimer();

            const stream = client.messages.stream(
                params as Anthropic.MessageCreateParamsNonStreaming,
                signal ? { signal } : undefined,
            );

            // --- Event handlers ---

            // "message" fires BEFORE content generation — contains usage.input_tokens.
            // Available even on immediate abort. Used for partial usage on stopped messages.
            stream.on("message", (message) => {
                resetTimer();
                if (message.usage) {
                    earlyInputTokens = message.usage.input_tokens;
                    // Cache fields available in message.usage but not in SDK types
                    const usage = message.usage as unknown as Record<string, unknown>;
                    earlyCacheRead = usage.cache_read_input_tokens as number | undefined;
                    earlyCacheWrite = usage.cache_creation_input_tokens as number | undefined;
                }
            });

            stream.on("text", (textDelta) => {
                resetTimer();
                iterationText += textDelta;
                fullText += textDelta;
                callbacks.onChunk(fullText);
            });

            stream.on("thinking", (thinkingDelta) => {
                resetTimer();
                // Count thinking chars for approximate token estimation (chars / 4, ~±15%)
                thinkingChars += (thinkingDelta as string).length;
                // Thinking tokens — emit via callback but DO NOT include in response text
                callbacks.onThought?.(thinkingDelta);
            });

            stream.on("contentBlock", (block) => {
                resetTimer();
                if (block.type === "tool_use") {
                    toolUseBlocks.push({
                        id: block.id,
                        name: block.name,
                        input: block.input,
                    });
                    // Preserve for assistant message in agentic loop
                    assistantBlocks.push({
                        type: "tool_use",
                        id: block.id,
                        name: block.name,
                        input: block.input,
                    } as ToolUseBlockParam);
                } else if (block.type === "thinking") {
                    // Preserve thinking blocks for assistant message continuity
                    assistantBlocks.push({
                        type: "thinking",
                        thinking: block.thinking,
                        signature: block.signature,
                    } as ThinkingBlockParam);
                } else if (block.type === "redacted_thinking") {
                    // Preserve redacted thinking blocks
                    assistantBlocks.push({
                        type: "redacted_thinking",
                        data: block.data,
                    } as RedactedThinkingBlockParam);
                } else if (block.type === "text") {
                    // Text block is already captured by 'text' event
                    // but we need it in assistantBlocks for the agentic loop
                    assistantBlocks.push({
                        type: "text",
                        text: block.text,
                    } as TextBlockParam);
                }
            });

            stream.on("finalMessage", (message) => {
                resetTimer();
                // Extract token usage from the final message
                if (message.usage) {
                    const cacheRead = message.usage.cache_read_input_tokens ?? 0;
                    const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
                    tokenUsage = {
                        promptTokens: message.usage.input_tokens,
                        completionTokens: message.usage.output_tokens,
                        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
                        cachedTokens: cacheRead > 0 ? cacheRead : undefined,
                        cacheWriteTokens: cacheWrite > 0 ? cacheWrite : undefined,
                    };
                }
            });

            stream.on("error", (error) => {
                reject(error);
            });

            stream.on("end", () => {
                resolve();
            });
        });

        await streamPromise;
    } catch (err) {
        // On abort: build partial usage from earlyInputTokens (exact input, approximate output)
        const isAbort = err instanceof Error && (
            err.name === 'AbortError' ||
            (err as { code?: string }).code === 'ERR_CANCELLED' ||
            signal?.aborted
        );
        if (isAbort && earlyInputTokens != null) {
            const approxOutput = Math.ceil(iterationText.length / 4);
            const cached = earlyCacheRead ?? 0;
            const cacheWrite = earlyCacheWrite ?? 0;
            tokenUsage = {
                promptTokens: earlyInputTokens,
                completionTokens: approxOutput,
                totalTokens: earlyInputTokens + cached + cacheWrite + approxOutput,
                cachedTokens: cached > 0 ? cached : undefined,
                cacheWriteTokens: cacheWrite > 0 ? cacheWrite : undefined,
            };
            partial = true;
            console.log(
                `[claude:streamChat] Abort — partial usage: input=${earlyInputTokens}, ` +
                `output≈${approxOutput} (${iterationText.length} chars / 4)`,
            );
        } else {
            throw err;
        }
    } finally {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        timeoutReject = null;
    }

    return {
        iterationText,
        fullText,
        tokenUsage,
        thinkingChars,
        toolUseBlocks,
        assistantBlocks,
        partial,
    };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract visualContextUrls from a tool response.
 * Tool handlers may include image URLs for visual context in this field.
 */
function extractVisualContextUrls(response: Record<string, unknown>): string[] {
    const urls = response.visualContextUrls;
    if (!Array.isArray(urls)) return [];
    return urls.filter((u): u is string => typeof u === "string");
}

// =============================================================================
// Claude Provider Factory — Creates AiProvider instances for Claude models
//
// Implements the AiProvider interface by delegating to the Claude streamChat
// function. Handles mapping between provider-agnostic types and Claude-specific
// formats.
//
// Usage:
//   const provider = claudeFactory({ apiKey: 'sk-ant-...' });
//   const result = await provider.streamChat(opts);
// =============================================================================

import type { AiProvider, GenerateTextOpts, GenerateTextResult, ProviderFactory, ProviderStreamOpts, StreamResult } from "../ai/types.js";
import { MODEL_REGISTRY } from "../../shared/models.js";
import { streamChat } from "./streamChat.js";

/**
 * Factory that creates a Claude AiProvider from configuration.
 *
 * Required config:
 *   - `apiKey` (string): Anthropic API key
 */
export const claudeFactory: ProviderFactory = (config: Record<string, unknown>): AiProvider => {
    const apiKey = config.apiKey;
    if (!apiKey || typeof apiKey !== "string") {
        throw new Error(
            "[claudeFactory] Missing or invalid `apiKey` in config. " +
            "Provide a valid Anthropic API key.",
        );
    }

    return {
        async streamChat(opts: ProviderStreamOpts): Promise<StreamResult> {
            const result = await streamChat({
                apiKey,
                model: opts.model,
                systemPrompt: opts.systemPrompt,
                history: opts.history,
                text: opts.text,
                attachments: opts.attachments,
                imageUrls: opts.imageUrls,
                tools: opts.tools,
                toolContext: opts.toolContext,
                thinkingOptionId: opts.thinkingOptionId,
                callbacks: opts.callbacks,
                signal: opts.signal,
            });

            // Map Claude result → provider-agnostic StreamResult
            return {
                text: result.text,
                tokenUsage: result.tokenUsage,
                normalizedUsage: result.normalizedUsage,
                toolCalls: result.toolCalls,
                providerMeta: result.toolIterations
                    ? { toolIterations: result.toolIterations }
                    : undefined,
                agenticImages: result.agenticImages,
                partial: result.partial,
            };
        },

        async generateText(opts: GenerateTextOpts): Promise<GenerateTextResult> {
            const { getClaudeClient } = await import("./client.js");
            const client = await getClaudeClient(apiKey);

            // Resolve max_tokens from MODEL_REGISTRY with fallback
            const modelConfig = MODEL_REGISTRY.find(m => m.id === opts.model);
            const maxTokens = modelConfig?.maxOutputTokens ?? 16384;

            // Build request params — SDK types are dynamic, use Record<string, unknown>
            const params: Record<string, unknown> = {
                model: opts.model,
                max_tokens: maxTokens,
                messages: [{ role: "user" as const, content: opts.text }],
            };
            if (opts.systemPrompt) {
                params.system = opts.systemPrompt;
            }

            // Structured output: use tool_use pattern with forced tool_choice
            if (opts.responseSchema) {
                params.tools = [{
                    name: "respond",
                    description: "Return structured result",
                    input_schema: opts.responseSchema,
                }];
                params.tool_choice = { type: "tool", name: "respond" };
            }

            // Use streaming to avoid Anthropic SDK timeout on thinking-enabled requests.
            // Collect the final message — no intermediate events needed for one-shot generation.
            const stream = client.messages.stream(params);
            const response = await stream.finalMessage();

            // Extract token usage + thinking tokens from content blocks
            const contentBlocks = response.content as Array<{ type: string; input?: unknown; text?: string; thinking?: string }>;
            const usage = response.usage as { input_tokens?: number; output_tokens?: number } | undefined;
            // Claude: output_tokens already includes thinking. Estimate thinking from thinking blocks.
            const thinkingChars = contentBlocks
                .filter(b => b.type === "thinking")
                .reduce((sum, b) => sum + (b.thinking?.length ?? 0), 0);
            const thinkingTokens = Math.ceil(thinkingChars / 4);
            const tokenUsage = {
                promptTokens: usage?.input_tokens ?? 0,
                completionTokens: usage?.output_tokens ?? 0,
                totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
                thinkingTokens,
            };
            if (opts.responseSchema) {
                const toolBlock = contentBlocks.find(b => b.type === "tool_use");
                if (!toolBlock) {
                    throw new Error(
                        `[claude/generateText] Expected tool_use block in response but found none. ` +
                        `Content types: ${contentBlocks.map(b => b.type).join(", ")}`,
                    );
                }
                const parsed: unknown = toolBlock.input;
                const text = typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed);
                return { text, tokenUsage, parsed };
            }

            // Plain text: join text blocks
            const text = contentBlocks
                .filter(b => b.type === "text")
                .map(b => b.text ?? "")
                .join("");

            return { text, tokenUsage };
        },
    };
};

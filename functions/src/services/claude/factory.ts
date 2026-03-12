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

import type { AiProvider, ProviderFactory, ProviderStreamOpts, StreamResult } from "../ai/types.js";
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
                agenticImages: result.agenticImages,
                partial: result.partial,
            };
        },
    };
};

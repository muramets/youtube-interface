// =============================================================================
// Gemini Provider Factory — Creates AiProvider instances for Gemini models
//
// Implements the AiProvider interface by delegating to the existing
// streamChat function. Handles mapping between provider-agnostic types
// and Gemini-specific formats.
//
// Usage:
//   const provider = geminiFactory({ apiKey: 'AIza...' });
//   const result = await provider.streamChat(opts);
// =============================================================================

import type { AiProvider, ProviderFactory, ProviderStreamOpts, StreamResult } from "../ai/types.js";
import type { GeminiProviderContext } from "./context.js";
import type { StreamChatOpts } from "./streamChat.js";
import { streamChat } from "./streamChat.js";

/**
 * Factory that creates a Gemini AiProvider from configuration.
 *
 * Required config:
 *   - `apiKey` (string): Gemini API key
 */
export const geminiFactory: ProviderFactory = (config: Record<string, unknown>): AiProvider => {
    const apiKey = config.apiKey;
    if (!apiKey || typeof apiKey !== "string") {
        throw new Error(
            "[geminiFactory] Missing or invalid `apiKey` in config. " +
            "Provide a valid Gemini API key.",
        );
    }

    return {
        async streamChat(opts: ProviderStreamOpts): Promise<StreamResult> {
            // Unpack Gemini-specific context (if provided)
            const geminiCtx = (opts.providerContext ?? {}) as GeminiProviderContext;

            // Map provider-agnostic opts → Gemini-specific StreamChatOpts
            const geminiOpts: StreamChatOpts = {
                apiKey,
                model: opts.model,
                systemPrompt: opts.systemPrompt,
                history: opts.history,
                text: opts.text,
                thumbnailUrls: opts.imageUrls,
                thumbnailCache: geminiCtx.thumbnailCache,
                onChunk: opts.callbacks.onChunk,
                onToolCall: opts.callbacks.onToolCall,
                onToolResult: opts.callbacks.onToolResult,
                onThought: opts.callbacks.onThought,
                onToolProgress: opts.callbacks.onToolProgress,
                onRetry: opts.callbacks.onRetry,
                signal: opts.signal,
                toolContext: opts.toolContext,
                thinkingOptionId: opts.thinkingOptionId,
                // Gemini-specific context fields
                largePayloadApproved: geminiCtx.largePayloadApproved,
                onAttachmentUpdate: geminiCtx.onAttachmentUpdate,
                onLargePayloadBlocked: geminiCtx.onLargePayloadBlocked,
                // Cache state fields
                cacheState: geminiCtx.cacheState,
                onCacheUpdate: geminiCtx.onCacheUpdate,
            };

            // Current-message attachments: prefer pre-uploaded Gemini refs (fast),
            // fall back to generic AttachmentRef from opts (requires server-side upload).
            if (geminiCtx.currentMessageGeminiRefs?.length) {
                geminiOpts.attachments = geminiCtx.currentMessageGeminiRefs;
            } else if (opts.attachments?.length) {
                // Fallback: upload from Storage URL to Gemini Files API on the server.
                // This path is used when switching from Claude→Gemini with existing
                // attachments that were never uploaded to Gemini.
                const { reuploadFromStorage } = await import("./fileUpload.js");
                geminiOpts.attachments = await Promise.all(
                    opts.attachments.map(async att => {
                        const result = await reuploadFromStorage(apiKey, att.url, att.mimeType, att.name);
                        return { geminiFileUri: result.uri, mimeType: att.mimeType };
                    }),
                );
            }

            const result = await streamChat(geminiOpts);

            // Map Gemini result → provider-agnostic StreamResult
            return {
                text: result.text,
                tokenUsage: result.tokenUsage,
                normalizedUsage: result.normalizedUsage,
                toolCalls: result.toolCalls,
                providerMeta: result.updatedThumbnailCache
                    ? { updatedThumbnailCache: result.updatedThumbnailCache }
                    : undefined,
                agenticImages: result.agenticImages,
                partial: result.partial,
            };
        },
    };
};

// =============================================================================
// Send Slice — message sending, editing, retry, enrichment flow
//
// All send-flow helpers (persistUserMessage, streamAiResponse, maybeAutoTitle,
// resumeSendFlow) live here as module-level functions — they are not exported,
// keeping the internal complexity fully encapsulated.
// =============================================================================

import { Timestamp } from 'firebase/firestore';
import { ChatService } from '../../../services/ai/chatService';
import { AiService } from '../../../services/ai/aiService';
import { prepareContext } from '../../../ai/pipeline/prepareContext';
import { extractThumbnails } from '../../../ai/pipeline/extractThumbnails';
import { debugSendLog } from '../../../ai/pipeline/debugSendLog';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../../../types/appContext';
import { buildSystemPrompt } from '../../../ai/systemPrompt';
import { useAppContextStore, selectAllItems } from '../../appContextStore';
import { useChannelStore } from '../../channelStore';
import { KnowledgeCategoryService } from '../../../services/knowledge/knowledgeCategoryService';
import type { ChannelMetadata } from '../../../types/appContext';
import type { KnowledgeCategoryEntry } from '../../../types/knowledge';
import { debug } from '../../../utils/debug';
import type { ChatMessage, ToolCallRecord, TokenUsage, NormalizedTokenUsage } from '../../../types/chat/chat';
import type { ReadyAttachment } from '../../../types/chat/chatAttachment';
import type { AppContextItem } from '../../../types/appContext';
import type { ChatState, ActiveToolCall } from '../types';
import { session, startStreamingSession, cacheSessionThinking } from '../session';
import { requireContext, resolveModel, rebuildPersistedContext } from '../helpers';
import { setFrozenConversationId } from './navigationSlice';

// =============================================================================
// Internal flow helpers (not exported)
// =============================================================================

/** Optimistic UI + Firestore persist for user message. */
async function persistUserMessage(
    userId: string, channelId: string, convId: string,
    text: string, attachments: ReadyAttachment[] | undefined,
    appContext: AppContextItem[] | undefined,
    mentionedVideos: ChatMessage['mentionedVideos'],
    currentMessages: ChatMessage[],
    set: (partial: Partial<ChatState>) => void,
): Promise<string> {
    const optimisticMsg: ChatMessage = {
        id: `optimistic-${crypto.randomUUID()}`,
        role: 'user',
        text,
        attachments,
        appContext,
        mentionedVideos,
        createdAt: Timestamp.now(),
    };
    set({ messages: [...currentMessages, optimisticMsg] });
    const persisted = await ChatService.addMessage(userId, channelId, convId, { role: 'user', text, attachments, appContext, mentionedVideos });
    return persisted.id;
}

async function streamAiResponse(
    channelId: string, convId: string,
    model: string, systemPrompt: string | undefined,
    text: string, attachments: ReadyAttachment[] | undefined,
    thumbnailUrls: string[] | undefined,
    contextMeta: { videoCards?: number; trafficSources?: number; canvasNodes?: number; totalItems?: number } | undefined,
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
    signal?: AbortSignal,
    thinkingOptionId?: string | null,
    largePayloadApproved?: boolean,
    onConfirmLargePayload?: (count: number) => void,
    onRetry?: (attempt: number) => void,
    systemLayers?: { settings: number; persistentContext: number; crossMemory: number },
    isConclude?: boolean,
): Promise<{ text: string; tokenUsage?: TokenUsage; normalizedUsage?: NormalizedTokenUsage; toolCalls?: ToolCallRecord[]; usedSummary?: boolean; contextBreakdown?: import('../../../../../shared/models').ContextBreakdown; messageId?: string }> {
    return AiService.sendMessage({
        channelId,
        conversationId: convId,
        model,
        systemPrompt,
        systemLayers,
        text,
        attachments: attachments?.map(a => ({
            type: a.type,
            url: a.url,
            name: a.name,
            mimeType: a.mimeType,
            fileRef: a.fileRef,
            width: a.width,
            height: a.height,
        })),
        thumbnailUrls,
        contextMeta,
        thinkingOptionId: thinkingOptionId || undefined,
        onStream: (chunk) => set({ streamingText: chunk }),
        onToolCallStart: (name, toolCallIndex) => {
            const prev = get().activeToolCalls;
            set({ activeToolCalls: [...prev, { name, args: {}, preparing: true, _callIndex: toolCallIndex }] });
        },
        onToolCall: (name, args, toolCallIndex) => {
            const prev = get().activeToolCalls;
            const existing = prev.find((tc: ActiveToolCall) => tc._callIndex === toolCallIndex);
            if (existing) {
                // Update the preparing entry with full args
                set({
                    activeToolCalls: prev.map((tc: ActiveToolCall) =>
                        tc._callIndex === toolCallIndex ? { ...tc, name, args, preparing: false } : tc
                    ),
                });
            } else {
                // Fallback: no toolCallStart received (e.g. Gemini provider)
                set({ activeToolCalls: [...prev, { name, args, _callIndex: toolCallIndex }] });
            }
        },
        onToolResult: (_name, result, toolCallIndex) => {
            const prev = get().activeToolCalls;
            set({
                activeToolCalls: prev.map((tc: ActiveToolCall) =>
                    tc._callIndex === toolCallIndex ? { ...tc, result } : tc
                )
            });
        },
        onToolProgress: (_name, message, toolCallIndex) => {
            const prev = get().activeToolCalls;
            set({
                activeToolCalls: prev.map((tc: ActiveToolCall) =>
                    tc._callIndex === toolCallIndex && !tc.result
                        ? { ...tc, progressMessage: message }
                        : tc
                ),
            });
        },
        onThought: (thought) => {
            if (!session.thinkingStartMs) session.thinkingStartMs = Date.now();
            const prev = get().thinkingText;
            set({ thinkingText: prev + thought });
        },
        onConfirmLargePayload,
        onRetry,
        largePayloadApproved,
        signal,
        isConclude,
    });
}

/** Auto-generate title for the first exchange (fire-and-forget). */
function maybeAutoTitle(
    userId: string, channelId: string, convId: string,
    text: string, model: string, isFirstExchange: boolean,
): void {
    if (!isFirstExchange) return;
    AiService.generateTitle(text, model, channelId, convId)
        .then(title => ChatService.updateConversation(userId, channelId, convId, { title }))
        .catch(() => { });
}

/**
 * Post-enrichment flow — build prompt, stream from Gemini, persist response.
 * Shared by sendMessage (happy path), retryEnrichment (after successful retry),
 * and dismissEnrichment (skip enrichment data).
 */
async function resumeSendFlow(
    get: () => ChatState,
    set: (partial: Partial<ChatState>) => void,
    convId: string,
    text: string,
    attachments: ReadyAttachment[] | undefined,
    appContext: AppContextItem[] | undefined,
    persistedContext: AppContextItem[] | undefined,
    nonce: number,
    abortController: AbortController,
    largePayloadApproved?: boolean,
    isFirstExchange?: boolean,
    isConclude?: boolean,
): Promise<void> {
    const { aiSettings, projects, activeProjectId, messages, memoriesSnapshot: memories } = get();

    // Re-activate streaming UI
    set({ isStreaming: true, streamingText: '' });

    const thumbnailUrls = extractThumbnails(persistedContext ?? appContext);
    const activeConv = get().conversations.find(c => c.id === convId);
    const model = resolveModel(aiSettings, projects, activeProjectId, activeConv?.model, get().pendingModel, activeConv?.projectId);

    // Build channel metadata from channelStore (lightweight — no async)
    const currentChannel = useChannelStore.getState().currentChannel;
    const channelMetadata: ChannelMetadata | undefined = currentChannel
        ? { name: currentChannel.name }
        : undefined;

    // Fetch knowledge categories (small payload, rarely changes)
    const { userId, channelId } = requireContext(get);
    let knowledgeCategories: KnowledgeCategoryEntry[] | undefined;
    try {
        knowledgeCategories = await KnowledgeCategoryService.getCategories(userId, channelId);
    } catch {
        // Non-critical — continue without categories
    }

    const { prompt: systemPrompt, layerSizes: systemLayers } = buildSystemPrompt(
        aiSettings, projects, activeProjectId, persistedContext, memories,
        channelMetadata, knowledgeCategories,
    );

    debugSendLog({ model, aiSettings, projects, activeProjectId, persistedContext, appContext, messages, memories, thumbnailUrls, systemPrompt, channelMetadata, knowledgeCategories });

    const contextMeta = persistedContext ? {
        videoCards: getVideoCards(persistedContext).length,
        trafficSources: getTrafficContexts(persistedContext).length,
        canvasNodes: getCanvasContexts(persistedContext).reduce((sum, cc) => sum + cc.nodes.length, 0),
        totalItems: persistedContext.length,
    } : undefined;

    const scopedSet = (partial: Partial<ChatState>) => {
        if (session.streamingNonce === nonce) set(partial);
    };

    maybeAutoTitle(userId, channelId, convId, text, model, isFirstExchange ?? false);

    const { usedSummary, messageId } = await streamAiResponse(
        channelId, convId, model, systemPrompt,
        text, attachments, thumbnailUrls, contextMeta, scopedSet, get, abortController.signal,
        get().pendingThinkingOptionId,
        largePayloadApproved,
        (count) => scopedSet({ pendingLargePayloadConfirmation: { count, text, attachments, convId, appContext, persistedContext } }),
        (attempt) => scopedSet({ retryAttempt: attempt, streamingText: '', thinkingText: '' }),
        systemLayers,
        isConclude,
    );

    debug.chat(`📝 Layer 3: ${usedSummary ? '✓ summary used (older messages were compressed)' : '— full history (no summarization needed)'}`);

    const finalThinkingText = get().thinkingText;
    if (session.streamingNonce === nonce) set({ isStreaming: false, streamingText: '' });

    // Server persists the AI message — client relies on onSnapshot for delivery.
    // Session thinking cache is a redundancy layer (fallback if onSnapshot is slow).
    if (finalThinkingText && messageId) {
        const thinkingElapsedMs = Date.now() - (session.thinkingStartMs || session.streamStartMs);
        cacheSessionThinking(messageId, {
            text: finalThinkingText,
            elapsedMs: thinkingElapsedMs,
        });
    }

}

// =============================================================================
// Slice factory
// =============================================================================

export function createSendSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'error'
    | 'lastFailedRequest'
    | 'pendingLargePayloadConfirmation'
    | 'clearError'
    | 'sendMessage'
    | 'editMessage'
    | 'retryLastMessage'
    | 'confirmLargePayload'
    | 'dismissLargePayload'
> {
    return {
        // State
        error: null,
        lastFailedRequest: null,
        pendingLargePayloadConfirmation: null,

        // Actions
        clearError: () => set({ error: null }),

        sendMessage: async (text, attachments, conversationId, largePayloadApproved, options) => {
            const { userId, channelId } = requireContext(get);
            const { activeConversationId, pendingConversationId, activeProjectId, messages, aiSettings, projects, isStreaming } = get();
            let convId = conversationId || activeConversationId;

            if (isStreaming || get().isWaitingForServerResponse) return;

            // Lock immediately — before any await — prevents double-send
            const { nonce: myNonce, controller: myAbortController } = startStreamingSession(set);

            let userMessageId: string | undefined;

            try {
                // 0. Lazy-create conversation if needed (first message in a new chat)
                if (!convId) {
                    const { pendingModel } = get();
                    const conversation = await ChatService.createConversation(
                        userId, channelId, activeProjectId, 'New Chat', pendingConversationId ?? undefined,
                    );
                    convId = conversation.id;
                    set({ pendingConversationId: null, pendingModel: null });
                    // Sync frozenForConversationId so returning to this chat (via conversation list)
                    // doesn't refresh memoriesSnapshot and break prompt cache
                    setFrozenConversationId(convId);
                    // Apply pending model to newly created conversation
                    if (pendingModel) {
                        ChatService.updateConversation(userId, channelId, convId, { model: pendingModel });
                    }
                    // Set activeConversationId AFTER we're about to add the optimistic message,
                    // so the subscription won't race with us and reset messages to []
                }

                // 1. Snapshot context + clear input immediately (optimistic UX)
                const rawContextItems = selectAllItems(useAppContextStore.getState());
                const hasContext = rawContextItems.length > 0;
                if (hasContext) useAppContextStore.getState().consumeAll();

                // 2. Optimistic UI — show user message + dots BEFORE enrichment
                const isFirstExchange = messages.length === 0;
                const rawAppContext = hasContext ? rawContextItems : undefined;
                const mentionedVideos = options?.mentionedVideos?.length ? options.mentionedVideos : undefined;
                userMessageId = await persistUserMessage(userId, channelId, convId, text, attachments, rawAppContext, mentionedVideos, messages, set);
                if (!activeConversationId) set({ activeConversationId: convId });

                // 3. Context pipeline: enrich → merge → persist (user sees dots)
                const existingConv = get().conversations.find(c => c.id === convId);
                const existingPersisted = existingConv?.persistedContext ?? [];
                const { appContext, persistedContext } = await prepareContext(
                    rawContextItems, userId, channelId, convId!,
                    existingPersisted,
                );

                // 4. Continue to AI — use backendText for conclude turns (display text already persisted)
                const textForBackend = options?.backendText ?? text;
                await resumeSendFlow(get, set, convId!, textForBackend, attachments, appContext, persistedContext, myNonce, myAbortController, largePayloadApproved, isFirstExchange, options?.isConclude);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    // User stopped generation — preserve partial response as ghost message (session-only, never sent to API)
                    const { streamingText: partial, thinkingText: thinking, activeToolCalls: toolCalls } = get();
                    if (partial || thinking || toolCalls.length > 0) {
                        const elapsed = thinking ? Date.now() - (session.thinkingStartMs || session.streamStartMs) : undefined;
                        set({
                            stoppedResponse: {
                                text: partial,
                                thinking,
                                toolCalls,
                                model: resolveModel(aiSettings, projects, activeProjectId, undefined, undefined),
                                thinkingElapsedMs: elapsed,
                            },
                        });
                    }
                } else {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
                    const isRateLimit = /rate.limit|429/i.test(errorMessage);
                    const isContextOverflow = !isRateLimit && /token|context.*limit|too long|payload size/i.test(errorMessage);
                    const displayMessage = isRateLimit
                        ? 'Rate limit reached. Please wait a minute and try again.'
                        : isContextOverflow
                            ? 'Context window exceeded. Start a new conversation or delete old messages.'
                            : errorMessage;

                    // Only update UI if this stream is still the current one
                    if (session.streamingNonce === myNonce) {
                        set({ error: displayMessage, lastFailedRequest: { text, attachments, messageId: userMessageId, sendOptions: options } });
                    }

                    // Ensure the user stays on the conversation (especially for first-message failures)
                    if (convId && !get().activeConversationId) {
                        set({ activeConversationId: convId });
                    }

                    // Persist error + text to conversation doc so retry survives page reload
                    if (convId) {
                        ChatService.setLastError(userId, channelId, convId, displayMessage, text)
                            .catch(() => { /* best-effort */ });
                    }
                }
            } finally {
                // Only reset UI state if this stream is still the current one
                if (session.activeAbortController === myAbortController) {
                    session.activeAbortController = null;
                }
                if (session.streamingNonce === myNonce) {
                    set({ isStreaming: false, streamingText: '' });
                }
            }
        },

        editMessage: async (newText, attachments, options) => {
            const { editingMessage, activeConversationId, messages } = get();
            if (!editingMessage || !activeConversationId) return;
            const { userId, channelId } = requireContext(get);

            // 1. Optimistic: remove the edited message + everything after it from local state
            const editIdx = messages.findIndex(m => m.id === editingMessage.id);
            const survivingMessages = editIdx > 0 ? messages.slice(0, editIdx) : [];
            set({ messages: survivingMessages, editingMessage: null });

            // 2. Rebuild persistedContext from surviving messages only (prevent ghost context)
            const rebuiltContext = rebuildPersistedContext(survivingMessages);

            // 3. Delete messages + reset context/summary in parallel
            await Promise.all([
                ChatService.deleteMessagesFrom(userId, channelId, activeConversationId, editingMessage.createdAt),
                ChatService.resetForEdit(userId, channelId, activeConversationId, rebuiltContext),
            ]);

            // 4. Send the new version (reuses full sendMessage flow: persist + stream AI)
            await get().sendMessage(newText, attachments, undefined, undefined, options);
        },

        confirmLargePayload: async () => {
            const pending = get().pendingLargePayloadConfirmation;
            if (!pending || get().isStreaming) return;
            const { text, attachments, convId, appContext, persistedContext } = pending;
            set({ pendingLargePayloadConfirmation: null });

            // Re-run the AI call with largePayloadApproved:true — bypasses user message
            // persistence so no duplicate message appears in history.
            const { nonce: myNonce, controller: myAbortController } = startStreamingSession(set);

            try {
                await resumeSendFlow(get, set, convId, text, attachments, appContext, persistedContext, myNonce, myAbortController, true);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    const { streamingText: partial, thinkingText: thinking, activeToolCalls: toolCalls, aiSettings, projects, activeProjectId } = get();
                    if (partial || thinking || toolCalls.length > 0) {
                        const elapsed = thinking ? Date.now() - (session.thinkingStartMs || session.streamStartMs) : undefined;
                        set({ stoppedResponse: { text: partial, thinking, toolCalls, model: resolveModel(aiSettings, projects, activeProjectId, undefined, undefined), thinkingElapsedMs: elapsed } });
                    }
                } else {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
                    if (session.streamingNonce === myNonce) set({ error: errorMessage });
                }
            } finally {
                if (session.activeAbortController === myAbortController) session.activeAbortController = null;
                if (session.streamingNonce === myNonce) set({ isStreaming: false, streamingText: '' });
            }
        },

        dismissLargePayload: () => set({ pendingLargePayloadConfirmation: null }),

        retryLastMessage: async () => {
            const { lastFailedRequest } = get();
            if (!lastFailedRequest) return;
            const { text, attachments, messageId, sendOptions } = lastFailedRequest;
            set({ lastFailedRequest: null, error: null });

            const { userId, channelId } = requireContext(get);
            const convId = get().activeConversationId;
            if (!convId) return;

            // Clear server-side error signal (fire-and-forget — pure metadata, no race risk)
            ChatService.clearLastError(userId, channelId, convId).catch(() => {});

            // The user message already lives in Firestore — do NOT delete/re-add it.
            // Start a new streaming session and re-run only the AI step.
            const { nonce: myNonce, controller: myAbortController } = startStreamingSession(set);

            try {
                const existingConv = get().conversations.find(c => c.id === convId);
                const persistedContext = existingConv?.persistedContext;
                const isFirstExchange = get().messages.length <= 1;

                // For conclude retries: use backendText (CONCLUDE_INSTRUCTION) instead of display text
                const textForBackend = sendOptions?.backendText ?? text;

                await resumeSendFlow(
                    get, set, convId, textForBackend, attachments,
                    undefined,
                    persistedContext?.length ? persistedContext : undefined,
                    myNonce, myAbortController,
                    undefined,
                    isFirstExchange,
                    sendOptions?.isConclude,
                );
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    const { streamingText: partial, thinkingText: thinking, activeToolCalls: toolCalls, aiSettings: s, projects: p, activeProjectId: pid } = get();
                    if (partial || thinking || toolCalls.length > 0) {
                        const elapsed = thinking ? Date.now() - (session.thinkingStartMs || session.streamStartMs) : undefined;
                        set({ stoppedResponse: { text: partial, thinking, toolCalls, model: resolveModel(s, p, pid, undefined, undefined), thinkingElapsedMs: elapsed } });
                    }
                } else {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
                    if (session.streamingNonce === myNonce) {
                        set({ error: errorMessage, lastFailedRequest: { text, attachments, messageId, sendOptions } });
                        ChatService.setLastError(userId, channelId, convId, errorMessage, text).catch(() => {});
                    }
                }
            } finally {
                if (session.activeAbortController === myAbortController) session.activeAbortController = null;
                if (session.streamingNonce === myNonce) set({ isStreaming: false, streamingText: '' });
            }
        },

    };
}

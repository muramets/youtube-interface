// =============================================================================
// Send Slice — message sending, editing, retry, enrichment flow
//
// All send-flow helpers (persistUserMessage, streamAiResponse, persistAiResponse,
// maybeAutoTitle, resumeSendFlow) live here as module-level functions — they are
// not exported, keeping the internal complexity fully encapsulated.
// =============================================================================

import { Timestamp } from 'firebase/firestore';
import { ChatService } from '../../../services/chatService';
import { AiService } from '../../../services/aiService';
import { prepareContext } from '../../../ai/pipeline/prepareContext';
import { extractThumbnails } from '../../../ai/pipeline/extractThumbnails';
import { debugSendLog } from '../../../ai/pipeline/debugSendLog';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../../../types/appContext';
import { buildSystemPrompt } from '../../../ai/systemPrompt';
import { useAppContextStore, selectAllItems } from '../../appContextStore';
import { debug } from '../../../utils/debug';
import type { ChatMessage, ToolCallRecord } from '../../../types/chat';
import type { ReadyAttachment } from '../../../types/chatAttachment';
import type { AppContextItem } from '../../../types/appContext';
import type { ChatState, ActiveToolCall } from '../types';
import { session, startStreamingSession, cacheSessionThinking } from '../session';
import { requireContext, resolveModel, rebuildPersistedContext } from '../helpers';

// =============================================================================
// Internal flow helpers (not exported)
// =============================================================================

/** Optimistic UI + Firestore persist for user message. */
async function persistUserMessage(
    userId: string, channelId: string, convId: string,
    text: string, attachments: ReadyAttachment[] | undefined,
    appContext: AppContextItem[] | undefined,
    currentMessages: ChatMessage[],
    set: (partial: Partial<ChatState>) => void,
): Promise<string> {
    const optimisticMsg: ChatMessage = {
        id: `optimistic-${crypto.randomUUID()}`,
        role: 'user',
        text,
        attachments,
        appContext,
        createdAt: Timestamp.now(),
    };
    set({ messages: [...currentMessages, optimisticMsg] });
    const persisted = await ChatService.addMessage(userId, channelId, convId, { role: 'user', text, attachments, appContext });
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
): Promise<{ text: string; tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }; toolCalls?: ToolCallRecord[]; usedSummary?: boolean }> {
    return AiService.sendMessage({
        channelId,
        conversationId: convId,
        model,
        systemPrompt,
        text,
        attachments: attachments?.map(a => ({
            type: a.type,
            url: a.url,
            name: a.name,
            mimeType: a.mimeType,
            fileRef: a.fileRef,
        })),
        thumbnailUrls,
        contextMeta,
        thinkingOptionId: thinkingOptionId || undefined,
        onStream: (chunk) => set({ streamingText: chunk }),
        onToolCall: (name, args, toolCallIndex) => {
            const prev = get().activeToolCalls;
            set({ activeToolCalls: [...prev, { name, args, _callIndex: toolCallIndex }] });
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
            const prev = get().thinkingText;
            set({ thinkingText: prev + thought });
        },
        onConfirmLargePayload,
        onRetry,
        largePayloadApproved,
        signal,
    });
}

/** Persist model response to Firestore. */
async function persistAiResponse(
    userId: string, channelId: string, convId: string,
    responseText: string, model: string,
    tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number },
    toolCalls?: ToolCallRecord[],
): Promise<void> {
    await ChatService.addMessage(userId, channelId, convId, { role: 'model', text: responseText, model, tokenUsage, toolCalls });
}

/** Auto-generate title for the first exchange (fire-and-forget). */
function maybeAutoTitle(
    userId: string, channelId: string, convId: string,
    text: string, model: string, isFirstExchange: boolean,
): void {
    if (!isFirstExchange) return;
    AiService.generateTitle(text, model)
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
): Promise<void> {
    const { aiSettings, projects, activeProjectId, messages, memories } = get();

    // Re-activate streaming UI
    set({ isStreaming: true, streamingText: '' });

    const thumbnailUrls = extractThumbnails(persistedContext ?? appContext);
    const activeConv = get().conversations.find(c => c.id === convId);
    const model = resolveModel(aiSettings, projects, activeProjectId, activeConv?.model, get().pendingModel);
    const systemPrompt = buildSystemPrompt(aiSettings, projects, activeProjectId, persistedContext, memories);

    debugSendLog({ model, aiSettings, projects, activeProjectId, persistedContext, appContext, messages, memories, thumbnailUrls, systemPrompt });

    const contextMeta = persistedContext ? {
        videoCards: getVideoCards(persistedContext).length,
        trafficSources: getTrafficContexts(persistedContext).length,
        canvasNodes: getCanvasContexts(persistedContext).reduce((sum, cc) => sum + cc.nodes.length, 0),
        totalItems: persistedContext.length,
    } : undefined;

    const { userId, channelId } = requireContext(get);
    const scopedSet = (partial: Partial<ChatState>) => {
        if (session.streamingNonce === nonce) set(partial);
    };

    const { text: responseText, tokenUsage, toolCalls, usedSummary } = await streamAiResponse(
        channelId, convId, model, systemPrompt,
        text, attachments, thumbnailUrls, contextMeta, scopedSet, get, abortController.signal,
        get().pendingThinkingOptionId,
        largePayloadApproved,
        (count) => scopedSet({ pendingLargePayloadConfirmation: { count, text, attachments, convId, appContext, persistedContext } }),
        (attempt) => scopedSet({ retryAttempt: attempt, streamingText: '', thinkingText: '' }),
    );

    debug.chat(`📝 Layer 3: ${usedSummary ? '✓ summary used (older messages were compressed)' : '— full history (no summarization needed)'}`);

    const finalThinkingText = get().thinkingText;
    if (session.streamingNonce === nonce) set({ isStreaming: false, streamingText: '' });

    await persistAiResponse(userId, channelId, convId, responseText, model, tokenUsage, toolCalls);

    if (finalThinkingText) {
        const msgs = get().messages;
        const lastModel = [...msgs].reverse().find(m => m.role === 'model');
        if (lastModel) {
            cacheSessionThinking(lastModel.id, {
                text: finalThinkingText,
                elapsedMs: Date.now() - session.streamStartMs,
            });
        }
    }

    maybeAutoTitle(userId, channelId, convId, text, model, isFirstExchange ?? false);
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

        sendMessage: async (text, attachments, conversationId, largePayloadApproved) => {
            const { userId, channelId } = requireContext(get);
            const { activeConversationId, pendingConversationId, activeProjectId, messages, aiSettings, projects, isStreaming } = get();
            let convId = conversationId || activeConversationId;

            if (isStreaming) return;

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
                userMessageId = await persistUserMessage(userId, channelId, convId, text, attachments, rawAppContext, messages, set);
                if (!activeConversationId) set({ activeConversationId: convId });

                // 3. Context pipeline: enrich → merge → persist (user sees dots)
                const existingConv = get().conversations.find(c => c.id === convId);
                const existingPersisted = existingConv?.persistedContext ?? [];
                const { appContext, persistedContext } = await prepareContext(
                    rawContextItems, userId, channelId, convId!,
                    existingPersisted,
                );

                // 4. Continue to Gemini
                await resumeSendFlow(get, set, convId!, text, attachments, appContext, persistedContext, myNonce, myAbortController, largePayloadApproved, isFirstExchange);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    // User stopped generation — save partial text if available
                    const partial = get().streamingText;
                    if (partial) {
                        await ChatService.addMessage(userId, channelId, convId!, {
                            role: 'model',
                            text: partial + '\n\n*(generation stopped)*',
                            model: resolveModel(aiSettings, projects, activeProjectId, undefined, undefined),
                        });
                    }
                } else {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
                    const isContextOverflow = /token|context.*limit|too long|payload size/i.test(errorMessage);
                    const displayMessage = isContextOverflow
                        ? 'Context window exceeded. Start a new conversation or delete old messages.'
                        : errorMessage;

                    // Only update UI if this stream is still the current one
                    if (session.streamingNonce === myNonce) {
                        set({ error: displayMessage, lastFailedRequest: { text, attachments, messageId: userMessageId } });
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

        editMessage: async (newText, attachments) => {
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
            await get().sendMessage(newText, attachments);
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
                if (!(err instanceof DOMException && err.name === 'AbortError')) {
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
            const { text, attachments, messageId } = lastFailedRequest;
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

                await resumeSendFlow(
                    get, set, convId, text, attachments,
                    undefined,
                    persistedContext?.length ? persistedContext : undefined,
                    myNonce, myAbortController,
                    undefined,
                    isFirstExchange,
                );
            } catch (err) {
                if (!(err instanceof DOMException && err.name === 'AbortError')) {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
                    if (session.streamingNonce === myNonce) {
                        set({ error: errorMessage, lastFailedRequest: { text, attachments, messageId } });
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

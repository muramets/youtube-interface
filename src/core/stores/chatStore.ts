// =============================================================================
// Chat Store (Zustand) — client-side state for the AI chat panel.
//
// Session-only thinking cache: thinkingText survives streaming end but
// clears on page reload. Keyed by conversationId → thinkingText.
// =============================================================================

import { create } from 'zustand';
import type {
    ChatProject,
    ChatConversation,
    ChatMessage,
    AiAssistantSettings,
    ChatView,
    ConversationMemory,
    ToolCallRecord,
} from '../types/chat';

/** Transient tool call entry tracked during streaming — extends ToolCallRecord with optional progress. */
interface ActiveToolCall extends ToolCallRecord {
    progressMessage?: string;
    /** Unique index assigned per tool call within a streaming response — used for precise matching. */
    _callIndex: number;
}
import { DEFAULT_AI_SETTINGS } from '../types/chat';
import { ChatService, MESSAGE_PAGE_SIZE, CONVERSATION_PAGE_SIZE } from '../services/chatService';
import { AiService } from '../services/aiService';
import * as AiProxy from '../services/aiProxyService';
import type { ReadyAttachment } from '../types/chatAttachment';
import type { AppContextItem } from '../types/appContext';
import { getVideoCards, getTrafficContexts, getCanvasContexts, mergeContextItems } from '../types/appContext';
import { prepareContext } from '../ai/pipeline/prepareContext';
import { extractThumbnails } from '../ai/pipeline/extractThumbnails';
import { debugSendLog } from '../ai/pipeline/debugSendLog';
import { useAppContextStore, selectAllItems } from './appContextStore';
import { Timestamp } from 'firebase/firestore';
import { debug } from '../utils/debug';
import { buildSystemPrompt } from '../ai/systemPrompt';

// --- Session-only thinking cache (ephemeral, clears on page reload) ---
// Keyed by messageId → { text, elapsedMs }. Populated after AI response is persisted.
interface SessionThinkingEntry { text: string; elapsedMs: number; }
const sessionThinkingCache = new Map<string, SessionThinkingEntry>();

/** Get cached thinking data for a specific message (session-only, not persisted). */
export function getSessionThinking(messageId: string): SessionThinkingEntry | null {
    return sessionThinkingCache.get(messageId) ?? null;
}

/** Timestamp when the current streaming response started (for thinking elapsed calc). */
let streamStartMs = 0;

interface ChatState {
    // Context (set once via setContext)
    userId: string | null;
    channelId: string | null;

    // Data
    projects: ChatProject[];
    conversations: ChatConversation[];
    messages: ChatMessage[];
    aiSettings: AiAssistantSettings;
    memories: ConversationMemory[];

    // UI state
    isOpen: boolean;
    view: ChatView;
    activeProjectId: string | null;
    activeConversationId: string | null;
    pendingConversationId: string | null;
    isLoading: boolean;
    isStreaming: boolean;
    streamingText: string;
    activeToolCalls: ActiveToolCall[]; // tool calls in current streaming response (transient)
    thinkingText: string; // thinking text in current streaming response (transient)
    error: string | null;
    hasMoreMessages: boolean;
    hasMoreConversations: boolean;
    lastFailedRequest: { text: string; attachments?: ReadyAttachment[]; messageId?: string } | null;
    enrichmentWarning: EnrichmentWarning | null;
    pendingModel: string | null; // model override for not-yet-created conversations
    pendingThinkingOptionId: string | null; // thinking depth override (resets on model change)
    editingMessage: ChatMessage | null; // message being edited (user clicks pencil)
    referenceSelectionMode: { active: boolean; messageId: string | null; originalNum: string | null }; // Tier 3: Manual override selection state

    // Actions — Context
    setContext: (userId: string | null, channelId: string | null) => void;

    // Actions — UI
    toggleOpen: () => void;
    setOpen: (open: boolean) => void;
    setView: (view: ChatView) => void;
    setActiveProject: (id: string | null) => void;
    setActiveConversation: (id: string | null) => void;
    clearError: () => void;

    // Actions — Subscriptions
    subscribeToProjects: () => () => void;
    subscribeToConversations: () => () => void;
    subscribeToMessages: (conversationId: string) => () => void;
    subscribeToAiSettings: () => () => void;
    subscribeToMemories: () => () => void;
    loadOlderMessages: () => Promise<void>;
    loadOlderConversations: () => Promise<void>;

    // Actions — CRUD
    createProject: (name: string) => Promise<ChatProject>;
    updateProject: (projectId: string, updates: Partial<Pick<ChatProject, 'name' | 'systemPrompt' | 'model' | 'order'>>) => Promise<void>;
    deleteProject: (projectId: string) => Promise<void>;
    startNewChat: () => void;
    createConversation: (projectId: string | null) => Promise<ChatConversation>;
    deleteConversation: (conversationId: string) => Promise<void>;
    renameConversation: (conversationId: string, title: string) => Promise<void>;
    moveConversation: (conversationId: string, projectId: string | null) => Promise<void>;
    setConversationModel: (conversationId: string, model: string) => Promise<void>;
    setPendingModel: (model: string | null) => void;
    setPendingThinkingOptionId: (level: string | null) => void;
    clearPersistedContext: (conversationId: string) => Promise<void>;
    updatePersistedContext: (conversationId: string, items: AppContextItem[]) => Promise<void>;

    // Actions — AI
    sendMessage: (text: string, attachments?: ReadyAttachment[], conversationId?: string) => Promise<void>;
    retryLastMessage: () => Promise<void>;
    retryEnrichment: () => Promise<void>;
    dismissEnrichment: () => Promise<void>;
    stopGeneration: () => void;
    saveAiSettings: (settings: Partial<AiAssistantSettings>) => Promise<void>;
    memorizeConversation: (guidance?: string) => Promise<{ memoryId: string; content: string }>;
    updateMemory: (memoryId: string, content: string) => Promise<void>;
    deleteMemory: (memoryId: string) => Promise<void>;

    // Actions — Edit
    setEditingMessage: (msg: ChatMessage | null) => void;
    editMessage: (newText: string, attachments?: ReadyAttachment[]) => Promise<void>;

    // Actions — Tier 3 Override
    startReferenceSelection: (messageId: string, num: string) => void;
    cancelReferenceSelection: () => void;
    saveReferenceOverride: (messageId: string, originalNum: string, newReferenceKey: string) => Promise<void>;
}

/** Pending send data — stashed when enrichment fails so retry/dismiss can resume. */
interface PendingSend {
    text: string;
    attachments: ReadyAttachment[] | undefined;
    convId: string;
    rawContextItems: AppContextItem[];
    existingPersisted: AppContextItem[];
    nonce: number;
    abortController: AbortController;
}

/** Warning shown when traffic sources enrichment fails. */
interface EnrichmentWarning {
    message: string;
    failedVideos: string[];
    pendingSend: PendingSend;
}

// AbortController lives outside Zustand (non-serializable)
let activeAbortController: AbortController | null = null;

// Generation nonce — scopes streaming UI updates to a specific sendMessage call.
// When the user switches conversations mid-stream, we increment this so that
// the old stream's callbacks become no-ops (UI-only; the stream itself finishes).
let streamingNonce = 0;

/** Helper: get context or throw */
function requireContext(get: () => ChatState): { userId: string; channelId: string } {
    const { userId, channelId } = get();
    if (!userId || !channelId) throw new Error('Chat context not set. Call setContext first.');
    return { userId, channelId };
}

// =============================================================================
// Pure helpers (individually testable)
// =============================================================================

/** Resolve model from pendingModel → conversation → project → global → fallback. */
function resolveModel(
    aiSettings: AiAssistantSettings,
    projects: ChatProject[],
    activeProjectId: string | null,
    conversationModel?: string,
    pendingModel?: string | null,
): string {
    if (pendingModel) return pendingModel;
    if (conversationModel) return conversationModel;
    const project = projects.find(p => p.id === activeProjectId);
    return project?.model || aiSettings.defaultModel;
}

/**
 * Merge incoming context items into an existing set, deduplicating by type + key.
 * Pure function — used by both sendMessage (append new) and editMessage (rebuild).
 */
// mergeContextItems → moved to core/types/appContext.ts (shared with pipeline)

/** Rebuild persistedContext from surviving messages' appContext fields. */
function rebuildPersistedContext(survivingMessages: ChatMessage[]): AppContextItem[] {
    let result: AppContextItem[] = [];
    for (const msg of survivingMessages) {
        if (msg.appContext && msg.appContext.length > 0) {
            result = mergeContextItems(result, msg.appContext);
        }
    }
    return result;
}

/** Optimistic UI + Firestore persist for user message. */
async function persistUserMessage(
    userId: string, channelId: string, convId: string,
    text: string, attachments: ReadyAttachment[] | undefined,
    appContext: AppContextItem[] | undefined,
    currentMessages: ChatMessage[],
    set: (partial: Partial<ChatState>) => void,
): Promise<void> {
    const optimisticMsg: ChatMessage = {
        id: `optimistic-${crypto.randomUUID()}`,
        role: 'user',
        text,
        attachments,
        appContext,
        createdAt: Timestamp.now(),
    };
    set({ messages: [...currentMessages, optimisticMsg] });
    await ChatService.addMessage(userId, channelId, convId, { role: 'user', text, attachments, appContext });
}

async function streamAiResponse(
    channelId: string, convId: string,
    model: string, systemPrompt: string | undefined,
    text: string, attachments: ReadyAttachment[] | undefined,
    thumbnailUrls: string[] | undefined,
    contextMeta: { videoCards?: number; trafficSources?: number; canvasNodes?: number; totalItems?: number } | undefined,
    set: (partial: Partial<ChatState>) => void,
    signal?: AbortSignal,
    thinkingOptionId?: string | null,
): Promise<{ text: string; tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }; toolCalls?: ToolCallRecord[]; usedSummary?: boolean }> {
    return AiService.sendMessage({
        channelId,
        conversationId: convId,
        model,
        systemPrompt,
        text,
        attachments: attachments?.map(a => ({ geminiFileUri: a.geminiFileUri!, mimeType: a.mimeType })),
        thumbnailUrls,
        contextMeta,
        thinkingOptionId: thinkingOptionId || undefined,
        onStream: (chunk) => set({ streamingText: chunk }),
        onToolCall: (name, args, toolCallIndex) => {
            const prev = useChatStore.getState().activeToolCalls;
            set({ activeToolCalls: [...prev, { name, args, _callIndex: toolCallIndex }] });
        },
        onToolResult: (_name, result, toolCallIndex) => {
            const prev = useChatStore.getState().activeToolCalls;
            set({
                activeToolCalls: prev.map(tc =>
                    tc._callIndex === toolCallIndex ? { ...tc, result } : tc
                )
            });
        },
        onToolProgress: (_name, message, toolCallIndex) => {
            const prev = useChatStore.getState().activeToolCalls;
            set({
                activeToolCalls: prev.map(tc =>
                    tc._callIndex === toolCallIndex && !tc.result
                        ? { ...tc, progressMessage: message }
                        : tc
                ),
            });
        },
        onThought: (thought) => {
            const prev = useChatStore.getState().thinkingText;
            set({ thinkingText: prev + thought });
        },
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
): Promise<void> {
    const { aiSettings, projects, activeProjectId, messages, memories } = get();

    // Re-activate streaming UI (may have been paused by enrichment warning)
    set({ isStreaming: true, streamingText: '', enrichmentWarning: null });

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
        if (streamingNonce === nonce) set(partial);
    };

    const { text: responseText, tokenUsage, toolCalls, usedSummary } = await streamAiResponse(
        channelId, convId, model, systemPrompt,
        text, attachments, thumbnailUrls, contextMeta, scopedSet, abortController.signal,
        get().pendingThinkingOptionId,
    );

    debug.chat(`📝 Layer 3: ${usedSummary ? '✓ summary used (older messages were compressed)' : '— full history (no summarization needed)'}`);

    const finalThinkingText = get().thinkingText;
    if (streamingNonce === nonce) set({ isStreaming: false, streamingText: '' });

    await persistAiResponse(userId, channelId, convId, responseText, model, tokenUsage, toolCalls);

    if (finalThinkingText) {
        const msgs = get().messages;
        const lastModel = [...msgs].reverse().find(m => m.role === 'model');
        if (lastModel) {
            sessionThinkingCache.set(lastModel.id, {
                text: finalThinkingText,
                elapsedMs: Date.now() - streamStartMs,
            });
        }
    }

    maybeAutoTitle(userId, channelId, convId, text, model, messages.length === 0);
}

export const useChatStore = create<ChatState>((set, get) => ({
    // Initial state
    userId: null,
    channelId: null,

    projects: [],
    conversations: [],
    messages: [],
    aiSettings: DEFAULT_AI_SETTINGS,
    memories: [],

    isOpen: false,
    view: 'conversations',
    activeProjectId: null,
    activeConversationId: null,
    pendingConversationId: null,
    isLoading: false,
    isStreaming: false,
    streamingText: '',
    activeToolCalls: [],
    thinkingText: '',
    error: null,
    hasMoreMessages: false,
    hasMoreConversations: false,
    lastFailedRequest: null,
    enrichmentWarning: null,
    pendingModel: null,
    pendingThinkingOptionId: null,
    editingMessage: null,
    referenceSelectionMode: { active: false, messageId: null, originalNum: null },

    // --- Context ---
    setContext: (userId, channelId) => set({ userId, channelId }),

    // --- UI Actions ---

    toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
    setOpen: (open) => set({ isOpen: open }),

    setView: (view) => set({ view }),

    setActiveProject: (id) => set({ activeProjectId: id, view: 'conversations' }),

    setActiveConversation: (id) => {
        // Invalidate any running stream's UI callbacks (stream itself keeps running)
        streamingNonce++;
        set({
            activeConversationId: id,
            pendingConversationId: null,
            pendingModel: null,
            pendingThinkingOptionId: null,
            view: id ? 'chat' : 'conversations',
            messages: [],
            isStreaming: false,
            streamingText: '',
            activeToolCalls: [],
            thinkingText: '',
            error: null,
            hasMoreMessages: false,
        });
    },

    clearError: () => set({ error: null }),

    // --- Subscriptions ---

    subscribeToProjects: () => {
        const { userId, channelId } = requireContext(get);
        return ChatService.subscribeToProjects(userId, channelId, (projects) => {
            set({ projects });
        });
    },

    subscribeToConversations: () => {
        const { userId, channelId } = requireContext(get);
        return ChatService.subscribeToConversations(userId, channelId, (conversations) => {
            // subscribeToCollection returns asc order; reverse to show newest first
            const sorted = [...conversations].reverse();
            set({
                conversations: sorted,
                hasMoreConversations: conversations.length >= CONVERSATION_PAGE_SIZE,
            });
        });
    },

    subscribeToMessages: (conversationId) => {
        const { userId, channelId } = requireContext(get);
        set({ messages: [], isLoading: true, hasMoreMessages: false });
        let isFirstLoad = true;
        return ChatService.subscribeToMessages(userId, channelId, conversationId, (firestoreMessages) => {
            // Reconcile: keep optimistic messages only if Firestore hasn't confirmed them yet.
            // Firestore assigns new IDs, so we match by role+text to detect confirmed optimistic messages.
            const firestoreUserTexts = new Set(
                firestoreMessages.filter(m => m.role === 'user').map(m => m.text)
            );
            const pendingOptimistic = get().messages.filter(
                m => m.id.startsWith('optimistic-') && !firestoreUserTexts.has(m.text)
            );
            const merged = [...firestoreMessages, ...pendingOptimistic];

            if (isFirstLoad) {
                isFirstLoad = false;

                // Check for explicit server-side error signal on the conversation
                const conv = get().conversations.find(c => c.id === conversationId);
                if (conv?.lastError && !get().isStreaming) {
                    set({
                        messages: merged,
                        isLoading: false,
                        hasMoreMessages: firestoreMessages.length >= MESSAGE_PAGE_SIZE,
                        error: conv.lastError.error,
                        lastFailedRequest: { text: conv.lastError.failedText || '', messageId: conv.lastError.messageId },
                    });
                } else {
                    set({
                        messages: merged,
                        isLoading: false,
                        hasMoreMessages: firestoreMessages.length >= MESSAGE_PAGE_SIZE,
                    });
                }
            } else {
                set({ messages: merged, isLoading: false });
            }
        });
    },

    subscribeToAiSettings: () => {
        const { userId, channelId } = requireContext(get);
        return ChatService.subscribeToAiSettings(userId, channelId, (aiSettings) => {
            set({ aiSettings });
        });
    },

    subscribeToMemories: () => {
        const { userId, channelId } = requireContext(get);
        return ChatService.subscribeToMemories(userId, channelId, (memories) => {
            set({ memories });
        });
    },

    loadOlderMessages: async () => {
        const { userId, channelId } = requireContext(get);
        const { activeConversationId, messages, hasMoreMessages } = get();
        if (!activeConversationId || !hasMoreMessages || messages.length === 0) return;

        const oldest = messages[0];
        const older = await ChatService.getOlderMessages(
            userId, channelId, activeConversationId, oldest.createdAt
        );

        if (older.length > 0) {
            set({
                messages: [...older, ...messages],
                hasMoreMessages: older.length >= MESSAGE_PAGE_SIZE,
            });
        } else {
            set({ hasMoreMessages: false });
        }
    },

    loadOlderConversations: async () => {
        const { userId, channelId } = requireContext(get);
        const { conversations, hasMoreConversations } = get();
        if (!hasMoreConversations || conversations.length === 0) return;

        // Oldest conversation is last in the desc-sorted array
        const oldest = conversations[conversations.length - 1];
        const older = await ChatService.getOlderConversations(
            userId, channelId, oldest.updatedAt
        );

        if (older.length > 0) {
            // older comes back asc; reverse to desc, then append
            const olderDesc = [...older].reverse();
            set({
                conversations: [...conversations, ...olderDesc],
                hasMoreConversations: older.length >= CONVERSATION_PAGE_SIZE,
            });
        } else {
            set({ hasMoreConversations: false });
        }
    },

    // --- CRUD ---

    createProject: async (name) => {
        const { userId, channelId } = requireContext(get);
        const { projects } = get();
        const order = projects.length;
        return ChatService.createProject(userId, channelId, name, order);
    },

    updateProject: async (projectId, updates) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.updateProject(userId, channelId, projectId, updates);
    },

    deleteProject: async (projectId) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.deleteProject(userId, channelId, projectId);
        const { activeProjectId } = get();
        if (activeProjectId === projectId) {
            set({ activeProjectId: null });
        }
    },

    startNewChat: () => {
        // Invalidate any running stream's UI callbacks (stream itself keeps running)
        streamingNonce++;
        set({
            activeConversationId: null,
            pendingConversationId: crypto.randomUUID(),
            pendingModel: null,
            pendingThinkingOptionId: null,
            view: 'chat',
            messages: [],
            isStreaming: false,
            streamingText: '',
        });
    },

    createConversation: async (projectId) => {
        const { userId, channelId } = requireContext(get);
        const conversation = await ChatService.createConversation(userId, channelId, projectId);
        set({
            activeConversationId: conversation.id,
            view: 'chat',
            messages: [],
            streamingText: '',
        });
        return conversation;
    },

    clearPersistedContext: async (conversationId) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.clearPersistedContext(userId, channelId, conversationId);
    },

    updatePersistedContext: async (conversationId, items) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.updateConversation(userId, channelId, conversationId, { persistedContext: items });
    },

    deleteConversation: async (conversationId) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.deleteConversation(userId, channelId, conversationId);
        const { activeConversationId } = get();
        if (activeConversationId === conversationId) {
            set({ activeConversationId: null, view: 'conversations' });
        }
    },

    renameConversation: async (conversationId, title) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.updateConversation(userId, channelId, conversationId, { title });
    },

    moveConversation: async (conversationId, projectId) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.updateConversation(userId, channelId, conversationId, { projectId });
    },

    setConversationModel: async (conversationId, model) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.updateConversation(userId, channelId, conversationId, { model });
    },

    setPendingModel: (model) => set({ pendingModel: model, pendingThinkingOptionId: null }),
    setPendingThinkingOptionId: (level) => set({ pendingThinkingOptionId: level }),

    // --- Edit ---

    setEditingMessage: (msg) => set({ editingMessage: msg }),

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

    // --- Tier 3 Override ---

    startReferenceSelection: (messageId, num) => {
        set({ referenceSelectionMode: { active: true, messageId, originalNum: num } });
    },

    cancelReferenceSelection: () => {
        set({ referenceSelectionMode: { active: false, messageId: null, originalNum: null } });
    },

    saveReferenceOverride: async (messageId, originalNum, newReferenceKey) => {
        const { userId, channelId } = requireContext(get);
        const { activeConversationId, messages } = get();
        if (!activeConversationId) return;

        // 1. Optimistic UI update
        const updatedMessages = messages.map(m => {
            if (m.id === messageId) {
                return {
                    ...m,
                    overrides: { ...(m.overrides || {}), [originalNum]: newReferenceKey }
                };
            }
            return m;
        });

        set({
            messages: updatedMessages,
            referenceSelectionMode: { active: false, messageId: null, originalNum: null }
        });

        // 2. Persist to Firestore
        const msgToUpdate = messages.find(m => m.id === messageId);
        if (msgToUpdate) {
            const newOverrides = { ...(msgToUpdate.overrides || {}), [originalNum]: newReferenceKey };
            await ChatService.updateMessage(userId, channelId, activeConversationId, messageId, { overrides: newOverrides });
        }
    },

    // --- AI ---

    sendMessage: async (text, attachments, conversationId) => {
        const { userId, channelId } = requireContext(get);
        const { activeConversationId, pendingConversationId, activeProjectId, messages, aiSettings, projects, isStreaming } = get();
        let convId = conversationId || activeConversationId;

        if (isStreaming) return;

        // Lock immediately — before any await — prevents double-send
        const myAbortController = new AbortController();
        activeAbortController = myAbortController;
        const myNonce = ++streamingNonce;
        set({ isStreaming: true, streamingText: '', activeToolCalls: [], thinkingText: '', error: null, lastFailedRequest: null });
        streamStartMs = Date.now();

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
            const rawAppContext = hasContext ? rawContextItems : undefined;
            await persistUserMessage(userId, channelId, convId, text, attachments, rawAppContext, messages, set);
            if (!activeConversationId) set({ activeConversationId: convId });

            // 3. Context pipeline: enrich → merge → persist (user sees dots)
            const existingConv = get().conversations.find(c => c.id === convId);
            const existingPersisted = existingConv?.persistedContext ?? [];
            const { appContext, persistedContext, failedTrafficVideos } = await prepareContext(
                rawContextItems, userId, channelId, convId,
                existingPersisted,
            );

            // 3a. Enrichment failed? → pause and show warning
            if (failedTrafficVideos.length > 0) {
                const pending: PendingSend = {
                    text, attachments, convId, rawContextItems, existingPersisted,
                    nonce: myNonce, abortController: myAbortController,
                };
                set({
                    enrichmentWarning: {
                        message: `Traffic Sources failed to load for: ${failedTrafficVideos.join(', ')}`,
                        failedVideos: failedTrafficVideos,
                        pendingSend: pending,
                    },
                    isStreaming: false, streamingText: '',
                });
                return; // Paused — user chooses Retry or Dismiss
            }

            // 4. Continue to Gemini
            await resumeSendFlow(get, set, convId, text, attachments, appContext, persistedContext, myNonce, myAbortController);
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
                if (streamingNonce === myNonce) {
                    set({ error: displayMessage, lastFailedRequest: { text, attachments } });
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
            if (activeAbortController === myAbortController) {
                activeAbortController = null;
            }
            if (streamingNonce === myNonce) {
                set({ isStreaming: false, streamingText: '' });
            }
        }
    },

    retryLastMessage: async () => {
        const { lastFailedRequest } = get();
        if (!lastFailedRequest) return;
        const { text, attachments, messageId } = lastFailedRequest;
        set({ lastFailedRequest: null, error: null });

        // Clean up the failed state before resending
        if (messageId) {
            const { userId, channelId } = requireContext(get);
            const convId = get().activeConversationId;
            if (convId) {
                // Delete the old failed message from Firestore
                ChatService.deleteMessage(userId, channelId, convId, messageId).catch(() => { });
                // Clear server-side lastError signal from conversation doc
                ChatService.clearLastError(userId, channelId, convId).catch(() => { });
            }
        }

        await get().sendMessage(text, attachments);
    },

    stopGeneration: () => {
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
    },

    retryEnrichment: async () => {
        const warning = get().enrichmentWarning;
        if (!warning) return;

        const { text, attachments, convId, rawContextItems, existingPersisted, nonce, abortController } = warning.pendingSend;
        const { userId, channelId } = requireContext(get);

        set({ enrichmentWarning: null, isStreaming: true, streamingText: '' });

        try {
            const { appContext, persistedContext, failedTrafficVideos } = await prepareContext(
                rawContextItems, userId, channelId, convId, existingPersisted,
            );

            // Still failing? Show warning again
            if (failedTrafficVideos.length > 0) {
                set({
                    enrichmentWarning: {
                        message: `Traffic Sources still failing for: ${failedTrafficVideos.join(', ')}`,
                        failedVideos: failedTrafficVideos,
                        pendingSend: warning.pendingSend,
                    },
                    isStreaming: false, streamingText: '',
                });
                return;
            }

            await resumeSendFlow(get, set, convId, text, attachments, appContext, persistedContext, nonce, abortController);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Enrichment retry failed';
            set({ error: errorMessage, isStreaming: false, streamingText: '', enrichmentWarning: null });
        } finally {
            if (streamingNonce === nonce) set({ isStreaming: false });
        }
    },

    dismissEnrichment: async () => {
        const warning = get().enrichmentWarning;
        if (!warning) return;

        const { text, attachments, convId, existingPersisted, nonce, abortController } = warning.pendingSend;

        // Skip enrichment — use existing persisted context only (no new enriched data)
        const persistedContext = existingPersisted.length > 0 ? existingPersisted : undefined;

        try {
            await resumeSendFlow(get, set, convId, text, attachments, undefined, persistedContext, nonce, abortController);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
            set({ error: errorMessage, isStreaming: false, streamingText: '', enrichmentWarning: null });
        } finally {
            if (streamingNonce === nonce) set({ isStreaming: false });
        }
    },

    saveAiSettings: async (settings) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.saveAiSettings(userId, channelId, settings);
    },

    memorizeConversation: async (guidance?: string) => {
        const { channelId, activeConversationId, conversations } = get();
        if (!channelId || !activeConversationId) {
            throw new Error('No active conversation to memorize');
        }
        const conv = conversations.find(c => c.id === activeConversationId);
        const model = conv?.model || get().aiSettings.defaultModel;

        const result = await AiProxy.concludeConversation(
            channelId, activeConversationId, guidance, model
        );
        return result;
    },

    updateMemory: async (memoryId: string, content: string) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.updateMemory(userId, channelId, memoryId, content);
    },

    deleteMemory: async (memoryId: string) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.deleteMemory(userId, channelId, memoryId);
    },
}));

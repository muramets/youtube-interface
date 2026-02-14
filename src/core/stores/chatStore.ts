// =============================================================================
// AI CHAT: Zustand Store
// =============================================================================

import { create } from 'zustand';
import type {
    ChatProject,
    ChatConversation,
    ChatMessage,
    AiAssistantSettings,
    ChatView,
} from '../types/chat';
import { DEFAULT_AI_SETTINGS } from '../types/chat';
import { ChatService, MESSAGE_PAGE_SIZE, CONVERSATION_PAGE_SIZE } from '../services/chatService';
import { AiService } from '../services/aiService';
import type { ReadyAttachment } from '../types/chatAttachment';
import { Timestamp } from 'firebase/firestore';

interface ChatState {
    // Context (set once via setContext)
    userId: string | null;
    channelId: string | null;

    // Data
    projects: ChatProject[];
    conversations: ChatConversation[];
    messages: ChatMessage[];
    aiSettings: AiAssistantSettings;

    // UI state
    isOpen: boolean;
    view: ChatView;
    activeProjectId: string | null;
    activeConversationId: string | null;
    isLoading: boolean;
    isStreaming: boolean;
    streamingText: string;
    error: string | null;
    hasMoreMessages: boolean;
    hasMoreConversations: boolean;
    lastFailedRequest: { text: string; attachments?: ReadyAttachment[] } | null;

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
    loadOlderMessages: () => Promise<void>;
    loadOlderConversations: () => Promise<void>;

    // Actions — CRUD
    createProject: (name: string) => Promise<ChatProject>;
    updateProject: (projectId: string, updates: Partial<Pick<ChatProject, 'name' | 'systemPrompt' | 'model' | 'order'>>) => Promise<void>;
    deleteProject: (projectId: string) => Promise<void>;
    createConversation: (projectId: string | null) => Promise<ChatConversation>;
    deleteConversation: (conversationId: string) => Promise<void>;
    renameConversation: (conversationId: string, title: string) => Promise<void>;
    moveConversation: (conversationId: string, projectId: string | null) => Promise<void>;

    // Actions — AI
    sendMessage: (text: string, attachments?: ReadyAttachment[], conversationId?: string) => Promise<void>;
    retryLastMessage: () => Promise<void>;
    stopGeneration: () => void;
    saveAiSettings: (settings: Partial<AiAssistantSettings>) => Promise<void>;
}

// AbortController lives outside Zustand (non-serializable)
let activeAbortController: AbortController | null = null;

/** Helper: get context or throw */
function requireContext(get: () => ChatState): { userId: string; channelId: string } {
    const { userId, channelId } = get();
    if (!userId || !channelId) throw new Error('Chat context not set. Call setContext first.');
    return { userId, channelId };
}

// =============================================================================
// Composable message-send steps (pure helpers, individually testable)
// =============================================================================

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English', ru: 'Russian', uk: 'Ukrainian',
    es: 'Spanish', de: 'German', fr: 'French',
};

/** Resolve model from project → global → fallback. */
function resolveModel(
    aiSettings: AiAssistantSettings,
    projects: ChatProject[],
    activeProjectId: string | null,
): string {
    const project = projects.find(p => p.id === activeProjectId);
    return project?.model || aiSettings.defaultModel;
}

/** Build system prompt: language + style + global + project-level. */
function buildSystemPrompt(
    aiSettings: AiAssistantSettings,
    projects: ChatProject[],
    activeProjectId: string | null,
): string | undefined {
    const prompts: string[] = [];

    // Language instruction
    if (aiSettings.responseLanguage && aiSettings.responseLanguage !== 'auto') {
        const name = LANGUAGE_NAMES[aiSettings.responseLanguage] || aiSettings.responseLanguage;
        prompts.push(`Always respond in ${name}.`);
    }

    // Style instruction
    if (aiSettings.responseStyle === 'concise') {
        prompts.push('Be concise and to the point. Prefer short answers.');
    } else if (aiSettings.responseStyle === 'detailed') {
        prompts.push('Provide thorough, detailed responses with explanations and examples.');
    }

    // Global + project prompts
    if (aiSettings.globalSystemPrompt) prompts.push(aiSettings.globalSystemPrompt);
    const project = projects.find(p => p.id === activeProjectId);
    if (project?.systemPrompt) prompts.push(project.systemPrompt);

    return prompts.length > 0 ? prompts.join('\n\n') : undefined;
}

/** Optimistic UI + Firestore persist for user message. */
async function persistUserMessage(
    userId: string, channelId: string, convId: string,
    text: string, attachments: ReadyAttachment[] | undefined,
    currentMessages: ChatMessage[],
    set: (partial: Partial<ChatState>) => void,
): Promise<void> {
    const optimisticMsg: ChatMessage = {
        id: `optimistic-${crypto.randomUUID()}`,
        role: 'user',
        text,
        attachments,
        createdAt: Timestamp.now(),
    };
    set({ messages: [...currentMessages, optimisticMsg] });
    await ChatService.addMessage(userId, channelId, convId, { role: 'user', text, attachments });
}

/** Stream AI response from CF. Returns response text + token usage. */
async function streamAiResponse(
    channelId: string, convId: string,
    model: string, systemPrompt: string | undefined,
    text: string, attachments: ReadyAttachment[] | undefined,
    set: (partial: Partial<ChatState>) => void,
    signal?: AbortSignal,
): Promise<{ text: string; tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    return AiService.sendMessage({
        channelId,
        conversationId: convId,
        model,
        systemPrompt,
        text,
        attachments: attachments?.map(a => ({ geminiFileUri: a.geminiFileUri!, mimeType: a.mimeType })),
        onStream: (chunk) => set({ streamingText: chunk }),
        signal,
    });
}

/** Persist model response to Firestore. */
async function persistAiResponse(
    userId: string, channelId: string, convId: string,
    responseText: string, tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number },
): Promise<void> {
    await ChatService.addMessage(userId, channelId, convId, { role: 'model', text: responseText, tokenUsage });
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

export const useChatStore = create<ChatState>((set, get) => ({
    // Initial state
    userId: null,
    channelId: null,

    projects: [],
    conversations: [],
    messages: [],
    aiSettings: DEFAULT_AI_SETTINGS,

    isOpen: false,
    view: 'conversations',
    activeProjectId: null,
    activeConversationId: null,
    isLoading: false,
    isStreaming: false,
    streamingText: '',
    error: null,
    hasMoreMessages: false,
    hasMoreConversations: false,
    lastFailedRequest: null,

    // --- Context ---
    setContext: (userId, channelId) => set({ userId, channelId }),

    // --- UI Actions ---

    toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
    setOpen: (open) => set({ isOpen: open }),

    setView: (view) => set({ view }),

    setActiveProject: (id) => set({ activeProjectId: id, view: 'conversations' }),

    setActiveConversation: (id) => set({
        activeConversationId: id,
        view: id ? 'chat' : 'conversations',
        messages: [],
        streamingText: '',
        error: null,
        hasMoreMessages: false,
    }),

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
            // Reconcile: keep optimistic messages that Firestore hasn't confirmed yet
            const realIds = new Set(firestoreMessages.map(m => m.id));
            const pendingOptimistic = get().messages.filter(
                m => m.id.startsWith('optimistic-') && !realIds.has(m.id)
            );
            const merged = [...firestoreMessages, ...pendingOptimistic];

            if (isFirstLoad) {
                isFirstLoad = false;
                set({
                    messages: merged,
                    isLoading: false,
                    hasMoreMessages: firestoreMessages.length >= MESSAGE_PAGE_SIZE,
                });
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

    // --- AI ---

    sendMessage: async (text, attachments, conversationId) => {
        const { userId, channelId } = requireContext(get);
        const { activeConversationId, activeProjectId, messages, aiSettings, projects, isStreaming } = get();
        const convId = conversationId || activeConversationId;

        if (isStreaming || !convId) return;

        // Lock immediately — before any await — prevents double-send
        activeAbortController = new AbortController();
        set({ isStreaming: true, streamingText: '', error: null, lastFailedRequest: null });

        try {
            // 1. Optimistic UI + persist user message
            await persistUserMessage(userId, channelId, convId, text, attachments, messages, set);

            // 2. Resolve config
            const model = resolveModel(aiSettings, projects, activeProjectId);
            const systemPrompt = buildSystemPrompt(aiSettings, projects, activeProjectId);

            // 3. Stream AI response
            const { text: responseText, tokenUsage } = await streamAiResponse(
                channelId, convId, model, systemPrompt,
                text, attachments, set, activeAbortController?.signal,
            );

            // 4. Persist AI response
            await persistAiResponse(userId, channelId, convId, responseText, tokenUsage);

            // 5. Auto-title (fire-and-forget)
            maybeAutoTitle(userId, channelId, convId, text, model, messages.length === 0);

            set({ streamingText: '' });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                // User stopped generation — save partial text if available
                const partial = get().streamingText;
                if (partial) {
                    await ChatService.addMessage(userId, channelId, convId, {
                        role: 'model',
                        text: partial + '\n\n*(generation stopped)*',
                    });
                }
            } else {
                const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
                const isContextOverflow = /token|context.*limit|too long|payload size/i.test(errorMessage);
                const displayMessage = isContextOverflow
                    ? 'Context window exceeded. Start a new conversation or delete old messages.'
                    : errorMessage;
                set({ error: displayMessage, lastFailedRequest: { text, attachments } });
            }
        } finally {
            // Guaranteed reset — no deadlock possible
            activeAbortController = null;
            set({ isStreaming: false, streamingText: '' });
        }
    },

    retryLastMessage: async () => {
        const { lastFailedRequest } = get();
        if (!lastFailedRequest) return;
        const { text, attachments } = lastFailedRequest;
        set({ lastFailedRequest: null, error: null });
        await get().sendMessage(text, attachments);
    },

    stopGeneration: () => {
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
    },

    saveAiSettings: async (settings) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.saveAiSettings(userId, channelId, settings);
    },
}));

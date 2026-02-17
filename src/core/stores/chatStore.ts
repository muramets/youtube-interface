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
import type { AppContextItem, VideoCardContext, SuggestedTrafficContext } from '../types/appContext';
import { useAppContextStore } from './appContextStore';
import { Timestamp } from 'firebase/firestore';
import { debug } from '../utils/debug';
import {
    STYLE_CONCISE,
    STYLE_DETAILED,
    VIDEO_CONTEXT_PREAMBLE,
    VIDEO_SECTION_DRAFT,
    VIDEO_SECTION_PUBLISHED,
    VIDEO_SECTION_COMPETITOR,
    TRAFFIC_CONTEXT_HEADER,
    TRAFFIC_SOURCE_HEADER,
    TRAFFIC_SUGGESTED_HEADER,
} from '../config/prompts';

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
    pendingConversationId: string | null;
    isLoading: boolean;
    isStreaming: boolean;
    streamingText: string;
    error: string | null;
    hasMoreMessages: boolean;
    hasMoreConversations: boolean;
    lastFailedRequest: { text: string; attachments?: ReadyAttachment[]; messageId?: string } | null;
    pendingModel: string | null; // model override for not-yet-created conversations
    editingMessage: ChatMessage | null; // message being edited (user clicks pencil)

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
    startNewChat: () => void;
    createConversation: (projectId: string | null) => Promise<ChatConversation>;
    deleteConversation: (conversationId: string) => Promise<void>;
    renameConversation: (conversationId: string, title: string) => Promise<void>;
    moveConversation: (conversationId: string, projectId: string | null) => Promise<void>;
    setConversationModel: (conversationId: string, model: string) => Promise<void>;
    setPendingModel: (model: string | null) => void;

    // Actions — AI
    sendMessage: (text: string, attachments?: ReadyAttachment[], conversationId?: string) => Promise<void>;
    retryLastMessage: () => Promise<void>;
    stopGeneration: () => void;
    saveAiSettings: (settings: Partial<AiAssistantSettings>) => Promise<void>;

    // Actions — Edit
    setEditingMessage: (msg: ChatMessage | null) => void;
    editMessage: (newText: string, attachments?: ReadyAttachment[]) => Promise<void>;
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

/** Format video card context items as Markdown for the system prompt, grouped by ownership. */
function formatVideoContext(items: VideoCardContext[]): string {
    const lines: string[] = [];

    // Preamble — explain field semantics
    lines.push(VIDEO_CONTEXT_PREAMBLE);
    lines.push('');

    // Group by ownership
    const drafts = items.filter(v => v.ownership === 'own-draft');
    const published = items.filter(v => v.ownership === 'own-published');
    const competitors = items.filter(v => v.ownership === 'competitor');

    if (drafts.length > 0) {
        lines.push(VIDEO_SECTION_DRAFT);
        lines.push('');
        drafts.forEach((v, i) => formatSingleVideo(lines, v, i + 1));
    }

    if (published.length > 0) {
        lines.push(VIDEO_SECTION_PUBLISHED);
        lines.push('');
        published.forEach((v, i) => formatSingleVideo(lines, v, i + 1));
    }

    if (competitors.length > 0) {
        lines.push(VIDEO_SECTION_COMPETITOR);
        lines.push('');
        competitors.forEach((v, i) => formatSingleVideo(lines, v, i + 1));
    }

    return lines.join('\n');
}

/** Format a single video's metadata into prompt lines. */
function formatSingleVideo(lines: string[], v: VideoCardContext, index: number): void {
    const header = v.channelTitle
        ? `Video ${index} (Channel: ${v.channelTitle})`
        : `Video ${index}`;
    lines.push(`#### ${header}`);
    lines.push(`- **Title:** ${v.title}`);
    if (v.viewCount) lines.push(`- **Views:** ${v.viewCount}`);
    if (v.publishedAt) lines.push(`- **Published:** ${v.publishedAt}`);
    if (v.duration) lines.push(`- **Duration:** ${v.duration}`);
    lines.push(`- **Description:** ${v.description || '(no description)'}`);
    lines.push(`- **Tags:** ${v.tags.length > 0 ? v.tags.join(', ') : '(no tags)'}`);
    lines.push('');
}

/** Format suggested traffic context — source video + selected suggested videos. */
function formatSuggestedTrafficContext(ctx: SuggestedTrafficContext): string {
    const lines = [TRAFFIC_CONTEXT_HEADER, ''];

    // Source video (user's video)
    const sv = ctx.sourceVideo;
    lines.push(TRAFFIC_SOURCE_HEADER);
    lines.push(`- **Title:** ${sv.title}`);
    if (sv.viewCount) lines.push(`- **Views:** ${sv.viewCount}`);
    if (sv.publishedAt) lines.push(`- **Published:** ${sv.publishedAt}`);
    if (sv.duration) lines.push(`- **Duration:** ${sv.duration}`);
    lines.push(`- **Description:** ${sv.description || '(no description)'}`);
    lines.push(`- **Tags:** ${sv.tags.length > 0 ? sv.tags.join(', ') : '(no tags)'}`);

    lines.push('');

    // Selected suggested videos
    lines.push(TRAFFIC_SUGGESTED_HEADER);
    lines.push('');
    ctx.suggestedVideos.forEach((v, i) => {
        lines.push(`#### Suggested Video ${i + 1}: "${v.title}"`);
        // Traffic metrics (always available from CSV)
        lines.push(`- **Impressions:** ${v.impressions.toLocaleString()} | **CTR:** ${(v.ctr * 100).toFixed(1)}% | **Views:** ${v.views.toLocaleString()}`);
        lines.push(`- **Avg View Duration:** ${v.avgViewDuration} | **Watch Time:** ${v.watchTimeHours.toFixed(1)}h`);
        // Enriched metadata (may be unavailable)
        if (v.channelTitle) lines.push(`- **Channel:** ${v.channelTitle}`);
        if (v.publishedAt) lines.push(`- **Published:** ${v.publishedAt}`);
        if (v.duration) lines.push(`- **Duration:** ${v.duration}`);
        if (v.viewCount) lines.push(`- **Total Views:** ${v.viewCount}`);
        if (v.likeCount) lines.push(`- **Likes:** ${v.likeCount}`);
        if (v.subscriberCount) lines.push(`- **Channel Subscribers:** ${v.subscriberCount}`);
        if (v.trafficType) lines.push(`- **Traffic Type:** ${v.trafficType}`);
        if (v.viewerType) lines.push(`- **Viewer Type:** ${v.viewerType}`);
        if (v.niche) lines.push(`- **Niche:** ${v.niche}${v.nicheProperty ? ` (${v.nicheProperty})` : ''}`);
        lines.push(`- **Description:** ${v.description || '(not enriched)'}`);
        lines.push(`- **Tags:** ${v.tags && v.tags.length > 0 ? v.tags.join(', ') : '(not enriched)'}`);

        lines.push('');
    });

    return lines.join('\n');
}

/** Build system prompt: language + style + global + project-level + app context. */
function buildSystemPrompt(
    aiSettings: AiAssistantSettings,
    projects: ChatProject[],
    activeProjectId: string | null,
    appContext?: AppContextItem[],
): string | undefined {
    const prompts: string[] = [];

    // Current date/time context (LLMs have no built-in clock)
    prompts.push(`Current date and time: ${new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}.`);

    // Language instruction
    if (aiSettings.responseLanguage && aiSettings.responseLanguage !== 'auto') {
        const name = LANGUAGE_NAMES[aiSettings.responseLanguage] || aiSettings.responseLanguage;
        prompts.push(`Always respond in ${name}.`);
    }

    // Style instruction
    if (aiSettings.responseStyle === 'concise') {
        prompts.push(STYLE_CONCISE);
    } else if (aiSettings.responseStyle === 'detailed') {
        prompts.push(STYLE_DETAILED);
    }

    // Global + project prompts
    if (aiSettings.globalSystemPrompt) prompts.push(aiSettings.globalSystemPrompt);
    const project = projects.find(p => p.id === activeProjectId);
    if (project?.systemPrompt) prompts.push(project.systemPrompt);

    // App context (video cards, etc.)
    if (appContext && appContext.length > 0) {
        const videoCards = appContext.filter((c): c is VideoCardContext => c.type === 'video-card');
        if (videoCards.length > 0) {
            prompts.push(formatVideoContext(videoCards));
        }
        const trafficContexts = appContext.filter((c): c is SuggestedTrafficContext => c.type === 'suggested-traffic');
        if (trafficContexts.length > 0) {
            trafficContexts.forEach(tc => prompts.push(formatSuggestedTrafficContext(tc)));
        }
    }

    return prompts.length > 0 ? prompts.join('\n\n') : undefined;
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

/** Stream AI response from CF. Returns response text + token usage. */
async function streamAiResponse(
    channelId: string, convId: string,
    model: string, systemPrompt: string | undefined,
    text: string, attachments: ReadyAttachment[] | undefined,
    thumbnailUrls: string[] | undefined,
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
        thumbnailUrls,
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
    pendingConversationId: null,
    isLoading: false,
    isStreaming: false,
    streamingText: '',
    error: null,
    hasMoreMessages: false,
    hasMoreConversations: false,
    lastFailedRequest: null,
    pendingModel: null,
    editingMessage: null,

    // --- Context ---
    setContext: (userId, channelId) => set({ userId, channelId }),

    // --- UI Actions ---

    toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
    setOpen: (open) => set({ isOpen: open }),

    setView: (view) => set({ view }),

    setActiveProject: (id) => set({ activeProjectId: id, view: 'conversations' }),

    setActiveConversation: (id) => set({
        activeConversationId: id,
        pendingConversationId: null,
        pendingModel: null,
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
                        lastFailedRequest: { text: '', messageId: conv.lastError.messageId },
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
        set({
            activeConversationId: null,
            pendingConversationId: crypto.randomUUID(),
            pendingModel: null,
            view: 'chat',
            messages: [],
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

    setPendingModel: (model) => set({ pendingModel: model }),

    // --- Edit ---

    setEditingMessage: (msg) => set({ editingMessage: msg }),

    editMessage: async (newText, attachments) => {
        const { editingMessage, activeConversationId, messages } = get();
        if (!editingMessage || !activeConversationId) return;
        const { userId, channelId } = requireContext(get);

        // 1. Optimistic: remove the edited message + everything after it from local state
        const editIdx = messages.findIndex(m => m.id === editingMessage.id);
        if (editIdx !== -1) {
            set({ messages: messages.slice(0, editIdx) });
        }

        // 2. Clear editing state
        set({ editingMessage: null });

        // 3. Delete from Firestore: the edited message + all subsequent messages
        await ChatService.deleteMessagesFrom(userId, channelId, activeConversationId, editingMessage.createdAt);

        // 4. Send the new version (reuses full sendMessage flow: persist + stream AI)
        await get().sendMessage(newText, attachments);
    },

    // --- AI ---

    sendMessage: async (text, attachments, conversationId) => {
        const { userId, channelId } = requireContext(get);
        const { activeConversationId, pendingConversationId, activeProjectId, messages, aiSettings, projects, isStreaming } = get();
        let convId = conversationId || activeConversationId;

        if (isStreaming) return;

        // Lock immediately — before any await — prevents double-send
        activeAbortController = new AbortController();
        set({ isStreaming: true, streamingText: '', error: null, lastFailedRequest: null });

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

            // Snapshot app context at send time
            const contextItems = useAppContextStore.getState().items;
            const appContext = contextItems.length > 0 ? contextItems : undefined;

            // Extract thumbnail URLs for server-side fetch
            const thumbnailUrls: string[] = [];
            if (appContext) {
                // Video cards
                appContext
                    .filter((c): c is VideoCardContext => c.type === 'video-card')
                    .forEach(c => { if (c.thumbnailUrl) thumbnailUrls.push(c.thumbnailUrl); });
                // Suggested traffic: source video + suggested videos
                appContext
                    .filter((c): c is SuggestedTrafficContext => c.type === 'suggested-traffic')
                    .forEach(tc => {
                        if (tc.sourceVideo.thumbnailUrl) thumbnailUrls.push(tc.sourceVideo.thumbnailUrl);
                        tc.suggestedVideos.forEach(sv => {
                            if (sv.thumbnailUrl) thumbnailUrls.push(sv.thumbnailUrl);
                        });
                    });
            }

            // 1. Optimistic UI + persist user message
            // Clear consumed context from input (snapshot already captured above)
            if (appContext) useAppContextStore.getState().consumeItems();
            await persistUserMessage(userId, channelId, convId, text, attachments, appContext, messages, set);

            // Now safe to set activeConversationId — optimistic message is already in state
            if (!activeConversationId) {
                set({ activeConversationId: convId });
            }

            // 2. Resolve config
            const activeConv = get().conversations.find(c => c.id === convId);
            const model = resolveModel(aiSettings, projects, activeProjectId, activeConv?.model, get().pendingModel);
            const systemPrompt = buildSystemPrompt(aiSettings, projects, activeProjectId, appContext);

            // Debug: log what's being sent to Gemini
            debug.chatGroup.start('🤖 Sending to Gemini');
            debug.chat('Model:', model);
            debug.chat('System Prompt:', systemPrompt);
            debug.chat('App Context:', appContext);
            debug.chat('Thumbnails:', thumbnailUrls);
            debug.chatGroup.end();

            // 3. Stream AI response
            const { text: responseText, tokenUsage } = await streamAiResponse(
                channelId, convId, model, systemPrompt,
                text, attachments, thumbnailUrls, set, activeAbortController?.signal,
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
                    await ChatService.addMessage(userId, channelId, convId!, {
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

    saveAiSettings: async (settings) => {
        const { userId, channelId } = requireContext(get);
        await ChatService.saveAiSettings(userId, channelId, settings);
    },
}));

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
    ConversationMemory,
} from '../types/chat';
import { DEFAULT_AI_SETTINGS } from '../types/chat';
import { ChatService, MESSAGE_PAGE_SIZE, CONVERSATION_PAGE_SIZE } from '../services/chatService';
import { AiService } from '../services/aiService';
import * as AiProxy from '../services/aiProxyService';
import type { ReadyAttachment } from '../types/chatAttachment';
import type { AppContextItem } from '../types/appContext';
import { getVideoCards, getTrafficContexts, getCanvasContexts } from '../types/appContext';
import { useAppContextStore, selectAllItems } from './appContextStore';
import { Timestamp } from 'firebase/firestore';
import { debug, DEBUG_ENABLED } from '../utils/debug';
import { buildSystemPrompt } from '../ai/systemPrompt';

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
    clearPersistedContext: (conversationId: string) => Promise<void>;
    updatePersistedContext: (conversationId: string, items: AppContextItem[]) => Promise<void>;

    // Actions — AI
    sendMessage: (text: string, attachments?: ReadyAttachment[], conversationId?: string) => Promise<void>;
    retryLastMessage: () => Promise<void>;
    stopGeneration: () => void;
    saveAiSettings: (settings: Partial<AiAssistantSettings>) => Promise<void>;
    memorizeConversation: (guidance?: string) => Promise<{ memoryId: string; content: string }>;
    updateMemory: (memoryId: string, content: string) => Promise<void>;
    deleteMemory: (memoryId: string) => Promise<void>;

    // Actions — Edit
    setEditingMessage: (msg: ChatMessage | null) => void;
    editMessage: (newText: string, attachments?: ReadyAttachment[]) => Promise<void>;
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
    contextMeta: { videoCards?: number; trafficSources?: number; canvasNodes?: number; totalItems?: number } | undefined,
    set: (partial: Partial<ChatState>) => void,
    signal?: AbortSignal,
): Promise<{ text: string; tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }; usedSummary?: boolean }> {
    return AiService.sendMessage({
        channelId,
        conversationId: convId,
        model,
        systemPrompt,
        text,
        attachments: attachments?.map(a => ({ geminiFileUri: a.geminiFileUri!, mimeType: a.mimeType })),
        thumbnailUrls,
        contextMeta,
        onStream: (chunk) => set({ streamingText: chunk }),
        signal,
    });
}

/** Persist model response to Firestore. */
async function persistAiResponse(
    userId: string, channelId: string, convId: string,
    responseText: string, model: string, tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number },
): Promise<void> {
    await ChatService.addMessage(userId, channelId, convId, { role: 'model', text: responseText, model, tokenUsage });
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
    memories: [],

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

    setActiveConversation: (id) => {
        // Invalidate any running stream's UI callbacks (stream itself keeps running)
        streamingNonce++;
        set({
            activeConversationId: id,
            pendingConversationId: null,
            pendingModel: null,
            view: id ? 'chat' : 'conversations',
            messages: [],
            isStreaming: false,
            streamingText: '',
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
        const { activeConversationId, pendingConversationId, activeProjectId, messages, aiSettings, projects, memories, isStreaming } = get();
        let convId = conversationId || activeConversationId;

        if (isStreaming) return;

        // Lock immediately — before any await — prevents double-send
        const myAbortController = new AbortController();
        activeAbortController = myAbortController;
        const myNonce = ++streamingNonce;
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
            const contextItems = selectAllItems(useAppContextStore.getState());
            const appContext = contextItems.length > 0 ? contextItems : undefined;

            // Merge with existing persistent context from this conversation
            const existingConv = get().conversations.find(c => c.id === convId);
            const existingPersisted = existingConv?.persistedContext ?? [];
            const mergedContext: AppContextItem[] = [...existingPersisted];
            if (appContext) {
                for (const item of appContext) {
                    // Deduplicate by type + identifying key
                    const isDuplicate = mergedContext.some(existing => {
                        if (existing.type !== item.type) return false;
                        if (item.type === 'video-card' && existing.type === 'video-card')
                            return item.videoId === existing.videoId;
                        if (item.type === 'suggested-traffic' && existing.type === 'suggested-traffic')
                            return item.sourceVideo.videoId === existing.sourceVideo.videoId;
                        return false; // canvas-selection: always add as new group
                    });
                    if (!isDuplicate) mergedContext.push(item);
                }
            }
            const persistedContext = mergedContext.length > 0 ? mergedContext : undefined;

            // Persist merged context to conversation doc (fire-and-forget, errors logged).
            if (persistedContext && appContext) {
                ChatService.updateConversation(userId, channelId, convId, { persistedContext })
                    .catch(err => debug.chat('⚠️ Failed to persist context:', err));
            }

            // Extract thumbnail URLs from PERSISTED context (all accumulated)
            // so Gemini can visually compare covers across the entire conversation.
            const thumbnailUrlsRaw: string[] = [];
            const thumbnailSource = persistedContext ?? appContext;
            if (thumbnailSource) {
                // Video cards
                getVideoCards(thumbnailSource)
                    .forEach(c => { if (c.thumbnailUrl) thumbnailUrlsRaw.push(c.thumbnailUrl); });
                // Suggested traffic: source video + suggested videos
                getTrafficContexts(thumbnailSource)
                    .forEach(tc => {
                        if (tc.sourceVideo.thumbnailUrl) thumbnailUrlsRaw.push(tc.sourceVideo.thumbnailUrl);
                        tc.suggestedVideos.forEach(sv => {
                            if (sv.thumbnailUrl) thumbnailUrlsRaw.push(sv.thumbnailUrl);
                        });
                    });
                // Canvas selection: video thumbnails + image downloadUrls
                getCanvasContexts(thumbnailSource)
                    .forEach(cc => {
                        cc.nodes.forEach(node => {
                            if (node.nodeType === 'video' || node.nodeType === 'traffic-source') {
                                if (node.thumbnailUrl) thumbnailUrlsRaw.push(node.thumbnailUrl);
                            }
                            if (node.nodeType === 'image') {
                                if (node.imageUrl) thumbnailUrlsRaw.push(node.imageUrl);
                            }
                        });
                    });
            }
            // Deduplicate — same video can appear in multiple context sources
            const thumbnailUrls = [...new Set(thumbnailUrlsRaw)];

            // 1. Optimistic UI + persist user message
            // Clear consumed context from input (snapshot already captured above)
            if (appContext) useAppContextStore.getState().consumeAll();
            await persistUserMessage(userId, channelId, convId, text, attachments, appContext, messages, set);

            // Now safe to set activeConversationId — optimistic message is already in state
            if (!activeConversationId) {
                set({ activeConversationId: convId });
            }

            // 2. Resolve config — use PERSISTED context (full history) for systemPrompt
            const activeConv = get().conversations.find(c => c.id === convId);
            const model = resolveModel(aiSettings, projects, activeProjectId, activeConv?.model, get().pendingModel);
            const systemPrompt = buildSystemPrompt(aiSettings, projects, activeProjectId, persistedContext, memories);

            // Debug: log what's being sent to Gemini (layered view)
            // Uses direct console.group/groupCollapsed (not through wrapper) so Chrome
            // DevTools renders the expand-triangle correctly.
            if (import.meta.env.DEV && DEBUG_ENABLED.chat) {
                console.group('🤖 Sending to Gemini | Model:', model);

                // Settings layer
                console.groupCollapsed('⚙️ Settings Layer');
                console.log('  Language:', aiSettings.responseLanguage || 'auto', '| Style:', aiSettings.responseStyle || 'default');
                console.log('  Global prompt:', aiSettings.globalSystemPrompt ? `✓ (${aiSettings.globalSystemPrompt.length} chars)` : '—');
                const activeProject = projects.find(p => p.id === activeProjectId);
                console.log('  Project prompt:', activeProject?.systemPrompt ? `✓ (${activeProject.systemPrompt.length} chars)` : '—');
                console.groupEnd();

                // Layer 1: Persistent Context
                if (persistedContext && persistedContext.length > 0) {
                    const vcCount = getVideoCards(persistedContext).length;
                    const tcCount = getTrafficContexts(persistedContext).length;
                    const ccList = getCanvasContexts(persistedContext);
                    const nodeCount = ccList.reduce((sum, cc) => sum + cc.nodes.length, 0);
                    console.groupCollapsed(`📎 Layer 1: Persistent Context (${vcCount} videos, ${tcCount} traffic, ${ccList.length} canvas / ${nodeCount} nodes)`);

                    let videoIdx = 0;
                    persistedContext.forEach(item => {
                        if (item.type === 'video-card') {
                            const v = item;
                            videoIdx++;
                            const ownerLabel = v.ownership === 'own-draft' ? 'Draft' : v.ownership === 'own-published' ? 'Video' : 'Competitor';
                            console.log(`  #${videoIdx} 🎬 [${ownerLabel}] ${v.title}`);
                            console.log(`      views: ${v.viewCount ?? '—'} | dur: ${v.duration ?? '—'} | pub: ${v.publishedAt ?? '—'} | ch: ${v.channelTitle ?? '—'}`);
                            console.log(`      desc: ${v.description ? `✓ (${v.description.length}ch)` : '—'} | tags: ${v.tags && v.tags.length > 0 ? `${v.tags.length} [${v.tags.slice(0, 3).join(', ')}${v.tags.length > 3 ? '…' : ''}]` : '—'}`);

                        } else if (item.type === 'suggested-traffic') {
                            const sv = item.sourceVideo;
                            console.log(`  📊 [Traffic] ${sv.title} → ${item.suggestedVideos.length} suggested`);
                            console.log(`      snapshot: ${item.snapshotDate ?? '—'} | label: ${item.snapshotLabel ?? '—'}`);
                            console.log(`      source: views ${sv.viewCount ?? '—'} | dur: ${sv.duration ?? '—'} | pub: ${sv.publishedAt ?? '—'}`);
                            item.suggestedVideos.forEach((sg, i) => {
                                console.log(`      [${i + 1}] ${sg.title}`);
                                console.log(`          impr: ${sg.impressions.toLocaleString()} | CTR: ${(sg.ctr * 100).toFixed(1)}% | views: ${sg.views.toLocaleString()} | dur: ${sg.avgViewDuration} | watch: ${sg.watchTimeHours.toFixed(1)}h`);
                                console.log(`          ch: ${sg.channelTitle ?? '—'} | traffic: ${sg.trafficType ?? '—'} | viewer: ${sg.viewerType ?? '—'} | niche: ${sg.niche ?? '—'}`);
                                console.log(`          desc: ${sg.description ? `✓ (${sg.description.length}ch)` : '—'} | tags: ${sg.tags && sg.tags.length > 0 ? sg.tags.length : '—'}`);
                            });

                        } else if (item.type === 'canvas-selection') {
                            console.log(`  🖼️ Canvas (${item.nodes.length} nodes)`);
                            item.nodes.forEach((node, i) => {
                                if (node.nodeType === 'video') {
                                    videoIdx++;
                                    const nodeLabel = node.ownership === 'own-draft' ? 'Draft' : node.ownership === 'own-published' ? 'Video' : 'Competitor';
                                    console.log(`      [${i + 1}] 🎬 #${videoIdx} [${nodeLabel}] ${node.title}`);
                                    console.log(`          views: ${node.viewCount ?? '—'} | dur: ${node.duration ?? '—'} | ch: ${node.channelTitle ?? '—'}`);
                                    console.log(`          desc: ${node.description ? `✓ (${node.description.length}ch)` : '—'} | tags: ${node.tags && node.tags.length > 0 ? `${node.tags.length} [${node.tags.slice(0, 3).join(', ')}${node.tags.length > 3 ? '…' : ''}]` : '—'}`);
                                } else if (node.nodeType === 'traffic-source') {
                                    console.log(`      [${i + 1}] 📊 ${node.title} — impr: ${node.impressions?.toLocaleString() ?? '—'} | CTR: ${node.ctr != null ? (node.ctr * 100).toFixed(1) + '%' : '—'} | views: ${node.views?.toLocaleString() ?? '—'}`);
                                    console.log(`          desc: ${node.description ? `✓ (${node.description.length}ch)` : '—'} | tags: ${node.tags && node.tags.length > 0 ? `${node.tags.length} [${node.tags.slice(0, 3).join(', ')}${node.tags.length > 3 ? '…' : ''}]` : '—'}`);
                                } else if (node.nodeType === 'sticky-note') {
                                    console.log(`      [${i + 1}] 📝 ${(node.content || '').slice(0, 80)}${(node.content || '').length > 80 ? '…' : ''}`);
                                } else if (node.nodeType === 'image') {
                                    console.log(`      [${i + 1}] 🖼 ${node.alt || '(no alt)'} | url: ${node.imageUrl ? '✓' : '—'}`);
                                }
                            });
                        }
                    });
                    console.log('  Thumbnails:', thumbnailUrls.length, 'URLs');
                    console.groupEnd(); // Layer 1
                } else {
                    console.log('📎 Layer 1: Persistent Context — empty');
                }

                // Layer 2: Per-message context binding
                const countByType = (ctx: AppContextItem[]) => {
                    const vc = ctx.filter(c => c.type === 'video-card').length;
                    const tcItems = ctx.filter(c => c.type === 'suggested-traffic');
                    const tcVideos = tcItems.reduce((sum, c) => sum + (c.type === 'suggested-traffic' ? c.suggestedVideos.length : 0), 0);
                    const ccItems = ctx.filter(c => c.type === 'canvas-selection');
                    const ccNodes = ccItems.reduce((sum, c) => sum + (c.type === 'canvas-selection' ? c.nodes.length : 0), 0);
                    return [
                        vc && `${vc} video`,
                        tcItems.length && `${tcItems.length} traffic / ${tcVideos} videos`,
                        ccItems.length && `${ccItems.length} canvas / ${ccNodes} nodes`,
                    ].filter(Boolean).join(', ');
                };
                const msgsWithContext = messages.filter(m => m.appContext && m.appContext.length > 0);
                console.groupCollapsed(`🔗 Layer 2: ${msgsWithContext.length}/${messages.length} messages have appContext`);
                msgsWithContext.forEach(m => {
                    const idx = messages.indexOf(m) + 1;
                    const snippet = m.text.slice(0, 40) + (m.text.length > 40 ? '…' : '');
                    console.log(`  msg #${idx} (${m.role}): "${snippet}" → ${m.appContext!.length} items (${countByType(m.appContext!)})`);
                });
                if (appContext && appContext.length > 0) {
                    console.log(`  📤 current msg: ${appContext.length} items (${countByType(appContext)})`);
                } else {
                    console.log('  📤 current msg: 0 items');
                }
                console.groupEnd(); // Layer 2

                // Layer 4: Cross-conversation memory
                const memTokens = memories.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
                console.log(`🧠 Layer 4: ${memories.length} memories (~${memTokens} tokens)`);

                // System prompt size summary
                if (systemPrompt) {
                    const chars = systemPrompt.length;
                    const tokens = Math.ceil(chars / 4);
                    console.log(`📏 System prompt: ~${chars.toLocaleString()} chars (~${tokens.toLocaleString()} tokens)`);
                }

                console.groupEnd(); // 🤖 Sending to Gemini
            }

            // Build contextMeta for production CF logging
            const contextMeta = persistedContext ? {
                videoCards: getVideoCards(persistedContext).length,
                trafficSources: getTrafficContexts(persistedContext).length,
                canvasNodes: getCanvasContexts(persistedContext).reduce((sum, cc) => sum + cc.nodes.length, 0),
                totalItems: persistedContext.length,
            } : undefined;

            // 3. Stream AI response (nonce-guarded: only update UI if this stream is still current)
            const scopedSet = (partial: Partial<ChatState>) => {
                if (streamingNonce === myNonce) set(partial);
            };
            const { text: responseText, tokenUsage, usedSummary } = await streamAiResponse(
                channelId, convId, model, systemPrompt,
                text, attachments, thumbnailUrls, contextMeta, scopedSet, myAbortController.signal,
            );

            // Layer 3: Summarization status
            debug.chat(`📝 Layer 3: ${usedSummary ? '✓ summary used (older messages were compressed)' : '— full history (no summarization needed)'}`);

            // 4. Clear streaming UI BEFORE persisting — Firestore's latency compensation
            // delivers the snapshot immediately, so the model message would appear in the
            // messages array while the streaming bubble is still visible (duplication glitch).
            if (streamingNonce === myNonce) set({ isStreaming: false, streamingText: '' });

            // 5. Persist AI response (subscription fires immediately via latency compensation)
            await persistAiResponse(userId, channelId, convId, responseText, model, tokenUsage);

            // 6. Auto-title (fire-and-forget)
            maybeAutoTitle(userId, channelId, convId, text, model, messages.length === 0);
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

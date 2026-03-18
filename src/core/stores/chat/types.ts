// =============================================================================
// ChatState — shared interface for all chat store slices
// =============================================================================

import type {
    ChatProject,
    ChatConversation,
    ChatMessage,
    AiAssistantSettings,
    ChatView,
    ConversationMemory,
    ToolCallRecord,
} from '../../types/chat/chat';
import type { ReadyAttachment } from '../../types/chat/chatAttachment';
import type { AppContextItem } from '../../types/appContext';

/** Transient tool call entry tracked during streaming — extends ToolCallRecord with optional progress. */
export interface ActiveToolCall extends ToolCallRecord {
    progressMessage?: string;
    /** Unique index assigned per tool call within a streaming response — used for precise matching. */
    _callIndex: number;
}

/** Options for sendMessage that don't fit positional params. */
export interface SendOptions {
    /** Marks this turn as a conclude/memorize turn — backend injects saveMemory tool. */
    isConclude?: boolean;
    /** Text sent to backend (if different from display text persisted in chat). */
    backendText?: string;
}

export interface ChatState {
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
    retryAttempt: number; // 0 = normal, 1+ = server retrying
    activeToolCalls: ActiveToolCall[]; // tool calls in current streaming response (transient)
    thinkingText: string; // thinking text in current streaming response (transient)
    /** Ghost message — partial AI response preserved after user clicks Stop. Session-only, never sent to API. */
    stoppedResponse: { text: string; thinking: string; toolCalls: ActiveToolCall[]; model: string; thinkingElapsedMs?: number } | null;
    error: string | null;
    hasMoreMessages: boolean;
    hasMoreConversations: boolean;
    lastFailedRequest: { text: string; attachments?: ReadyAttachment[]; messageId?: string; sendOptions?: SendOptions } | null;
    pendingModel: string | null; // model override for not-yet-created conversations
    pendingThinkingOptionId: string | null; // thinking depth override (resets on model change)
    editingMessage: ChatMessage | null; // message being edited (user clicks pencil)
    referenceSelectionMode: { active: boolean; messageId: string | null; originalNum: string | null }; // Tier 3: Manual override selection state
    /**
     * Set when middleware blocks a large thumbnail batch — drives ConfirmLargePayloadBanner UI.
     * Stores the full send context so confirmLargePayload can re-run the AI call without
     * persisting a duplicate user message.
     */
    pendingLargePayloadConfirmation: {
        count: number;
        text: string;
        attachments: ReadyAttachment[] | undefined;
        convId: string;
        appContext: AppContextItem[] | undefined;
        persistedContext: AppContextItem[] | undefined;
    } | null;

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
    updateProject: (projectId: string, updates: Record<string, unknown>) => Promise<void>;
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
    sendMessage: (text: string, attachments?: ReadyAttachment[], conversationId?: string, largePayloadApproved?: boolean, options?: SendOptions) => Promise<void>;
    confirmLargePayload: () => Promise<void>;
    dismissLargePayload: () => void;
    retryLastMessage: () => Promise<void>;
    stopGeneration: () => void;
    saveAiSettings: (settings: Partial<AiAssistantSettings>) => Promise<void>;
    memorizeConversation: (guidance?: string) => Promise<void>;
    createMemory: (content: string, title?: string) => Promise<void>;
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

// @vitest-environment node
// =============================================================================
// sendSlice.test.ts — critical path tests for sendMessage and retryLastMessage
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must be declared before any module imports so Vitest hoisting picks them up.
// Prevents the jsdom worker from trying to establish Firebase connections.
vi.mock('firebase/firestore', () => ({
    Timestamp: {
        now: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toDate: () => new Date() }),
    },
}));
vi.mock('../../../config/firebase', () => ({}));

import { create } from 'zustand';
import type { ChatState } from '../types';
import { createSendSlice } from '../slices/sendSlice';
import { session } from '../session';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../services/ai/chatService', () => ({
    ChatService: {
        addMessage: vi.fn(),
        createConversation: vi.fn(),
        updateConversation: vi.fn(),
        clearLastError: vi.fn(),
        setLastError: vi.fn(),
        deleteMessagesFrom: vi.fn(),
        resetForEdit: vi.fn(),
    },
    MESSAGE_PAGE_SIZE: 20,
    CONVERSATION_PAGE_SIZE: 20,
}));

vi.mock('../../../services/ai/aiService', () => ({
    AiService: {
        sendMessage: vi.fn(),
        generateTitle: vi.fn(),
    },
}));

vi.mock('../../../ai/pipeline/prepareContext', () => ({
    prepareContext: vi.fn(),
}));

vi.mock('../../../ai/pipeline/extractThumbnails', () => ({
    extractThumbnails: vi.fn(() => []),
}));

vi.mock('../../../ai/pipeline/debugSendLog', () => ({
    debugSendLog: vi.fn(),
}));

vi.mock('../../../ai/systemPrompt', () => ({
    buildSystemPrompt: vi.fn(() => ({
        prompt: undefined,
        layerSizes: { settings: 0, persistentContext: 0, crossMemory: 0 },
    })),
}));

vi.mock('../../appContextStore', () => ({
    useAppContextStore: { getState: vi.fn(() => ({ consumeAll: vi.fn() })) },
    selectAllItems: vi.fn(() => []),
}));

vi.mock('../../../utils/debug', () => ({
    debug: { chat: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { ChatService } from '../../../services/ai/chatService';
import { AiService } from '../../../services/ai/aiService';
import { prepareContext } from '../../../ai/pipeline/prepareContext';
import type { AiAssistantSettings } from '../../../types/chat/chat';
import { DEFAULT_AI_SETTINGS } from '../../../types/chat/chat';
import { Timestamp } from 'firebase/firestore';

const mockChatService = ChatService as ReturnType<typeof vi.mocked<typeof ChatService>>;
const mockAiService = AiService as ReturnType<typeof vi.mocked<typeof AiService>>;
const mockPrepareContext = prepareContext as ReturnType<typeof vi.fn>;

function buildStore(overrides: Partial<ChatState> = {}) {
    return create<ChatState>((set, get) => ({
        // Minimal required state
        userId: 'user-1',
        channelId: 'chan-1',
        setContext: vi.fn(),
        projects: [],
        conversations: [],
        messages: [],
        aiSettings: DEFAULT_AI_SETTINGS as AiAssistantSettings,
        memories: [],
        isOpen: false,
        view: 'chat',
        activeProjectId: null,
        activeConversationId: 'conv-1',
        pendingConversationId: null,
        isLoading: false,
        isStreaming: false,
        streamingText: '',
        retryAttempt: 0,
        activeToolCalls: [],
        thinkingText: '',
        stoppedResponse: null,
        hasMoreMessages: false,
        hasMoreConversations: false,
        pendingModel: null,
        pendingThinkingOptionId: null,
        editingMessage: null,
        referenceSelectionMode: { active: false, messageId: null, originalNum: null },

        // Stub actions not under test
        toggleOpen: vi.fn(),
        setOpen: vi.fn(),
        setView: vi.fn(),
        setActiveProject: vi.fn(),
        setActiveConversation: vi.fn(),
        subscribeToProjects: vi.fn(),
        subscribeToConversations: vi.fn(),
        subscribeToMessages: vi.fn(),
        subscribeToAiSettings: vi.fn(),
        subscribeToMemories: vi.fn(),
        loadOlderMessages: vi.fn(),
        loadOlderConversations: vi.fn(),
        createProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        startNewChat: vi.fn(),
        createConversation: vi.fn(),
        deleteConversation: vi.fn(),
        renameConversation: vi.fn(),
        moveConversation: vi.fn(),
        setConversationModel: vi.fn(),
        setPendingModel: vi.fn(),
        setPendingThinkingOptionId: vi.fn(),
        clearPersistedContext: vi.fn(),
        updatePersistedContext: vi.fn(),
        stopGeneration: vi.fn(),
        saveAiSettings: vi.fn(),
        memorizeConversation: vi.fn(),
        createMemory: vi.fn(),
        updateMemory: vi.fn(),
        deleteMemory: vi.fn(),
        setEditingMessage: vi.fn(),
        startReferenceSelection: vi.fn(),
        cancelReferenceSelection: vi.fn(),
        saveReferenceOverride: vi.fn(),

        // Slice under test — actions and initial state from sendSlice
        ...createSendSlice(set, get),

        // Overrides come LAST so they win over slice initial state values
        ...overrides,
    }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendMessage — happy path', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset session nonce/controller so each test starts clean
        session.streamingNonce = 0;
        session.activeAbortController = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('adds AI response to messages after successful stream', async () => {
        const USER_MSG_ID = 'msg-user-1';
        const AI_TEXT = 'Hello from AI';

        mockChatService.addMessage
            // First call: persist user message
            .mockResolvedValueOnce({ id: USER_MSG_ID, role: 'user', text: 'hi', createdAt: Timestamp.now() })
            // Second call: persist AI response
            .mockResolvedValueOnce({ id: 'msg-ai-1', role: 'model', text: AI_TEXT, createdAt: Timestamp.now() });

        mockPrepareContext.mockResolvedValueOnce({
            appContext: [],
            persistedContext: [],
        });

        mockAiService.sendMessage.mockResolvedValueOnce({
            text: AI_TEXT,
            tokenUsage: undefined,
            toolCalls: undefined,
            usedSummary: false,
        });

        mockAiService.generateTitle.mockResolvedValueOnce('New Chat');
        mockChatService.updateConversation = vi.fn().mockResolvedValue(undefined);

        const store = buildStore();
        await store.getState().sendMessage('hi');

        expect(mockChatService.addMessage).toHaveBeenCalledTimes(2);
        expect(mockAiService.sendMessage).toHaveBeenCalledOnce();

        const state = store.getState();
        expect(state.isStreaming).toBe(false);
        expect(state.error).toBeNull();
    });
});

describe('retryLastMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        session.streamingNonce = 0;
        session.activeAbortController = null;
    });

    it('does NOT call persistUserMessage (addMessage for user role) on retry', async () => {
        const AI_TEXT = 'Retry response';

        mockChatService.clearLastError.mockResolvedValue(undefined);
        mockChatService.addMessage
            // Only the AI response persist should be called
            .mockResolvedValueOnce({ id: 'msg-ai-retry', role: 'model', text: AI_TEXT, createdAt: Timestamp.now() });

        mockAiService.sendMessage.mockResolvedValueOnce({
            text: AI_TEXT,
            tokenUsage: undefined,
            toolCalls: undefined,
            usedSummary: false,
        });

        mockAiService.generateTitle.mockResolvedValueOnce('Chat');
        mockChatService.updateConversation = vi.fn().mockResolvedValue(undefined);

        const store = buildStore({
            lastFailedRequest: { text: 'original question', attachments: undefined },
            conversations: [{
                id: 'conv-1',
                title: 'Test',
                projectId: null,
                persistedContext: [],
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            }],
        });

        await store.getState().retryLastMessage();

        // addMessage should only be called once (AI response) — never with role: 'user'
        const userMessageCalls = (mockChatService.addMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[3]?.role === 'user'
        );
        expect(userMessageCalls).toHaveLength(0);

        expect(mockAiService.sendMessage).toHaveBeenCalledOnce();
    });

    it('restores lastFailedRequest and sets error when retry fails', async () => {
        mockChatService.clearLastError.mockResolvedValue(undefined);
        mockChatService.setLastError.mockResolvedValue(undefined);
        mockAiService.sendMessage.mockRejectedValueOnce(new Error('Network error'));

        const store = buildStore({
            lastFailedRequest: { text: 'failed question', attachments: undefined },
            conversations: [{
                id: 'conv-1',
                title: 'Test',
                projectId: null,
                persistedContext: [],
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            }],
        });

        await store.getState().retryLastMessage();

        const state = store.getState();
        expect(state.error).toBe('Network error');
        expect(state.lastFailedRequest).toEqual({
            text: 'failed question',
            attachments: undefined,
            messageId: undefined,
        });
    });
});

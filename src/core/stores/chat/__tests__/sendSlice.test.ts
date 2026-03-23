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
import { session, getSessionThinking } from '../session';

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

vi.mock('../../channelStore', () => ({
    useChannelStore: { getState: vi.fn(() => ({ currentChannel: null })) },
}));

vi.mock('../../../services/knowledge/knowledgeCategoryService', () => ({
    KnowledgeCategoryService: {
        getCategories: vi.fn(() => Promise.resolve([])),
    },
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
        memoriesSnapshot: [],
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
        toggleMemoryProtected: vi.fn(),
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

    it('persists only user message — AI response is server-only (no client persist)', async () => {
        const USER_MSG_ID = 'msg-user-1';
        const AI_TEXT = 'Hello from AI';

        mockChatService.addMessage
            // Only user message is persisted client-side
            .mockResolvedValueOnce({ id: USER_MSG_ID, role: 'user', text: 'hi', createdAt: Timestamp.now() });

        mockPrepareContext.mockResolvedValueOnce({
            appContext: [],
            persistedContext: [],
        });

        mockAiService.sendMessage.mockResolvedValueOnce({
            text: AI_TEXT,
            tokenUsage: undefined,
            toolCalls: undefined,
            usedSummary: false,
            messageId: 'server-msg-1',
        });

        mockAiService.generateTitle.mockResolvedValueOnce('New Chat');
        mockChatService.updateConversation = vi.fn().mockResolvedValue(undefined);

        const store = buildStore();
        await store.getState().sendMessage('hi');

        // Only 1 addMessage call (user message) — NO model message persist
        expect(mockChatService.addMessage).toHaveBeenCalledTimes(1);
        expect(mockChatService.addMessage).toHaveBeenCalledWith(
            'user-1', 'chan-1', 'conv-1',
            expect.objectContaining({ role: 'user' }),
        );
        expect(mockAiService.sendMessage).toHaveBeenCalledOnce();

        // maybeAutoTitle still called (first exchange)
        expect(mockAiService.generateTitle).toHaveBeenCalledWith('hi', expect.any(String), 'chan-1', 'conv-1');

        const state = store.getState();
        expect(state.isStreaming).toBe(false);
        expect(state.error).toBeNull();
    });
});

describe('sendMessage — thinking persistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        session.streamingNonce = 0;
        session.activeAbortController = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('caches thinking via session when messageId is present', async () => {
        const THINKING_TEXT = 'Let me think about this...';

        mockChatService.addMessage
            .mockResolvedValueOnce({ id: 'msg-user-1', role: 'user', text: 'hi', createdAt: Timestamp.now() });

        mockPrepareContext.mockResolvedValueOnce({ appContext: [], persistedContext: [] });
        mockAiService.generateTitle.mockResolvedValueOnce('New Chat');

        // Mock sendMessage to trigger onThought callback (populates thinkingText in store)
        mockAiService.sendMessage.mockImplementationOnce(async (params: Record<string, unknown>) => {
            const onThought = params.onThought as ((t: string) => void) | undefined;
            onThought?.(THINKING_TEXT);
            return { text: 'Hello', usedSummary: false, messageId: 'server-msg-1' };
        });

        const store = buildStore();
        await store.getState().sendMessage('hi');

        // No model message persist — server handles it
        const modelCalls = (mockChatService.addMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[3]?.role === 'model'
        );
        expect(modelCalls).toHaveLength(0);

        // Thinking is cached in session using messageId from SSE done
        const cached = getSessionThinking('server-msg-1');
        expect(cached).not.toBeNull();
        expect(cached?.text).toBe(THINKING_TEXT);
        expect(cached?.elapsedMs).toBeTypeOf('number');
    });

    it('does NOT cache thinking when messageId is absent (graceful degradation)', async () => {
        mockChatService.addMessage
            .mockResolvedValueOnce({ id: 'msg-user-1', role: 'user', text: 'hi', createdAt: Timestamp.now() });

        mockPrepareContext.mockResolvedValueOnce({ appContext: [], persistedContext: [] });
        mockAiService.generateTitle.mockResolvedValueOnce('New Chat');

        // No onThought called → thinkingText stays empty
        mockAiService.sendMessage.mockResolvedValueOnce({ text: 'Hello', usedSummary: false });

        const store = buildStore();
        await store.getState().sendMessage('hi');

        // No model message persist
        const modelCalls = (mockChatService.addMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[3]?.role === 'model'
        );
        expect(modelCalls).toHaveLength(0);
    });
});

describe('retryLastMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        session.streamingNonce = 0;
        session.activeAbortController = null;
    });

    it('does NOT call addMessage at all on retry (no user persist, no AI persist)', async () => {
        const AI_TEXT = 'Retry response';

        mockChatService.clearLastError.mockResolvedValue(undefined);

        mockAiService.sendMessage.mockResolvedValueOnce({
            text: AI_TEXT,
            tokenUsage: undefined,
            toolCalls: undefined,
            usedSummary: false,
            messageId: 'server-retry-1',
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

        // Server persists AI response — client does NOT call addMessage at all during retry
        expect(mockChatService.addMessage).not.toHaveBeenCalled();
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

describe('sendMessage — abort creates ghost (no client persist)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        session.streamingNonce = 0;
        session.activeAbortController = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('sets stoppedResponse ghost on DOMException AbortError without persisting', async () => {
        mockChatService.addMessage
            .mockResolvedValueOnce({ id: 'msg-user-1', role: 'user', text: 'hi', createdAt: Timestamp.now() });

        mockPrepareContext.mockResolvedValueOnce({ appContext: [], persistedContext: [] });

        // Simulate abort: mock calls onStream with partial text, then throws AbortError
        mockAiService.sendMessage.mockImplementationOnce(async (params: Record<string, unknown>) => {
            const onStream = params.onStream as ((t: string) => void) | undefined;
            onStream?.('Partial AI text');
            throw new DOMException('The operation was aborted.', 'AbortError');
        });

        const store = buildStore();
        await store.getState().sendMessage('hi');

        const state = store.getState();
        // Ghost should be created from streaming state (captured before throw)
        expect(state.stoppedResponse).not.toBeNull();
        expect(state.stoppedResponse?.text).toBe('Partial AI text');

        // Only user message persisted — NO model message
        const modelCalls = (mockChatService.addMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[3]?.role === 'model'
        );
        expect(modelCalls).toHaveLength(0);
    });

    it('confirmLargePayload path: no ChatService.addMessage with role model', async () => {
        mockAiService.sendMessage.mockResolvedValueOnce({
            text: 'Confirmed response',
            usedSummary: false,
            messageId: 'server-msg-confirmed',
        });
        mockAiService.generateTitle.mockResolvedValueOnce('Chat');

        const store = buildStore({
            pendingLargePayloadConfirmation: {
                count: 20,
                text: 'test text',
                attachments: undefined,
                convId: 'conv-1',
                appContext: undefined,
                persistedContext: undefined,
            },
        });

        await store.getState().confirmLargePayload();

        // No addMessage calls at all (not even user — already persisted earlier)
        const modelCalls = (mockChatService.addMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) => call[3]?.role === 'model'
        );
        expect(modelCalls).toHaveLength(0);
    });
});

// =============================================================================
// Navigation Slice — chat panel open/close, view routing, active IDs
// =============================================================================

import type { ChatView } from '../../../types/chat/chat';
import type { ChatState } from '../types';
import { session } from '../session';

/** Tracks which conversation the memoriesSnapshot was frozen for — survives setActiveConversation(null) navigations. */
let frozenForConversationId: string | null = null;

export function createNavigationSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'isOpen'
    | 'view'
    | 'activeProjectId'
    | 'activeConversationId'
    | 'pendingConversationId'
    | 'toggleOpen'
    | 'setOpen'
    | 'setView'
    | 'setActiveProject'
    | 'setActiveConversation'
    | 'startNewChat'
> {
    return {
        // State
        isOpen: false,
        view: 'conversations' as ChatView,
        activeProjectId: null,
        activeConversationId: null,
        pendingConversationId: null,

        // Actions
        toggleOpen: () => set({ isOpen: !get().isOpen }),
        setOpen: (open) => set({ isOpen: open }),
        setView: (view) => set({ view }),
        setActiveProject: (id) => set({ activeProjectId: id, view: 'conversations' }),

        setActiveConversation: (id) => {
            // Invalidate any running stream's UI callbacks (stream itself keeps running)
            session.streamingNonce++;
            const shouldRefreshSnapshot = id !== null && id !== frozenForConversationId;
            if (shouldRefreshSnapshot) frozenForConversationId = id;
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
                stoppedResponse: null,
                isWaitingForServerResponse: false,
                error: null,
                hasMoreMessages: false,
                pendingLargePayloadConfirmation: null,
                // Freeze memories when entering a NEW conversation — returning to the same chat (even via conversation list) keeps the frozen snapshot
                ...(shouldRefreshSnapshot ? { memoriesSnapshot: get().memories } : {}),
            });
        },

        startNewChat: () => {
            // Invalidate any running stream's UI callbacks (stream itself keeps running)
            session.streamingNonce++;
            frozenForConversationId = null;
            set({
                activeConversationId: null,
                pendingConversationId: crypto.randomUUID(),
                pendingModel: null,
                pendingThinkingOptionId: null,
                view: 'chat',
                messages: [],
                isStreaming: false,
                streamingText: '',
                stoppedResponse: null,
                pendingLargePayloadConfirmation: null,
                // Freeze memories for this conversation — prevents cache invalidation when saveMemory updates Firestore mid-chat
                memoriesSnapshot: get().memories,
            });
        },
    };
}

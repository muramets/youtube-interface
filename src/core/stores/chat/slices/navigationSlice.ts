// =============================================================================
// Navigation Slice — chat panel open/close, view routing, active IDs
// =============================================================================

import type { ChatView } from '../../../types/chat/chat';
import type { ChatState } from '../types';
import { session } from '../session';

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
                error: null,
                hasMoreMessages: false,
                pendingLargePayloadConfirmation: null,
            });
        },

        startNewChat: () => {
            // Invalidate any running stream's UI callbacks (stream itself keeps running)
            session.streamingNonce++;
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
            });
        },
    };
}

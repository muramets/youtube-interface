// =============================================================================
// Message Slice — messages list, pagination, real-time subscription
// =============================================================================

import { ChatService, MESSAGE_PAGE_SIZE } from '../../../services/chatService';
import type { ChatState } from '../types';
import { requireContext } from '../helpers';

export function createMessageSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'messages'
    | 'hasMoreMessages'
    | 'isLoading'
    | 'subscribeToMessages'
    | 'loadOlderMessages'
> {
    return {
        // State
        messages: [],
        hasMoreMessages: false,
        isLoading: false,

        // Actions
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
    };
}

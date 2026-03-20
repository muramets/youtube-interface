// =============================================================================
// Message Slice — messages list, pagination, real-time subscription
// =============================================================================

import { ChatService, MESSAGE_PAGE_SIZE } from '../../../services/ai/chatService';
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

                if (isFirstLoad) {
                    isFirstLoad = false;

                    // "Fetch N+1" pattern: subscription requests PAGE_SIZE+1 docs.
                    // If we got more than PAGE_SIZE, there are older messages to load.
                    const hasMore = firestoreMessages.length > MESSAGE_PAGE_SIZE;
                    // Trim the extra probe element so the UI shows exactly PAGE_SIZE messages.
                    const trimmed = hasMore ? firestoreMessages.slice(1) : firestoreMessages;
                    const merged = [...trimmed, ...pendingOptimistic];

                    // Check for explicit server-side error signal on the conversation
                    const conv = get().conversations.find(c => c.id === conversationId);
                    if (conv?.lastError && !get().isStreaming) {
                        set({
                            messages: merged,
                            isLoading: false,
                            hasMoreMessages: hasMore,
                            error: conv.lastError.error,
                            lastFailedRequest: { text: conv.lastError.failedText || '', messageId: conv.lastError.messageId },
                        });
                    } else {
                        set({
                            messages: merged,
                            isLoading: false,
                            hasMoreMessages: hasMore,
                        });
                    }
                } else {
                    // Subsequent onSnapshot updates — use all messages as-is (no trimming).
                    // The subscription may return up to PAGE_SIZE+1 docs, but after first load
                    // new messages push the window forward, so all returned docs are relevant.
                    const merged = [...firestoreMessages, ...pendingOptimistic];

                    // Clear client-side ghost when a NEW model message arrives via onSnapshot.
                    // Count-based check avoids false positives from old stopped messages
                    // (previous abort'ed messages already in Firestore).
                    const prevModelCount = get().messages.filter(m => m.role === 'model').length;
                    const newModelCount = merged.filter(m => m.role === 'model').length;
                    const hasNewModelMessage = newModelCount > prevModelCount;
                    const shouldClearGhost = get().stoppedResponse !== null && hasNewModelMessage;
                    // When onSnapshot delivers the persisted AI message while streaming is
                    // still active, clear streaming state atomically — prevents a flash of
                    // duplicate content (streaming bubble + persisted message both visible).
                    const shouldClearStreaming = get().isStreaming && hasNewModelMessage;
                    set({
                        messages: merged,
                        isLoading: false,
                        ...(shouldClearGhost ? { stoppedResponse: null } : {}),
                        ...(shouldClearStreaming ? { isStreaming: false, streamingText: '', activeToolCalls: [], thinkingText: '' } : {}),
                    });
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
                const hasMore = older.length > MESSAGE_PAGE_SIZE;
                const trimmed = hasMore ? older.slice(0, MESSAGE_PAGE_SIZE) : older;
                set({
                    messages: [...trimmed, ...messages],
                    hasMoreMessages: hasMore,
                });
            } else {
                set({ hasMoreMessages: false });
            }
        },
    };
}

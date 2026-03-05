// =============================================================================
// Conversation Slice — conversations list, pagination, CRUD
// =============================================================================

import type { ChatConversation } from '../../../types/chat/chat';
import { ChatService, CONVERSATION_PAGE_SIZE } from '../../../services/ai/chatService';
import type { AppContextItem } from '../../../types/appContext';
import type { ChatState } from '../types';
import { requireContext } from '../helpers';

export function createConversationSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'conversations'
    | 'hasMoreConversations'
    | 'subscribeToConversations'
    | 'loadOlderConversations'
    | 'createConversation'
    | 'deleteConversation'
    | 'renameConversation'
    | 'moveConversation'
    | 'setConversationModel'
    | 'clearPersistedContext'
    | 'updatePersistedContext'
> {
    return {
        // State
        conversations: [],
        hasMoreConversations: false,

        // Actions
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

        createConversation: async (projectId: string | null): Promise<ChatConversation> => {
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

        clearPersistedContext: async (conversationId) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.clearPersistedContext(userId, channelId, conversationId);
        },

        updatePersistedContext: async (conversationId, items: AppContextItem[]) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.updateConversation(userId, channelId, conversationId, { persistedContext: items });
        },
    };
}

// =============================================================================
// Settings Slice — AI settings, memories, memorize/update/delete
// =============================================================================

import type { AiAssistantSettings, ConversationMemory } from '../../../types/chat/chat';
import { DEFAULT_AI_SETTINGS } from '../../../types/chat/chat';
import { ChatService } from '../../../services/ai/chatService';
import * as AiProxy from '../../../services/ai/aiProxyService';
import type { ChatState } from '../types';
import { requireContext } from '../helpers';

export function createSettingsSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'aiSettings'
    | 'memories'
    | 'subscribeToAiSettings'
    | 'subscribeToMemories'
    | 'saveAiSettings'
    | 'memorizeConversation'
    | 'updateMemory'
    | 'deleteMemory'
> {
    return {
        // State
        aiSettings: DEFAULT_AI_SETTINGS as AiAssistantSettings,
        memories: [] as ConversationMemory[],

        // Actions
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

        saveAiSettings: async (settings: Partial<AiAssistantSettings>) => {
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

            return AiProxy.concludeConversation(channelId, activeConversationId, guidance, model);
        },

        updateMemory: async (memoryId: string, content: string) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.updateMemory(userId, channelId, memoryId, content);
        },

        deleteMemory: async (memoryId: string) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.deleteMemory(userId, channelId, memoryId);
        },
    };
}

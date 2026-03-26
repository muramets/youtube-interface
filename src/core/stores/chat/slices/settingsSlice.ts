// =============================================================================
// Settings Slice — AI settings, memories, memorize/update/delete
// =============================================================================

import type { AiAssistantSettings, ConversationMemory } from '../../../types/chat/chat';
import { DEFAULT_AI_SETTINGS } from '../../../types/chat/chat';
import { ChatService } from '../../../services/ai/chatService';
import { CONCLUDE_INSTRUCTION } from '../../../config/concludePrompt';
import type { ChatState } from '../types';
import { requireContext } from '../helpers';
import { hasPendingRestoredSnapshot } from './navigationSlice';

export function createSettingsSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'aiSettings'
    | 'memories'
    | 'memoriesSnapshot'
    | 'subscribeToAiSettings'
    | 'subscribeToMemories'
    | 'saveAiSettings'
    | 'memorizeConversation'
    | 'createMemory'
    | 'updateMemory'
    | 'deleteMemory'
    | 'toggleMemoryProtected'
> {
    return {
        // State
        aiSettings: DEFAULT_AI_SETTINGS as AiAssistantSettings,
        memories: [] as ConversationMemory[],
        memoriesSnapshot: [] as ConversationMemory[],

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
                const update: Partial<ChatState> = { memories };
                // Populate snapshot on first load (handles race: memories arrive after conversation is already active)
                // Skip if a restored snapshot from sessionStorage is pending — it takes priority over live data
                if (get().memoriesSnapshot.length === 0 && memories.length > 0 && !hasPendingRestoredSnapshot()) {
                    update.memoriesSnapshot = memories;
                }
                set(update);
            });
        },

        saveAiSettings: async (settings: Partial<AiAssistantSettings>) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.saveAiSettings(userId, channelId, settings);
        },

        memorizeConversation: async (guidance?: string) => {
            const { activeConversationId } = get();
            if (!activeConversationId) {
                throw new Error('No active conversation to memorize');
            }

            const displayText = guidance
                ? `Memorize: ${guidance}`
                : 'Memorize this conversation';

            const backendText = guidance
                ? `${CONCLUDE_INSTRUCTION}\n\nUser guidance: ${guidance}`
                : CONCLUDE_INSTRUCTION;

            await get().sendMessage(displayText, undefined, undefined, undefined, {
                isConclude: true,
                backendText,
            });
        },

        createMemory: async (content: string, title?: string) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.createMemory(userId, channelId, content, title);
        },

        updateMemory: async (memoryId: string, content: string, title?: string) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.updateMemory(userId, channelId, memoryId, content, title);
        },

        deleteMemory: async (memoryId: string) => {
            const { userId, channelId } = requireContext(get);
            await ChatService.deleteMemory(userId, channelId, memoryId);
        },

        toggleMemoryProtected: async (memoryId: string) => {
            const { userId, channelId } = requireContext(get);
            const memory = get().memories.find(m => m.id === memoryId);
            if (!memory) return;
            await ChatService.toggleMemoryProtected(userId, channelId, memoryId, !memory.protected);
        },
    };
}

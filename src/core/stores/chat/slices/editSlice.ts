// =============================================================================
// Edit Slice — editing message state + Tier 3 reference override
// =============================================================================

import type { ChatMessage } from '../../../types/chat';
import { ChatService } from '../../../services/chatService';
import type { ChatState } from '../types';
import { requireContext } from '../helpers';

export function createEditSlice(
    set: (partial: Partial<ChatState>) => void,
    get: () => ChatState,
): Pick<
    ChatState,
    | 'editingMessage'
    | 'referenceSelectionMode'
    | 'setEditingMessage'
    | 'startReferenceSelection'
    | 'cancelReferenceSelection'
    | 'saveReferenceOverride'
> {
    return {
        // State
        editingMessage: null as ChatMessage | null,
        referenceSelectionMode: { active: false, messageId: null, originalNum: null },

        // Actions
        setEditingMessage: (msg) => set({ editingMessage: msg }),

        startReferenceSelection: (messageId, num) => {
            set({ referenceSelectionMode: { active: true, messageId, originalNum: num } });
        },

        cancelReferenceSelection: () => {
            set({ referenceSelectionMode: { active: false, messageId: null, originalNum: null } });
        },

        saveReferenceOverride: async (messageId, originalNum, newReferenceKey) => {
            const { userId, channelId } = requireContext(get);
            const { activeConversationId, messages } = get();
            if (!activeConversationId) return;

            // 1. Optimistic UI update
            const updatedMessages = messages.map(m => {
                if (m.id === messageId) {
                    return {
                        ...m,
                        overrides: { ...(m.overrides || {}), [originalNum]: newReferenceKey }
                    };
                }
                return m;
            });

            set({
                messages: updatedMessages,
                referenceSelectionMode: { active: false, messageId: null, originalNum: null }
            });

            // 2. Persist to Firestore
            const msgToUpdate = messages.find(m => m.id === messageId);
            if (msgToUpdate) {
                const newOverrides = { ...(msgToUpdate.overrides || {}), [originalNum]: newReferenceKey };
                await ChatService.updateMessage(userId, channelId, activeConversationId, messageId, { overrides: newOverrides });
            }
        },
    };
}

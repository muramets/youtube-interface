// =============================================================================
// Chat Store — orchestrator: composes all domain slices into a single store
// =============================================================================

import { create } from 'zustand';
import type { ChatState } from './types';
import { createNavigationSlice } from './slices/navigationSlice';
import { createProjectSlice } from './slices/projectSlice';
import { createConversationSlice } from './slices/conversationSlice';
import { createMessageSlice } from './slices/messageSlice';
import { createStreamingSlice } from './slices/streamingSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createEditSlice } from './slices/editSlice';
import { createSendSlice } from './slices/sendSlice';

export { getSessionThinking } from './session';
export type { ChatState } from './types';

export const useChatStore = create<ChatState>((set, get) => ({
    // Auth context
    userId: null,
    channelId: null,
    setContext: (userId, channelId) => set({ userId, channelId }),

    // Composed slices
    ...createNavigationSlice(set, get),
    ...createProjectSlice(set, get),
    ...createConversationSlice(set, get),
    ...createMessageSlice(set, get),
    ...createStreamingSlice(),
    ...createSettingsSlice(set, get),
    ...createEditSlice(set, get),
    ...createSendSlice(set, get),
}));

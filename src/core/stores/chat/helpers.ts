// =============================================================================
// Helpers — pure utility functions (no side effects, individually testable)
// =============================================================================

import type { AiAssistantSettings, ChatProject, ChatMessage } from '../../types/chat/chat';
import type { AppContextItem } from '../../types/appContext';
import { mergeContextItems } from '../../types/appContext';
import type { ChatState } from './types';

/** Helper: get context or throw */
export function requireContext(get: () => ChatState): { userId: string; channelId: string } {
    const { userId, channelId } = get();
    if (!userId || !channelId) throw new Error('Chat context not set. Call setContext first.');
    return { userId, channelId };
}

/** Resolve model from pendingModel → conversation → project → global → fallback. */
export function resolveModel(
    aiSettings: AiAssistantSettings,
    projects: ChatProject[],
    activeProjectId: string | null,
    conversationModel?: string,
    pendingModel?: string | null,
    conversationProjectId?: string | null,
): string {
    if (pendingModel) return pendingModel;
    if (conversationModel) return conversationModel;
    // Fallback: when entering via "All Chats", activeProjectId may be null
    // but the conversation knows its projectId — use it to find the project.
    const project = projects.find(p => p.id === activeProjectId)
        ?? (conversationProjectId ? projects.find(p => p.id === conversationProjectId) : undefined);
    return project?.model || aiSettings.defaultModel;
}

/** Rebuild persistedContext from surviving messages' appContext fields. */
export function rebuildPersistedContext(survivingMessages: ChatMessage[]): AppContextItem[] {
    let result: AppContextItem[] = [];
    for (const msg of survivingMessages) {
        if (msg.appContext && msg.appContext.length > 0) {
            result = mergeContextItems(result, msg.appContext);
        }
    }
    return result;
}

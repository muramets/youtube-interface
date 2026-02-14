// =============================================================================
// Chat Derived State — computed values from store state
// =============================================================================

import { useMemo } from 'react';
import type { ChatProject, ChatConversation, ChatMessage } from '../../../core/types/chat';
import { MODEL_REGISTRY, DEFAULT_MODEL, DEFAULT_CONTEXT_LIMIT } from '../../../core/types/chat';

interface UseChatDerivedStateOpts {
    projects: ChatProject[];
    conversations: ChatConversation[];
    messages: ChatMessage[];
    view: string;
    activeProjectId: string | null;
    activeConversationId: string | null;
    editingProject: ChatProject | null;
    defaultModel: string;
}

interface UseChatDerivedStateReturn {
    filteredConversations: ChatConversation[];
    activeProject: ChatProject | undefined;
    activeConversation: ChatConversation | undefined;
    headerTitle: string;
    totalTokens: number;
    contextUsed: number;
    contextPercent: number;
    isContextFull: boolean;
}

export function useChatDerivedState(opts: UseChatDerivedStateOpts): UseChatDerivedStateReturn {
    const { projects, conversations, messages, view, activeProjectId, activeConversationId, editingProject, defaultModel } = opts;

    const filteredConversations = activeProjectId
        ? conversations.filter(c => c.projectId === activeProjectId)
        : conversations;

    const activeProject = projects.find(p => p.id === activeProjectId);
    const activeConversation = conversations.find(c => c.id === activeConversationId);

    // Header title resolution
    let headerTitle = 'AI Chat';
    if (editingProject) headerTitle = editingProject.name;
    else if (view === 'projects') headerTitle = 'Projects';
    else if (view === 'conversations' && activeProject) headerTitle = activeProject.name;
    else if (view === 'conversations') headerTitle = 'All Chats';
    else if (view === 'chat' && activeConversation) headerTitle = activeConversation.title;

    // Token usage
    const totalTokens = useMemo(() =>
        messages.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens ?? 0), 0),
        [messages]
    );

    // Context window tracking
    const activeModel = activeProject?.model || defaultModel || DEFAULT_MODEL;
    const contextLimit = MODEL_REGISTRY.find(m => m.id === activeModel)?.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    const contextUsed = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'model' && messages[i].tokenUsage) {
                return messages[i].tokenUsage!.promptTokens;
            }
        }
        return 0;
    }, [messages]);
    const contextPercent = Math.min(100, Math.round((contextUsed / contextLimit) * 100));
    const isContextFull = contextPercent >= 100;

    return {
        filteredConversations,
        activeProject,
        activeConversation,
        headerTitle,
        totalTokens,
        contextUsed,
        contextPercent,
        isContextFull,
    };
}

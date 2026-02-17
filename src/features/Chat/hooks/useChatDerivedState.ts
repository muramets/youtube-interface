// =============================================================================
// Chat Derived State — computed values from store state
// =============================================================================

import { useMemo } from 'react';
import type { ChatProject, ChatConversation, ChatMessage } from '../../../core/types/chat';
import { MODEL_REGISTRY, DEFAULT_MODEL, DEFAULT_CONTEXT_LIMIT } from '../../../core/types/chat';
import { estimateCostEur, type ModelPricing } from '../../../../shared/models';

interface UseChatDerivedStateOpts {
    projects: ChatProject[];
    conversations: ChatConversation[];
    messages: ChatMessage[];
    view: string;
    activeProjectId: string | null;
    activeConversationId: string | null;
    editingProject: ChatProject | null;
    defaultModel: string;
    pendingModel: string | null;
}

interface UseChatDerivedStateReturn {
    filteredConversations: ChatConversation[];
    activeProject: ChatProject | undefined;
    activeConversation: ChatConversation | undefined;
    headerTitle: string;
    totalTokens: number;
    totalCostEur: number;
    modelPricing: ModelPricing;
    activeModel: string;
    modelLabel: string;
    contextUsed: number;
    contextPercent: number;
    isContextFull: boolean;
}

export function useChatDerivedState(opts: UseChatDerivedStateOpts): UseChatDerivedStateReturn {
    const { projects, conversations, messages, view, activeProjectId, activeConversationId, editingProject, defaultModel, pendingModel } = opts;

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

    // Model pricing
    const activeModel = pendingModel || activeConversation?.model || activeProject?.model || defaultModel || DEFAULT_MODEL;
    const modelConfig = MODEL_REGISTRY.find(m => m.id === activeModel) ?? MODEL_REGISTRY[0];
    const contextLimit = modelConfig.contextLimit ?? DEFAULT_CONTEXT_LIMIT;

    // Token usage
    const totalTokens = useMemo(() =>
        messages.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens ?? 0), 0),
        [messages]
    );

    // Total cost (EUR) across all AI messages
    const totalCostEur = useMemo(() =>
        messages.reduce((sum, m) => {
            if (m.role !== 'model' || !m.tokenUsage) return sum;
            return sum + estimateCostEur(
                modelConfig.pricing,
                m.tokenUsage.promptTokens,
                m.tokenUsage.completionTokens,
            );
        }, 0),
        [messages, modelConfig.pricing]
    );

    // Context window tracking
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
        totalCostEur,
        modelPricing: modelConfig.pricing,
        activeModel,
        modelLabel: modelConfig.label,
        contextUsed,
        contextPercent,
        isContextFull,
    };
}

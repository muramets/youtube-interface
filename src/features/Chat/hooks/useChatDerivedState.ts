// =============================================================================
// Chat Derived State — computed values from store state
// =============================================================================

import { useMemo } from 'react';
import type { ChatProject, ChatConversation, ChatMessage } from '../../../core/types/chat';
import { MODEL_REGISTRY, DEFAULT_MODEL, DEFAULT_CONTEXT_LIMIT, resolveModelId } from '../../../core/types/chat';
import { estimateCostEur, estimateCacheSavingsEur, type ModelPricing } from '../../../core/types/chat';

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
    totalSavingsEur: number;
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
    const activeModel = resolveModelId(pendingModel || activeConversation?.model || activeProject?.model || defaultModel || DEFAULT_MODEL, MODEL_REGISTRY);
    const modelConfig = MODEL_REGISTRY.find(m => m.id === activeModel) ?? MODEL_REGISTRY[0];
    const contextLimit = modelConfig.contextLimit ?? DEFAULT_CONTEXT_LIMIT;

    // Token usage (model responses only — user messages don't have tokenUsage)
    const totalTokens = useMemo(() =>
        messages.reduce((sum, m) => m.role === 'model' ? sum + (m.tokenUsage?.totalTokens ?? 0) : sum, 0),
        [messages]
    );

    // Total cost (EUR) — per-message model pricing, cache-aware
    const { totalCostEur, totalSavingsEur } = useMemo(() => {
        const fallbackConfig = MODEL_REGISTRY.find(m => m.id === activeModel) ?? MODEL_REGISTRY[0];
        return messages.reduce((acc, m) => {
            if (m.role !== 'model' || !m.tokenUsage) return acc;
            const msgModelConfig = (m.model && MODEL_REGISTRY.find(r => r.id === m.model)) || fallbackConfig;
            const { promptTokens, completionTokens, cachedTokens, cacheWriteTokens } = m.tokenUsage;
            return {
                totalCostEur: acc.totalCostEur + estimateCostEur(msgModelConfig.pricing, promptTokens, completionTokens, cachedTokens, cacheWriteTokens),
                totalSavingsEur: acc.totalSavingsEur + estimateCacheSavingsEur(msgModelConfig.pricing, promptTokens, completionTokens, cachedTokens, cacheWriteTokens),
            };
        }, { totalCostEur: 0, totalSavingsEur: 0 });
    }, [messages, activeModel]);

    // Context window tracking
    const contextUsed = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'model' && messages[i].tokenUsage) {
                const tu = messages[i].tokenUsage!;
                return tu.promptTokens + (tu.cachedTokens ?? 0) + (tu.cacheWriteTokens ?? 0);
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
        totalSavingsEur,
        modelPricing: modelConfig.pricing,
        activeModel,
        modelLabel: modelConfig.label,
        contextUsed,
        contextPercent,
        isContextFull,
    };
}

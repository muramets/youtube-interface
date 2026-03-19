// =============================================================================
// Chat Derived State — computed values from store state
// =============================================================================

import { useMemo } from 'react';
import type { ChatProject, ChatConversation, ChatMessage } from '../../../core/types/chat/chat';
import { MODEL_REGISTRY, DEFAULT_MODEL, DEFAULT_CONTEXT_LIMIT, HISTORY_BUDGET_RATIO, resolveModelId } from '../../../core/types/chat/chat';

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
    totalCost: number;
    totalSavings: number;

    activeModel: string;
    modelLabel: string;
    contextUsed: number;
    contextPercent: number;
    contextLimit: number;
    modelContextLimit: number;
    isContextFull: boolean;
}

export function useChatDerivedState(opts: UseChatDerivedStateOpts): UseChatDerivedStateReturn {
    const { projects, conversations, messages, view, activeProjectId, activeConversationId, editingProject, defaultModel, pendingModel } = opts;

    const filteredConversations = activeProjectId
        ? conversations.filter(c => c.projectId === activeProjectId)
        : conversations;

    const activeConversation = conversations.find(c => c.id === activeConversationId);
    // Fallback: when entering via "All Chats", activeProjectId is null
    // but the conversation knows its projectId — use it to find the project.
    const activeProject = projects.find(p => p.id === activeProjectId)
        ?? (activeConversation?.projectId
            ? projects.find(p => p.id === activeConversation.projectId)
            : undefined);

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
    const modelContextLimit = modelConfig.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    const contextLimit = modelContextLimit * (modelConfig.historyBudgetRatio ?? HISTORY_BUDGET_RATIO);

    // Token usage (model responses only — user messages don't have tokenUsage)
    const totalTokens = useMemo(() =>
        messages.reduce((sum, m) => {
            if (m.role !== 'model') return sum;
            if (m.normalizedUsage) {
                return sum + m.normalizedUsage.billing.input.total + m.normalizedUsage.billing.output.total;
            }
            return sum + (m.tokenUsage?.totalTokens ?? 0);
        }, 0),
        [messages]
    );

    // Total cost (USD) — per-message model pricing, cache-aware
    const { totalCost, totalSavings } = useMemo(() => {
        return messages.reduce((acc, m) => {
            if (m.role !== 'model') return acc;
            // Prefer normalizedUsage (accurate, provider-agnostic)
            if (m.normalizedUsage) {
                const cost = m.normalizedUsage.billing.cost.total;
                const savings = Math.max(0, m.normalizedUsage.billing.cost.withoutCache - cost);
                return {
                    totalCost: acc.totalCost + cost,
                    totalSavings: acc.totalSavings + savings,
                };
            }
            return acc;
        }, { totalCost: 0, totalSavings: 0 });
    }, [messages]);

    // Context window tracking
    const contextUsed = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.role === 'model') {
                // Prefer normalizedUsage (accurate, provider-agnostic)
                if (msg.normalizedUsage) {
                    return msg.normalizedUsage.contextWindow.inputTokens;
                }
                // Fallback to legacy formula
                if (msg.tokenUsage) {
                    const tu = msg.tokenUsage;
                    return tu.promptTokens + (tu.cachedTokens ?? 0) + (tu.cacheWriteTokens ?? 0);
                }
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
        totalCost,
        totalSavings,
        activeModel,
        modelLabel: modelConfig.label,
        contextUsed,
        contextPercent,
        contextLimit,
        modelContextLimit,
        isContextFull,
    };
}

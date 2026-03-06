import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { useChatDerivedState } from '../useChatDerivedState';
import type { ChatMessage } from '../../../../core/types/chat/chat';
import type { TokenUsage, NormalizedTokenUsage } from '../../../../../shared/models';
import { HISTORY_BUDGET_RATIO } from '../../../../../shared/models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockTimestamp = {
    seconds: 1000,
    nanoseconds: 0,
    toDate: () => new Date(1_000_000),
    toMillis: () => 1_000_000,
} as unknown as Timestamp;

function makeOpts(overrides: Partial<Parameters<typeof useChatDerivedState>[0]> = {}) {
    return {
        projects: [],
        conversations: [],
        messages: [],
        view: 'chat',
        activeProjectId: null,
        activeConversationId: null,
        editingProject: null,
        defaultModel: 'gemini-2.5-pro',
        pendingModel: null,
        ...overrides,
    };
}

function makeMessage(
    role: 'user' | 'model',
    tokenUsage?: TokenUsage,
    model?: string,
    normalizedUsage?: NormalizedTokenUsage,
): ChatMessage {
    return {
        id: `msg-${Math.random().toString(36).slice(2)}`,
        role,
        text: 'test',
        model,
        tokenUsage,
        normalizedUsage,
        createdAt: mockTimestamp,
    };
}

/** Minimal NormalizedTokenUsage stub for testing contextUsed extraction. */
function makeNormalizedUsage(inputTokens: number): NormalizedTokenUsage {
    return {
        contextWindow: {
            inputTokens,
            outputTokens: 500,
            thinkingTokens: 0,
            limit: 200_000,
            percent: (inputTokens / 200_000) * 100,
        },
        billing: {
            input: { total: inputTokens, fresh: inputTokens, cached: 0, cacheWrite: 0 },
            output: { total: 500, thinking: 0 },
            iterations: 1,
            cost: { input: 0, cached: 0, cacheWrite: 0, output: 0, total: 0, withoutCache: 0, thinkingSubset: 0 },
        },
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChatDerivedState — context tracking', () => {
    it('computes contextUsed as promptTokens + cachedTokens + cacheWriteTokens from last model message (legacy fallback)', () => {
        const messages: ChatMessage[] = [
            makeMessage('user'),
            makeMessage('model', {
                promptTokens: 1000,
                completionTokens: 300,
                totalTokens: 1300,
                cachedTokens: 500,
                cacheWriteTokens: 200,
            }),
        ];

        const { result } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages })),
        );

        // contextUsed = 1000 + 500 + 200 = 1700
        expect(result.current.contextUsed).toBe(1700);
    });

    it('contextLimit = modelConfig.contextLimit * HISTORY_BUDGET_RATIO (summarization threshold)', () => {
        const messages: ChatMessage[] = [
            makeMessage('user'),
            makeMessage('model', {
                promptTokens: 60_000,
                completionTokens: 5_000,
                totalTokens: 65_000,
                cachedTokens: 0,
                cacheWriteTokens: 0,
            }),
        ];

        // Claude: contextLimit = 200_000 * 0.6 = 120_000
        const { result: claudeResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );
        expect(claudeResult.current.contextLimit).toBe(200_000 * HISTORY_BUDGET_RATIO);
        expect(claudeResult.current.modelContextLimit).toBe(200_000);

        // Gemini: contextLimit = 1_000_000 * 0.6 = 600_000
        const { result: geminiResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'gemini-2.5-pro' })),
        );
        expect(geminiResult.current.contextLimit).toBe(1_000_000 * HISTORY_BUDGET_RATIO);
        expect(geminiResult.current.modelContextLimit).toBe(1_000_000);
    });

    it('computes contextPercent against summarization budget (contextLimit), not raw model limit', () => {
        const messages: ChatMessage[] = [
            makeMessage('user'),
            makeMessage(
                'model',
                {
                    promptTokens: 100_000,
                    completionTokens: 5_000,
                    totalTokens: 105_000,
                    cachedTokens: 50_000,
                    cacheWriteTokens: 10_000,
                },
                'claude-sonnet-4-6',
            ),
        ];

        // Use Claude model (contextLimit = 200_000 * 0.6 = 120_000)
        const { result } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );

        // contextUsed = 100_000 + 50_000 + 10_000 = 160_000
        // contextPercent = Math.min(100, Math.round(160_000 / 120_000 * 100)) = 100 (capped)
        expect(result.current.contextUsed).toBe(160_000);
        expect(result.current.contextPercent).toBe(100);
    });

    it('uses contextLimit from the active model in MODEL_REGISTRY (scaled by HISTORY_BUDGET_RATIO)', () => {
        const tokenUsage: TokenUsage = {
            promptTokens: 100_000,
            completionTokens: 5_000,
            totalTokens: 105_000,
            cachedTokens: 0,
            cacheWriteTokens: 0,
        };

        const messages: ChatMessage[] = [
            makeMessage('user'),
            makeMessage('model', tokenUsage),
        ];

        // With Claude model (contextLimit = 200_000 * 0.6 = 120_000)
        const { result: claudeResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );

        // With Gemini model (contextLimit = 1_000_000 * 0.6 = 600_000)
        const { result: geminiResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'gemini-2.5-pro' })),
        );

        // Same contextUsed (100_000) but different contextPercent
        expect(claudeResult.current.contextUsed).toBe(100_000);
        expect(geminiResult.current.contextUsed).toBe(100_000);

        // Claude: Math.round(100_000 / 120_000 * 100) = 83
        expect(claudeResult.current.contextPercent).toBe(83);

        // Gemini: Math.round(100_000 / 600_000 * 100) = 17
        expect(geminiResult.current.contextPercent).toBe(17);
    });

    it('prefers normalizedUsage.contextWindow.inputTokens over legacy tokenUsage', () => {
        const legacyTokenUsage: TokenUsage = {
            promptTokens: 5_000,
            completionTokens: 1_000,
            totalTokens: 6_000,
            cachedTokens: 2_000,
            cacheWriteTokens: 1_000,
        };
        // Legacy formula would give: 5_000 + 2_000 + 1_000 = 8_000
        // normalizedUsage says: 42_000
        const normalized = makeNormalizedUsage(42_000);

        const messages: ChatMessage[] = [
            makeMessage('user'),
            makeMessage('model', legacyTokenUsage, 'claude-sonnet-4-6', normalized),
        ];

        const { result } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );

        // Must use normalizedUsage, not legacy
        expect(result.current.contextUsed).toBe(42_000);
    });

    it('falls back to legacy formula when normalizedUsage is absent', () => {
        const messages: ChatMessage[] = [
            makeMessage('user'),
            makeMessage('model', {
                promptTokens: 10_000,
                completionTokens: 2_000,
                totalTokens: 12_000,
                cachedTokens: 3_000,
                cacheWriteTokens: 500,
            }),
        ];

        const { result } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages })),
        );

        // Legacy: 10_000 + 3_000 + 500 = 13_500
        expect(result.current.contextUsed).toBe(13_500);
    });
});

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import { useChatDerivedState } from '../useChatDerivedState';
import type { ChatMessage } from '../../../../core/types/chat/chat';
import type { TokenUsage, NormalizedTokenUsage } from '../../../../../shared/models';

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
            limit: 1_000_000,
            percent: (inputTokens / 1_000_000) * 100,
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

    it('contextLimit = modelConfig.contextLimit * historyBudgetRatio (per-model summarization threshold)', () => {
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

        // Claude: contextLimit = 1_000_000 * 0.85 = 850_000
        const { result: claudeResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );
        expect(claudeResult.current.contextLimit).toBe(1_000_000 * 0.85);
        expect(claudeResult.current.modelContextLimit).toBe(1_000_000);

        // Gemini: contextLimit = 1_000_000 * 0.85 = 850_000
        const { result: geminiResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'gemini-2.5-pro' })),
        );
        expect(geminiResult.current.contextLimit).toBe(1_000_000 * 0.85);
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

        // Use Claude model (contextLimit = 1_000_000 * 0.85 = 850_000)
        const { result } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );

        // contextUsed = 100_000 + 50_000 + 10_000 = 160_000
        // contextPercent = Math.round(160_000 / 850_000 * 100) = 19
        expect(result.current.contextUsed).toBe(160_000);
        expect(result.current.contextPercent).toBe(19);
    });

    it('uses contextLimit from the active model in MODEL_REGISTRY (scaled by per-model historyBudgetRatio)', () => {
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

        // With Claude model (contextLimit = 1_000_000 * 0.85 = 850_000)
        const { result: claudeResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );

        // With Gemini model (contextLimit = 1_000_000 * 0.85 = 850_000)
        const { result: geminiResult } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'gemini-2.5-pro' })),
        );

        // Same contextUsed (100_000) and same contextPercent (both 1M * 0.85 = 850K)
        expect(claudeResult.current.contextUsed).toBe(100_000);
        expect(geminiResult.current.contextUsed).toBe(100_000);

        // Claude: Math.round(100_000 / 850_000 * 100) = 12
        expect(claudeResult.current.contextPercent).toBe(12);

        // Gemini: Math.round(100_000 / 850_000 * 100) = 12
        expect(geminiResult.current.contextPercent).toBe(12);
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

    it('ignores messages without normalizedUsage (legacy-only tokenUsage)', () => {
        const legacyMsg = makeMessage('model', {
            promptTokens: 10_000,
            completionTokens: 2_000,
            totalTokens: 12_000,
        }, 'gemini-2.5-pro');
        const normalizedMsg = makeMessage('model', undefined, 'claude-sonnet-4-6', {
            contextWindow: { inputTokens: 50_000, outputTokens: 3_000, thinkingTokens: 0, limit: 1_000_000, percent: 5 },
            billing: {
                input: { total: 50_000, fresh: 40_000, cached: 10_000, cacheWrite: 0 },
                output: { total: 3_000, thinking: 0 },
                iterations: 1,
                cost: { input: 0.20, cached: 0.005, cacheWrite: 0, output: 0.075, total: 0.28, withoutCache: 0.35, thinkingSubset: 0 },
            },
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
        });

        const messages: ChatMessage[] = [makeMessage('user'), legacyMsg, makeMessage('user'), normalizedMsg];

        const { result } = renderHook(() =>
            useChatDerivedState(makeOpts({ messages, defaultModel: 'claude-sonnet-4-6' })),
        );

        // Legacy message (no normalizedUsage) is skipped — only normalized $0.28 counted
        expect(result.current.totalCost).toBeCloseTo(0.28, 4);
        // contextUsed from last model message (normalizedMsg)
        expect(result.current.contextUsed).toBe(50_000);
    });
});

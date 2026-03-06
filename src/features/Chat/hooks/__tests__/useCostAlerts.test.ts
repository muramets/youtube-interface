import { describe, it, expect } from 'vitest';
import {
    estimateAlternativeCost,
    COST_THRESHOLD_LOW,
    COST_THRESHOLD_MEDIUM,
    COST_THRESHOLD_HIGH,
    RECOMMENDATION_SAVINGS_MIN,
} from '../useCostAlerts';
import type { ChatMessage } from '../../../../core/types/chat/chat';
import type { ModelPricing, NormalizedTokenUsage } from '../../../../../shared/models';

function makeModelMsg(cost: number, id?: string): ChatMessage {
    return {
        id: id ?? `msg-${Math.random()}`,
        role: 'model',
        text: 'response',
        createdAt: Date.now(),
        normalizedUsage: {
            provider: 'anthropic',
            model: 'test-model',
            billing: {
                input: { total: 10000, fresh: 8000, cached: 2000, cacheWrite: 0 },
                output: { total: 1000, thinking: 0 },
                cost: { total: cost, withoutCache: cost * 1.2, thinkingSubset: 0 },
            },
            contextWindow: { inputTokens: 10000, limit: 200000, percent: 5 },
        } as NormalizedTokenUsage,
    } as unknown as ChatMessage;
}

describe('Cost Alerts', () => {
    describe('thresholds', () => {
        it('defines thresholds in ascending order', () => {
            expect(COST_THRESHOLD_LOW).toBeLessThan(COST_THRESHOLD_MEDIUM);
            expect(COST_THRESHOLD_MEDIUM).toBeLessThan(COST_THRESHOLD_HIGH);
        });

        it('recommendation savings minimum is 30%', () => {
            expect(RECOMMENDATION_SAVINGS_MIN).toBe(0.30);
        });
    });

    describe('estimateAlternativeCost', () => {
        const cheapPricing: ModelPricing = {
            inputPerMillion: 0.25,
            outputPerMillion: 1.25,
        };

        const expensivePricing: ModelPricing = {
            inputPerMillion: 3.0,
            outputPerMillion: 15.0,
        };

        it('returns 0 for empty messages', () => {
            expect(estimateAlternativeCost([], cheapPricing)).toBe(0);
        });

        it('skips user messages', () => {
            const msgs: ChatMessage[] = [
                { id: '1', role: 'user', text: 'hi', createdAt: Date.now() } as unknown as ChatMessage,
            ];
            expect(estimateAlternativeCost(msgs, cheapPricing)).toBe(0);
        });

        it('skips messages without normalizedUsage', () => {
            const msgs: ChatMessage[] = [
                { id: '1', role: 'model', text: 'hi', createdAt: Date.now() } as unknown as ChatMessage,
            ];
            expect(estimateAlternativeCost(msgs, cheapPricing)).toBe(0);
        });

        it('computes cost using provided pricing', () => {
            const msgs = [makeModelMsg(1.0)];
            const cheapCost = estimateAlternativeCost(msgs, cheapPricing);
            const expensiveCost = estimateAlternativeCost(msgs, expensivePricing);
            // Cheap should be less than expensive
            expect(cheapCost).toBeLessThan(expensiveCost);
            // Both should be > 0
            expect(cheapCost).toBeGreaterThan(0);
            expect(expensiveCost).toBeGreaterThan(0);
        });

        it('sums costs across multiple messages', () => {
            const msgs = [makeModelMsg(1.0), makeModelMsg(2.0)];
            const singleCost = estimateAlternativeCost([msgs[0]], cheapPricing);
            const doubleCost = estimateAlternativeCost(msgs, cheapPricing);
            // Double should be ~2x single (same token structure)
            expect(doubleCost).toBeCloseTo(singleCost * 2, 5);
        });

        it('uses iterationDetails when present (multi-iteration)', () => {
            const iter1 = {
                input: { total: 10_000, fresh: 8_000, cached: 2_000, cacheWrite: 0 },
                output: { total: 1_000, thinking: 0 },
                cost: { input: 0.04, cached: 0.001, cacheWrite: 0, output: 0.025, total: 0.066, withoutCache: 0.08, thinkingSubset: 0 },
            };
            const iter2 = {
                input: { total: 15_000, fresh: 5_000, cached: 10_000, cacheWrite: 0 },
                output: { total: 2_000, thinking: 500 },
                cost: { input: 0.025, cached: 0.005, cacheWrite: 0, output: 0.05, total: 0.08, withoutCache: 0.1, thinkingSubset: 0.0125 },
            };

            const msg: ChatMessage = {
                id: 'multi-iter',
                role: 'model',
                text: 'response',
                createdAt: Date.now(),
                normalizedUsage: {
                    provider: 'anthropic',
                    model: 'test-model',
                    billing: {
                        input: { total: 25_000, fresh: 13_000, cached: 12_000, cacheWrite: 0 },
                        output: { total: 3_000, thinking: 500 },
                        iterations: 2,
                        cost: { total: 0.146, withoutCache: 0.18, thinkingSubset: 0.0125 },
                    },
                    contextWindow: { inputTokens: 15_000, limit: 200_000, percent: 7.5 },
                    iterationDetails: [iter1, iter2],
                } as NormalizedTokenUsage,
            } as unknown as ChatMessage;

            const costCheap = estimateAlternativeCost([msg], cheapPricing);
            const costExpensive = estimateAlternativeCost([msg], expensivePricing);

            // Should compute per-iteration, not per-aggregate
            expect(costCheap).toBeGreaterThan(0);
            expect(costExpensive).toBeGreaterThan(costCheap);
        });
    });
});

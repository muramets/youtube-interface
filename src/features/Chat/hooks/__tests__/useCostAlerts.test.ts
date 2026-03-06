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
    });
});

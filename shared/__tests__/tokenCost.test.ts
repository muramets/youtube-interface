import { describe, it, expect } from 'vitest';
import {
    computeIterationCost,
    aggregateIterations,
    LONG_CONTEXT_THRESHOLD,
    HISTORY_BUDGET_RATIO,
    type IterationSnapshot,
    type ModelPricing,
} from '../models';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLAUDE_PRICING: ModelPricing = {
    inputPerMillion: 5.00,
    outputPerMillion: 25.00,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 2.0,
};

const GEMINI_PRICING: ModelPricing = {
    inputPerMillion: 1.25,
    outputPerMillion: 10.00,
    inputPerMillionLong: 2.50,
    outputPerMillionLong: 15.00,
};

function makeSnapshot(
    input: { total: number; fresh: number; cached: number; cacheWrite: number },
    output: { total: number; thinking: number },
    pricing: ModelPricing,
): IterationSnapshot {
    return {
        input,
        output,
        cost: computeIterationCost(pricing, { input, output }),
    };
}

// =============================================================================
// HISTORY_BUDGET_RATIO
// =============================================================================

describe('HISTORY_BUDGET_RATIO', () => {
    it('is exported and equals 0.6', () => {
        expect(HISTORY_BUDGET_RATIO).toBe(0.6);
    });
});

// =============================================================================
// computeIterationCost
// =============================================================================

describe('computeIterationCost', () => {
    it('computes standard pricing for Claude (no cache)', () => {
        const tokens = {
            input: { total: 10_000, fresh: 10_000, cached: 0, cacheWrite: 0 },
            output: { total: 2_000, thinking: 0 },
        };
        const cost = computeIterationCost(CLAUDE_PRICING, tokens);

        // input: 10K / 1M * $5 = $0.05
        // output: 2K / 1M * $25 = $0.05
        expect(cost.input).toBeCloseTo(0.05, 6);
        expect(cost.output).toBeCloseTo(0.05, 6);
        expect(cost.cached).toBe(0);
        expect(cost.cacheWrite).toBe(0);
        expect(cost.total).toBeCloseTo(0.10, 6);
        expect(cost.withoutCache).toBeCloseTo(0.10, 6); // same as total, no cache
        expect(cost.thinkingSubset).toBe(0);
    });

    it('computes cache pricing for Claude', () => {
        const tokens = {
            input: { total: 50_000, fresh: 5_000, cached: 40_000, cacheWrite: 5_000 },
            output: { total: 1_000, thinking: 0 },
        };
        const cost = computeIterationCost(CLAUDE_PRICING, tokens);

        // inputRate = $5 (under 200K threshold)
        // fresh: 5K / 1M * $5 = $0.025
        // cached: 40K / 1M * ($5 * 0.1) = 40K / 1M * $0.50 = $0.02
        // cacheWrite: 5K / 1M * ($5 * 2.0) = 5K / 1M * $10 = $0.05
        // output: 1K / 1M * $25 = $0.025
        expect(cost.input).toBeCloseTo(0.025, 6);
        expect(cost.cached).toBeCloseTo(0.02, 6);
        expect(cost.cacheWrite).toBeCloseTo(0.05, 6);
        expect(cost.output).toBeCloseTo(0.025, 6);
        expect(cost.total).toBeCloseTo(0.12, 6);

        // withoutCache: all 50K at full input price + output
        // 50K / 1M * $5 + $0.025 = $0.275
        expect(cost.withoutCache).toBeCloseTo(0.275, 6);
    });

    it('applies long context pricing when input exceeds threshold', () => {
        const tokens = {
            input: { total: 250_000, fresh: 250_000, cached: 0, cacheWrite: 0 },
            output: { total: 5_000, thinking: 0 },
        };
        expect(tokens.input.total).toBeGreaterThan(LONG_CONTEXT_THRESHOLD);

        const cost = computeIterationCost(GEMINI_PRICING, tokens);

        // Long context: inputRate = $2.50, outputRate = $15
        // input: 250K / 1M * $2.50 = $0.625
        // output: 5K / 1M * $15 = $0.075
        expect(cost.input).toBeCloseTo(0.625, 6);
        expect(cost.output).toBeCloseTo(0.075, 6);
        expect(cost.total).toBeCloseTo(0.70, 6);
    });

    it('uses standard pricing at exactly the threshold', () => {
        const tokens = {
            input: { total: LONG_CONTEXT_THRESHOLD, fresh: LONG_CONTEXT_THRESHOLD, cached: 0, cacheWrite: 0 },
            output: { total: 1_000, thinking: 0 },
        };
        const cost = computeIterationCost(GEMINI_PRICING, tokens);

        // At threshold (not above) → standard pricing: $1.25
        // 200K / 1M * $1.25 = $0.25
        expect(cost.input).toBeCloseTo(0.25, 6);
    });

    it('computes thinking subset correctly', () => {
        const tokens = {
            input: { total: 10_000, fresh: 10_000, cached: 0, cacheWrite: 0 },
            output: { total: 5_000, thinking: 3_000 },
        };
        const cost = computeIterationCost(CLAUDE_PRICING, tokens);

        // thinkingSubset: 3K / 1M * $25 = $0.075
        // output total: 5K / 1M * $25 = $0.125
        expect(cost.thinkingSubset).toBeCloseTo(0.075, 6);
        expect(cost.output).toBeCloseTo(0.125, 6);
        // thinkingSubset is subset of output, NOT additive
        expect(cost.thinkingSubset).toBeLessThan(cost.output);
    });

    it('handles model without cache multipliers (defaults to 1x)', () => {
        const noCachePricing: ModelPricing = {
            inputPerMillion: 0.50,
            outputPerMillion: 3.00,
        };
        const tokens = {
            input: { total: 20_000, fresh: 5_000, cached: 10_000, cacheWrite: 5_000 },
            output: { total: 1_000, thinking: 0 },
        };
        const cost = computeIterationCost(noCachePricing, tokens);

        // No cache multipliers → all at input rate ($0.50)
        // fresh: 5K / 1M * $0.50 = $0.0025
        // cached: 10K / 1M * $0.50 * 1.0 = $0.005
        // cacheWrite: 5K / 1M * $0.50 * 1.0 = $0.0025
        expect(cost.input).toBeCloseTo(0.0025, 6);
        expect(cost.cached).toBeCloseTo(0.005, 6);
        expect(cost.cacheWrite).toBeCloseTo(0.0025, 6);
    });

    it('handles zero tokens gracefully', () => {
        const tokens = {
            input: { total: 0, fresh: 0, cached: 0, cacheWrite: 0 },
            output: { total: 0, thinking: 0 },
        };
        const cost = computeIterationCost(CLAUDE_PRICING, tokens);

        expect(cost.total).toBe(0);
        expect(cost.withoutCache).toBe(0);
        expect(cost.thinkingSubset).toBe(0);
    });
});

// =============================================================================
// aggregateIterations
// =============================================================================

describe('aggregateIterations', () => {
    const claudeModel = { id: 'claude-opus-4-6', provider: 'anthropic' as const, contextLimit: 200_000 };
    const geminiModel = { id: 'gemini-2.5-pro', provider: 'gemini' as const, contextLimit: 1_000_000 };

    it('handles single iteration', () => {
        const snapshot = makeSnapshot(
            { total: 10_000, fresh: 5_000, cached: 4_000, cacheWrite: 1_000 },
            { total: 2_000, thinking: 500 },
            CLAUDE_PRICING,
        );
        const result = aggregateIterations([snapshot], claudeModel);

        expect(result.billing.iterations).toBe(1);
        expect(result.billing.input.total).toBe(10_000);
        expect(result.billing.output.thinking).toBe(500);
        expect(result.contextWindow.inputTokens).toBe(10_000);
        expect(result.contextWindow.limit).toBe(200_000);
        expect(result.iterationDetails).toBeUndefined(); // single iteration → no details
        expect(result.provider).toBe('anthropic');
        expect(result.model).toBe('claude-opus-4-6');
    });

    it('sums 3 iterations correctly', () => {
        const s1 = makeSnapshot(
            { total: 10_000, fresh: 8_000, cached: 1_000, cacheWrite: 1_000 },
            { total: 3_000, thinking: 1_000 },
            CLAUDE_PRICING,
        );
        const s2 = makeSnapshot(
            { total: 15_000, fresh: 5_000, cached: 9_000, cacheWrite: 1_000 },
            { total: 2_000, thinking: 500 },
            CLAUDE_PRICING,
        );
        const s3 = makeSnapshot(
            { total: 20_000, fresh: 5_000, cached: 14_000, cacheWrite: 1_000 },
            { total: 4_000, thinking: 2_000 },
            CLAUDE_PRICING,
        );

        const result = aggregateIterations([s1, s2, s3], claudeModel);

        expect(result.billing.iterations).toBe(3);
        expect(result.billing.input.total).toBe(45_000);
        expect(result.billing.input.fresh).toBe(18_000);
        expect(result.billing.input.cached).toBe(24_000);
        expect(result.billing.input.cacheWrite).toBe(3_000);
        expect(result.billing.output.total).toBe(9_000);
        expect(result.billing.output.thinking).toBe(3_500);
        expect(result.billing.cost.total).toBeCloseTo(
            s1.cost.total + s2.cost.total + s3.cost.total, 6,
        );
        expect(result.iterationDetails).toHaveLength(3);
    });

    it('contextWindow uses LAST iteration, not aggregate', () => {
        const s1 = makeSnapshot(
            { total: 10_000, fresh: 10_000, cached: 0, cacheWrite: 0 },
            { total: 3_000, thinking: 0 },
            CLAUDE_PRICING,
        );
        const s2 = makeSnapshot(
            { total: 25_000, fresh: 5_000, cached: 20_000, cacheWrite: 0 },
            { total: 5_000, thinking: 2_000 },
            CLAUDE_PRICING,
        );

        const result = aggregateIterations([s1, s2], claudeModel);

        // contextWindow from s2 (last)
        expect(result.contextWindow.inputTokens).toBe(25_000);
        expect(result.contextWindow.outputTokens).toBe(5_000);
        expect(result.contextWindow.thinkingTokens).toBe(2_000);
    });

    it('percent is FLOAT, not rounded', () => {
        const snapshot = makeSnapshot(
            { total: 99_750, fresh: 99_750, cached: 0, cacheWrite: 0 },
            { total: 1_000, thinking: 0 },
            CLAUDE_PRICING,
        );
        const result = aggregateIterations([snapshot], claudeModel);

        // 99750 / 200000 * 100 = 49.875
        expect(result.contextWindow.percent).toBe(49.875);
        expect(Number.isInteger(result.contextWindow.percent)).toBe(false);
    });

    it('maps gemini provider to google', () => {
        const snapshot = makeSnapshot(
            { total: 10_000, fresh: 10_000, cached: 0, cacheWrite: 0 },
            { total: 1_000, thinking: 0 },
            GEMINI_PRICING,
        );
        const result = aggregateIterations([snapshot], geminiModel);

        expect(result.provider).toBe('google');
        expect(result.model).toBe('gemini-2.5-pro');
    });
});

import { describe, it, expect } from 'vitest';
import { computeIterationCost } from '../models';

/** Gemini pricing WITH cacheReadMultiplier (Stage 3 — all Gemini models). */
const GEMINI_PRICING = {
    inputPerMillion: 1.25,
    outputPerMillion: 10.00,
    inputPerMillionLong: 2.50,
    outputPerMillionLong: 15.00,
    cacheReadMultiplier: 0.1,
};

const CLAUDE_SONNET_PRICING = {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 2.0,
};

describe('computeIterationCost', () => {
    it('Gemini: cached tokens at 0.1x input rate', () => {
        const tokens = {
            input: { total: 100_000, fresh: 20_000, cached: 80_000, cacheWrite: 0 },
            output: { total: 5_000, thinking: 0 },
        };
        const cost = computeIterationCost(GEMINI_PRICING, tokens);
        const freshCost = (20_000 / 1e6) * 1.25;
        const cachedCost = (80_000 / 1e6) * 1.25 * 0.1;
        const outputCost = (5_000 / 1e6) * 10.00;
        expect(cost.input).toBeCloseTo(freshCost, 6);
        expect(cost.cached).toBeCloseTo(cachedCost, 6);
        expect(cost.output).toBeCloseTo(outputCost, 6);
        expect(cost.total).toBeCloseTo(freshCost + cachedCost + outputCost, 6);
    });

    it('Gemini: cacheWrite at 1.0x (no write multiplier)', () => {
        const tokens = {
            input: { total: 50_000, fresh: 0, cached: 0, cacheWrite: 50_000 },
            output: { total: 1_000, thinking: 0 },
        };
        const cost = computeIterationCost(GEMINI_PRICING, tokens);
        const writeCost = (50_000 / 1e6) * 1.25 * 1.0;
        expect(cost.cacheWrite).toBeCloseTo(writeCost, 6);
    });

    it('Gemini: withoutCache is full input at standard rate', () => {
        const tokens = {
            input: { total: 100_000, fresh: 10_000, cached: 90_000, cacheWrite: 0 },
            output: { total: 5_000, thinking: 0 },
        };
        const cost = computeIterationCost(GEMINI_PRICING, tokens);
        const withoutCache = (100_000 / 1e6) * 1.25 + (5_000 / 1e6) * 10.00;
        expect(cost.withoutCache).toBeCloseTo(withoutCache, 6);
        expect(cost.withoutCache - cost.total).toBeGreaterThan(0);
    });

    it('Gemini: long-context rates apply to both fresh AND cached', () => {
        const tokens = {
            input: { total: 250_000, fresh: 50_000, cached: 200_000, cacheWrite: 0 },
            output: { total: 10_000, thinking: 0 },
        };
        const cost = computeIterationCost(GEMINI_PRICING, tokens);
        const freshCost = (50_000 / 1e6) * 2.50;
        const cachedCost = (200_000 / 1e6) * 2.50 * 0.1;
        const outputCost = (10_000 / 1e6) * 15.00;
        expect(cost.input).toBeCloseTo(freshCost, 6);
        expect(cost.cached).toBeCloseTo(cachedCost, 6);
        expect(cost.output).toBeCloseTo(outputCost, 6);
        expect(cost.total).toBeCloseTo(freshCost + cachedCost + outputCost, 6);
    });

    it('Claude: cache read 0.1x + cache write 2.0x', () => {
        const tokens = {
            input: { total: 100_000, fresh: 10_000, cached: 80_000, cacheWrite: 10_000 },
            output: { total: 5_000, thinking: 0 },
        };
        const cost = computeIterationCost(CLAUDE_SONNET_PRICING, tokens);
        const freshCost = (10_000 / 1e6) * 3.00;
        const cachedCost = (80_000 / 1e6) * 3.00 * 0.1;
        const writeCost = (10_000 / 1e6) * 3.00 * 2.0;
        const outputCost = (5_000 / 1e6) * 15.00;
        expect(cost.input).toBeCloseTo(freshCost, 6);
        expect(cost.cached).toBeCloseTo(cachedCost, 6);
        expect(cost.cacheWrite).toBeCloseTo(writeCost, 6);
        expect(cost.total).toBeCloseTo(freshCost + cachedCost + writeCost + outputCost, 6);
    });

    it('no cache multipliers — defaults to 1.0x', () => {
        const pricing = { inputPerMillion: 1.00, outputPerMillion: 1.00 };
        const tokens = {
            input: { total: 100_000, fresh: 50_000, cached: 50_000, cacheWrite: 0 },
            output: { total: 10_000, thinking: 0 },
        };
        const cost = computeIterationCost(pricing, tokens);
        // Both fresh and cached at 1.0x — same as full price
        expect(cost.total).toBeCloseTo(cost.withoutCache, 6);
    });

    it('zero tokens — all costs are zero', () => {
        const tokens = {
            input: { total: 0, fresh: 0, cached: 0, cacheWrite: 0 },
            output: { total: 0, thinking: 0 },
        };
        const cost = computeIterationCost(GEMINI_PRICING, tokens);
        expect(cost.total).toBe(0);
        expect(cost.withoutCache).toBe(0);
    });

    it('thinking tokens produce thinkingSubset cost', () => {
        const tokens = {
            input: { total: 10_000, fresh: 10_000, cached: 0, cacheWrite: 0 },
            output: { total: 5_000, thinking: 3_000 },
        };
        const cost = computeIterationCost(GEMINI_PRICING, tokens);
        const thinkingCost = (3_000 / 1e6) * 10.00;
        expect(cost.thinkingSubset).toBeCloseTo(thinkingCost, 6);
    });
});

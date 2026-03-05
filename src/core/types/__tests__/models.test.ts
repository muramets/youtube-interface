import { describe, it, expect } from 'vitest';
import { estimateCostEur, estimateCacheSavingsEur, USD_TO_EUR } from '../../../../shared/models';

// Use a consistent test pricing fixture
const CLAUDE_SONNET_PRICING = {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 2.0,
};

const GEMINI_PRICING = {
    inputPerMillion: 1.25,
    outputPerMillion: 10.00,
    inputPerMillionLong: 2.50,
    outputPerMillionLong: 15.00,
};

const SIMPLE_PRICING = {
    inputPerMillion: 1.00,
    outputPerMillion: 1.00,
};

describe('estimateCostEur', () => {
    it('calculates basic cost without cache (backward compatibility)', () => {
        const cost = estimateCostEur(SIMPLE_PRICING, 1_000_000, 1_000_000);
        // 1M input * $1/M + 1M output * $1/M = $2 * EUR rate
        expect(cost).toBeCloseTo(2.0 * USD_TO_EUR, 4);
    });

    it('returns 0 for zero tokens', () => {
        expect(estimateCostEur(SIMPLE_PRICING, 0, 0)).toBe(0);
    });

    it('applies cache read multiplier (0.1x)', () => {
        // 0 uncached + 1M cached at 0.1x + 0 output
        const cost = estimateCostEur(CLAUDE_SONNET_PRICING, 0, 0, 1_000_000, 0);
        const expected = (1_000_000 / 1_000_000) * 3.00 * 0.1 * USD_TO_EUR;
        expect(cost).toBeCloseTo(expected, 6);
    });

    it('applies cache write multiplier (2.0x)', () => {
        // 0 uncached + 0 cached + 1M write at 2.0x + 0 output
        const cost = estimateCostEur(CLAUDE_SONNET_PRICING, 0, 0, 0, 1_000_000);
        const expected = (1_000_000 / 1_000_000) * 3.00 * 2.0 * USD_TO_EUR;
        expect(cost).toBeCloseTo(expected, 6);
    });

    it('combines uncached, cached read, and cache write tokens', () => {
        // 500K uncached + 300K cached + 200K write + 100K output
        const cost = estimateCostEur(CLAUDE_SONNET_PRICING, 500_000, 100_000, 300_000, 200_000);
        const inputCost = (500_000 / 1e6) * 3.00;
        const cacheCost = (300_000 / 1e6) * 3.00 * 0.1;
        const writeCost = (200_000 / 1e6) * 3.00 * 2.0;
        const outputCost = (100_000 / 1e6) * 15.00;
        expect(cost).toBeCloseTo((inputCost + cacheCost + writeCost + outputCost) * USD_TO_EUR, 6);
    });

    it('uses long-context pricing when total input > 200K', () => {
        // 150K uncached + 100K cached = 250K total > 200K threshold
        const cost = estimateCostEur(GEMINI_PRICING, 150_000, 50_000, 100_000);
        const inputCost = (150_000 / 1e6) * 2.50; // long rate
        const cacheCost = (100_000 / 1e6) * 2.50 * 1; // no multiplier = 1x
        const outputCost = (50_000 / 1e6) * 15.00; // long output rate
        expect(cost).toBeCloseTo((inputCost + cacheCost + outputCost) * USD_TO_EUR, 6);
    });

    it('uses standard pricing when total input <= 200K', () => {
        const cost = estimateCostEur(GEMINI_PRICING, 100_000, 50_000);
        const inputCost = (100_000 / 1e6) * 1.25; // standard rate
        const outputCost = (50_000 / 1e6) * 10.00; // standard output rate
        expect(cost).toBeCloseTo((inputCost + outputCost) * USD_TO_EUR, 6);
    });

    it('falls back to multiplier=1 when no cache multipliers defined', () => {
        // Gemini pricing has no cacheReadMultiplier — cached tokens charged at full input price
        const withCache = estimateCostEur(GEMINI_PRICING, 50_000, 50_000, 50_000);
        const withoutCache = estimateCostEur(GEMINI_PRICING, 100_000, 50_000);
        expect(withCache).toBeCloseTo(withoutCache, 6);
    });

    it('handles undefined cache params gracefully', () => {
        const a = estimateCostEur(SIMPLE_PRICING, 1000, 500);
        const b = estimateCostEur(SIMPLE_PRICING, 1000, 500, undefined, undefined);
        expect(a).toBe(b);
    });
});

describe('estimateCacheSavingsEur', () => {
    it('returns 0 when no cache data', () => {
        expect(estimateCacheSavingsEur(CLAUDE_SONNET_PRICING, 1000, 500)).toBe(0);
        expect(estimateCacheSavingsEur(CLAUDE_SONNET_PRICING, 1000, 500, undefined, undefined)).toBe(0);
    });

    it('returns positive savings with cache read hits', () => {
        // 10K uncached + 90K cached = 100K total
        // Hypothetical: 100K at full price
        // Actual: 10K at full + 90K at 0.1x
        const savings = estimateCacheSavingsEur(CLAUDE_SONNET_PRICING, 10_000, 5_000, 90_000);
        expect(savings).toBeGreaterThan(0);
    });

    it('returns 0 on first message (only cache write, no reads)', () => {
        // First msg: 0 uncached (all goes to write), 100K write at 2.0x
        // Hypothetical: 100K at 1.0x = $0.30
        // Actual: 100K at 2.0x = $0.60 — MORE expensive
        // Math.max(0, hypothetical - actual) = 0
        const savings = estimateCacheSavingsEur(CLAUDE_SONNET_PRICING, 0, 5_000, 0, 100_000);
        expect(savings).toBe(0);
    });

    it('savings are positive when cache reads outweigh write cost', () => {
        // Typical 2nd+ message: 10K new + 80K cached + 10K write
        const savings = estimateCacheSavingsEur(CLAUDE_SONNET_PRICING, 10_000, 5_000, 80_000, 10_000);
        expect(savings).toBeGreaterThan(0);
    });

    it('savings equal zero for models without cache multipliers', () => {
        // Gemini: no multipliers, so cached tokens = full price = hypothetical price
        const savings = estimateCacheSavingsEur(GEMINI_PRICING, 50_000, 50_000, 50_000);
        expect(savings).toBe(0);
    });

    it('hypothetical matches actual when multiplier is 1x (no benefit)', () => {
        // When cacheReadMultiplier = 1 (default), cache read = full price = no savings
        const pricing = { inputPerMillion: 1.00, outputPerMillion: 1.00 };
        const savings = estimateCacheSavingsEur(pricing, 50_000, 50_000, 50_000);
        expect(savings).toBe(0);
    });
});

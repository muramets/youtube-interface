import { describe, it, expect } from 'vitest';
import {
    getEffectiveDisplayLevel,
    LEVEL_RANK,
    scaleBreakdown,
    type TokenDisplayLevel,
} from '../tokenDisplay';
import type { ContextBreakdown } from '../../../../../shared/models';

describe('tokenDisplay', () => {
    describe('LEVEL_RANK', () => {
        it('has correct ordering: minimal < standard < detailed < debug', () => {
            expect(LEVEL_RANK.minimal).toBeLessThan(LEVEL_RANK.standard);
            expect(LEVEL_RANK.standard).toBeLessThan(LEVEL_RANK.detailed);
            expect(LEVEL_RANK.detailed).toBeLessThan(LEVEL_RANK.debug);
        });
    });

    describe('getEffectiveDisplayLevel', () => {
        const levels: TokenDisplayLevel[] = ['minimal', 'standard', 'detailed', 'debug'];

        it('returns preference when preference <= maxAllowed', () => {
            // Same level
            for (const l of levels) {
                expect(getEffectiveDisplayLevel(l, l)).toBe(l);
            }
            // Lower preference
            expect(getEffectiveDisplayLevel('minimal', 'debug')).toBe('minimal');
            expect(getEffectiveDisplayLevel('standard', 'detailed')).toBe('standard');
            expect(getEffectiveDisplayLevel('standard', 'debug')).toBe('standard');
            expect(getEffectiveDisplayLevel('detailed', 'debug')).toBe('detailed');
        });

        it('clamps to maxAllowed when preference > maxAllowed', () => {
            expect(getEffectiveDisplayLevel('debug', 'minimal')).toBe('minimal');
            expect(getEffectiveDisplayLevel('debug', 'standard')).toBe('standard');
            expect(getEffectiveDisplayLevel('debug', 'detailed')).toBe('detailed');
            expect(getEffectiveDisplayLevel('detailed', 'standard')).toBe('standard');
            expect(getEffectiveDisplayLevel('detailed', 'minimal')).toBe('minimal');
            expect(getEffectiveDisplayLevel('standard', 'minimal')).toBe('minimal');
        });

        it('covers all 16 preference × maxAllowed combinations', () => {
            for (const pref of levels) {
                for (const max of levels) {
                    const result = getEffectiveDisplayLevel(pref, max);
                    expect(LEVEL_RANK[result]).toBeLessThanOrEqual(LEVEL_RANK[max]);
                    expect(LEVEL_RANK[result]).toBeLessThanOrEqual(LEVEL_RANK[pref]);
                }
            }
        });
    });

    describe('scaleBreakdown', () => {
        const base: ContextBreakdown = {
            systemPrompt: 1000,
            toolDefinitions: 2000,
            history: 3000,
            memory: 500,
            currentMessage: 400,
            toolResults: 1100,
            imageTokens: 0,
            imageCount: 0,
            historyMessageCount: 5,
            usedSummary: false,
        };

        it('scales text components proportionally and sums to actualTotal', () => {
            const result = scaleBreakdown(base, 8000);
            const sum = result.systemPrompt + result.toolDefinitions + result.history
                + result.memory + result.currentMessage + result.toolResults + result.images;
            expect(sum).toBe(8000);
        });

        it('reserves imageTokens and distributes remainder to text', () => {
            const withImages = { ...base, imageTokens: 2000, imageCount: 2 };
            const result = scaleBreakdown(withImages, 10000);
            expect(result.images).toBe(2000);
            const textSum = result.systemPrompt + result.toolDefinitions + result.history
                + result.memory + result.currentMessage + result.toolResults;
            expect(textSum).toBe(8000);
        });

        it('clamps imageTokens to actualTotal when images exceed budget', () => {
            const bigImages = { ...base, imageTokens: 50000, imageCount: 5 };
            const result = scaleBreakdown(bigImages, 10000);
            expect(result.images).toBe(10000);
            // All text components should be 0
            expect(result.systemPrompt + result.toolDefinitions + result.history
                + result.memory + result.currentMessage + result.toolResults).toBe(0);
        });

        it('handles zero text chars gracefully', () => {
            const noText: ContextBreakdown = {
                systemPrompt: 0, toolDefinitions: 0, history: 0, memory: 0,
                currentMessage: 0, toolResults: 0, imageTokens: 1000,
                imageCount: 1, historyMessageCount: 0, usedSummary: false,
            };
            const result = scaleBreakdown(noText, 1000);
            expect(result.images).toBe(1000);
            expect(result.systemPrompt).toBe(0);
        });

        it('preserves proportions between text components', () => {
            // history is 3x systemPrompt in chars
            const result = scaleBreakdown(base, 8000);
            // Allow ±1 for rounding
            expect(Math.abs(result.history - result.systemPrompt * 3)).toBeLessThanOrEqual(1);
        });
    });
});

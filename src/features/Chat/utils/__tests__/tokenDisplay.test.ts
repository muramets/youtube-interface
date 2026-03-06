import { describe, it, expect } from 'vitest';
import {
    getEffectiveDisplayLevel,
    LEVEL_RANK,
    type TokenDisplayLevel,
} from '../tokenDisplay';

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
});

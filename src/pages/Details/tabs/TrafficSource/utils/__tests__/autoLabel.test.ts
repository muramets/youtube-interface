import { describe, it, expect } from 'vitest';
import { generateAutoLabel } from '../autoLabel';

// Helper: build ISO string from local calendar year/month/day/hour (month is 0-indexed)
const iso = (y: number, m: number, d: number, h = 12): string =>
    new Date(y, m, d, h, 0, 0, 0).toISOString();
const ts = (y: number, m: number, d: number, h = 12): number =>
    new Date(y, m, d, h, 0, 0, 0).getTime();

describe('generateAutoLabel — retrospective calendar-day milestones', () => {
    const pubIso = iso(2026, 3, 15, 15); // Apr 15, 3:00 PM local

    describe('retrospective uploads (dayOffset ≥ 2)', () => {
        it('pub_day + 2 → "24 hours"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 17, 12))).toBe('24 hours');
        });
        it('pub_day + 3 → "48 hours"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 18, 12))).toBe('48 hours');
        });
        it('pub_day + 4 → "72 hours"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 19, 12))).toBe('72 hours');
        });
        it('pub_day + 5 → "96 hours"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 20, 12))).toBe('96 hours');
        });
        it('pub_day + 8 → "7 days"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 23, 12))).toBe('7 days');
        });
        it('pub_day + 14 → "13 days"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 29, 12))).toBe('13 days');
        });
        it('pub_day + 22 → "3 weeks"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 4, 7, 12))).toBe('3 weeks');
        });
    });

    describe('online/early uploads (dayOffset < 2) → raw hours', () => {
        it('same day +30min → "1 hour"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 15, 15) + 30 * 60 * 1000)).toBe('1 hour');
        });
        it('same day +5h → "5 hours"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 15, 20))).toBe('5 hours');
        });
        it('pub_day + 1 (20h elapsed) → "20 hours"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 16, 11))).toBe('20 hours');
        });
        it('pub_day + 1 (23h elapsed) → "23 hours"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 16, 14))).toBe('23 hours');
        });
    });

    describe('edge cases', () => {
        it('uploadTimestamp < publish → fallback to upload date', () => {
            const label = generateAutoLabel(pubIso, ts(2026, 3, 14, 12));
            expect(label).toMatch(/Apr/); // "Apr 14" format
        });

        it('undefined publishedAt → fallback to upload date', () => {
            const label = generateAutoLabel(undefined, ts(2026, 3, 20, 12));
            expect(label).toMatch(/Apr/);
        });

        it('exactly at publish time → "<1 hour"', () => {
            expect(generateAutoLabel(pubIso, ts(2026, 3, 15, 15))).toBe('<1 hour');
        });
    });

    describe('consistency with calculateDueDate milestones', () => {
        // Snapshot uploaded exactly when a check-in becomes available should match the rule name
        const cases = [
            { hours: 24, dayOffset: 2, expected: '24 hours' },
            { hours: 48, dayOffset: 3, expected: '48 hours' },
            { hours: 96, dayOffset: 5, expected: '96 hours' },
            { hours: 168, dayOffset: 8, expected: '7 days' },
        ];

        for (const { hours, dayOffset, expected } of cases) {
            it(`${hours}h rule fires on pub_day + ${dayOffset} → "${expected}"`, () => {
                expect(generateAutoLabel(pubIso, ts(2026, 3, 15 + dayOffset, 12))).toBe(expected);
            });
        }
    });
});

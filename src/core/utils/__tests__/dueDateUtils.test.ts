import { describe, it, expect } from 'vitest';
import { calculateDueDate } from '../dueDateUtils';

// Uses retrospective calendar-day logic:
//   dueTime = publish_day + (N/24 + 1) days at 12:00 local
// So for any publish time on day D:
//   24h  rule → (D+2) at 12:00
//   48h  rule → (D+3) at 12:00
//   72h  rule → (D+4) at 12:00
//   96h  rule → (D+5) at 12:00
//   168h rule → (D+8) at 12:00

describe('calculateDueDate — retrospective calendar-day logic', () => {
    // Helpers to build expected dueTime in local TZ
    const noonLocal = (year: number, month: number, day: number): number =>
        new Date(year, month, day, 12, 0, 0, 0).getTime();

    describe('afternoon publication (after 12:00)', () => {
        const publishedAt = '2026-04-15T15:34:00';

        it('24h rule → pub_day + 2 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 24)).toBe(noonLocal(2026, 3, 17));
        });

        it('48h rule → pub_day + 3 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 48)).toBe(noonLocal(2026, 3, 18));
        });

        it('72h rule → pub_day + 4 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 72)).toBe(noonLocal(2026, 3, 19));
        });

        it('96h rule → pub_day + 5 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 96)).toBe(noonLocal(2026, 3, 20));
        });

        it('168h (7 days) rule → pub_day + 8 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 168)).toBe(noonLocal(2026, 3, 23));
        });
    });

    describe('morning publication (before 12:00)', () => {
        // Same calendar-day formula regardless of publish time of day
        const publishedAt = '2026-04-15T09:00:00';

        it('24h rule → pub_day + 2 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 24)).toBe(noonLocal(2026, 3, 17));
        });

        it('48h rule → pub_day + 3 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 48)).toBe(noonLocal(2026, 3, 18));
        });
    });

    describe('late-night publication (23:59)', () => {
        const publishedAt = '2026-04-15T23:59:00';

        it('24h rule still uses publish_day → pub_day + 2 at 12:00', () => {
            expect(calculateDueDate(publishedAt, 24)).toBe(noonLocal(2026, 3, 17));
        });
    });

    describe('non-24-multiple hours (edge case)', () => {
        // Math.ceil(30 / 24) = 2 → behaves like 48h
        it('30h rule rounds up to 48h bucket', () => {
            const publishedAt = '2026-04-15T15:34:00';
            expect(calculateDueDate(publishedAt, 30)).toBe(noonLocal(2026, 3, 18));
        });

        // Math.ceil(24 / 24) = 1 → 24h bucket
        it('24h exact → 24h bucket (pub_day + 2)', () => {
            const publishedAt = '2026-04-15T15:34:00';
            expect(calculateDueDate(publishedAt, 24)).toBe(noonLocal(2026, 3, 17));
        });
    });

    describe('consistency: different publish times, same calendar day', () => {
        // All publishes on Apr 15 (regardless of hour) → 24h rule → Apr 17 12:00
        const day = noonLocal(2026, 3, 17);
        it('01:00 publish → same due', () => {
            expect(calculateDueDate('2026-04-15T01:00:00', 24)).toBe(day);
        });
        it('12:00 publish → same due', () => {
            expect(calculateDueDate('2026-04-15T12:00:00', 24)).toBe(day);
        });
        it('23:00 publish → same due', () => {
            expect(calculateDueDate('2026-04-15T23:00:00', 24)).toBe(day);
        });
    });
});

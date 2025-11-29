import { describe, it, expect } from 'vitest';
import { formatViewCount, formatDuration } from './formatUtils';

describe('formatUtils', () => {
    describe('formatViewCount', () => {
        it('formats small numbers correctly', () => {
            expect(formatViewCount('500')).toBe('500');
        });

        it('formats thousands correctly', () => {
            expect(formatViewCount('1500')).toBe('1.5K');
            expect(formatViewCount('10000')).toBe('10K');
        });

        it('formats millions correctly', () => {
            expect(formatViewCount('1000000')).toBe('1M');
            expect(formatViewCount('2500000')).toBe('2.5M');
        });

        it('handles undefined or null', () => {
            expect(formatViewCount(undefined)).toBe('');
            // @ts-expect-error testing invalid input
            expect(formatViewCount(null)).toBe('');
        });
    });

    describe('formatDuration', () => {
        it('formats ISO 8601 duration correctly', () => {
            expect(formatDuration('PT1H2M10S')).toBe('1:02:10');
            expect(formatDuration('PT5M30S')).toBe('5:30');
            expect(formatDuration('PT30S')).toBe('0:30');
        });
    });
});

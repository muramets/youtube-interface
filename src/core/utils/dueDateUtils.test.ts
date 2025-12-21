import { describe, it, expect } from 'vitest';
import { calculateDueDate } from './dueDateUtils';

describe('calculateDueDate', () => {
    // Test 1: Video published at 11:00, rule +24h → due date at 12:00 next day
    it('should adjust to 12:00 when calculated time is before noon', () => {
        // Nov 12, 2024 at 11:00 local time
        const publishedAt = new Date(2024, 10, 12, 11, 0, 0).toISOString();
        const hoursAfterPublish = 24;

        const dueDate = new Date(calculateDueDate(publishedAt, hoursAfterPublish));

        // Expected: Nov 13, 2024 at 12:00 (since 11:00 + 24h = 11:00 which is before 12:00)
        expect(dueDate.getDate()).toBe(13);
        expect(dueDate.getHours()).toBe(12);
        expect(dueDate.getMinutes()).toBe(0);
    });

    // Test 2: Video published at 15:00, rule +24h → due date at 15:00 next day
    it('should keep original time when calculated time is after noon', () => {
        // Nov 12, 2024 at 15:00 local time
        const publishedAt = new Date(2024, 10, 12, 15, 0, 0).toISOString();
        const hoursAfterPublish = 24;

        const dueDate = new Date(calculateDueDate(publishedAt, hoursAfterPublish));

        // Expected: Nov 13, 2024 at 15:00 (since 15:00 + 24h = 15:00 which is after 12:00)
        expect(dueDate.getDate()).toBe(13);
        expect(dueDate.getHours()).toBe(15);
        expect(dueDate.getMinutes()).toBe(0);
    });

    // Test 3: Video published at 23:00, rule +24h → due date at 23:00 next day (after noon)
    it('should keep original time for late evening publish', () => {
        // Nov 12, 2024 at 23:00 local time
        const publishedAt = new Date(2024, 10, 12, 23, 0, 0).toISOString();
        const hoursAfterPublish = 24;

        const dueDate = new Date(calculateDueDate(publishedAt, hoursAfterPublish));

        // Expected: Nov 13, 2024 at 23:00 (since 23:00 + 24h = 23:00 which is after 12:00)
        expect(dueDate.getDate()).toBe(13);
        expect(dueDate.getHours()).toBe(23);
    });

    // Test 4: Edge case - exactly 12:00
    it('should keep 12:00 as is', () => {
        // Nov 12, 2024 at 12:00 local time
        const publishedAt = new Date(2024, 10, 12, 12, 0, 0).toISOString();
        const hoursAfterPublish = 24;

        const dueDate = new Date(calculateDueDate(publishedAt, hoursAfterPublish));

        // Expected: Nov 13, 2024 at 12:00
        expect(dueDate.getDate()).toBe(13);
        expect(dueDate.getHours()).toBe(12);
    });

    // Test 5: Short interval (1 hour) that results in time before noon
    it('should adjust short intervals too', () => {
        // Nov 12, 2024 at 10:00 local time, rule +1h = 11:00
        const publishedAt = new Date(2024, 10, 12, 10, 0, 0).toISOString();
        const hoursAfterPublish = 1;

        const dueDate = new Date(calculateDueDate(publishedAt, hoursAfterPublish));

        // Expected: Nov 12, 2024 at 12:00 (since 10:00 + 1h = 11:00 which is before 12:00)
        expect(dueDate.getDate()).toBe(12);
        expect(dueDate.getHours()).toBe(12);
    });
});

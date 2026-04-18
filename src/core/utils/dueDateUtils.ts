/**
 * Calculate the due date for a check-in using retrospective YT Studio logic.
 *
 * The user uploads snapshots retrospectively by selecting full calendar days in YT
 * Studio's date range picker (not the exact N-hour mark). Convention:
 *   - 24h snapshot = 2 calendar days [publish_day, publish_day+1]
 *   - 48h snapshot = 3 calendar days [publish_day, ..., publish_day+2]
 *   - Nh snapshot  = (N/24 + 1) calendar days
 *
 * YT Analytics publishes daily data at 12:00 local time the FOLLOWING day. So the
 * last day in the range becomes available at `last_day + 1` at 12:00.
 *
 * Formula: dueTime = publish_day + (N/24 + 1) days, at 12:00 local time.
 *
 * Examples:
 *   pub Apr 15 15:34, 24h  → Apr 17 12:00 (d1+d2 = Apr 15+16, visible Apr 17 12:00)
 *   pub Apr 15 15:34, 48h  → Apr 18 12:00 (d1+d2+d3, visible Apr 18 12:00)
 *   pub Apr 16 13:00, 24h  → Apr 18 12:00 (d1+d2 = Apr 16+17, visible Apr 18 12:00)
 *   pub Apr 15 15:34, 168h → Apr 23 12:00 (d1..d8)
 */
export const calculateDueDate = (publishedAt: string, hoursAfterPublish: number): number => {
    const pubDate = new Date(publishedAt);
    const daysOffset = Math.ceil(hoursAfterPublish / 24) + 1;
    const due = new Date(
        pubDate.getFullYear(),
        pubDate.getMonth(),
        pubDate.getDate() + daysOffset,
        12, 0, 0, 0
    );
    return due.getTime();
};

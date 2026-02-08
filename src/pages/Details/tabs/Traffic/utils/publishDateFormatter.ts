/**
 * Publish Date formatting utilities for Suggested Traffic table.
 *
 * Formats video publish dates as human-readable strings (e.g. "1 FEB 26")
 * and computes relative deltas to the current video's publish date.
 */

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Format an ISO date string into a compact human-readable date.
 * Example: "2026-02-01T..." → "1 FEB 26"
 */
export const formatPublishDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day = d.getDate();
    const month = MONTH_NAMES[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2); // last 2 digits
    return `${day} ${month} ${year}`;
};

/**
 * Compute the signed day-difference between a suggested video's publish date
 * and the user's own video publish date.
 *
 * Positive  = suggested video published BEFORE mine (older)   → "+10d"
 * Negative  = suggested video published AFTER  mine (newer)   → "-3d"
 *
 * Returns raw diff in days (positive = suggested is older).
 */
export const diffDays = (suggestedDateStr: string, myVideoDateStr: string): number | null => {
    const s = new Date(suggestedDateStr);
    const m = new Date(myVideoDateStr);
    if (isNaN(s.getTime()) || isNaN(m.getTime())) return null;
    const msPerDay = 86_400_000;
    return Math.round((m.getTime() - s.getTime()) / msPerDay);
};

/**
 * Format a day-difference into a human-readable string with smart rounding.
 *
 * Rules:
 *  |diff| ≤ 30   → exact days:      "+10d", "-3d"
 *  31 … 365      → months (+days):   "+1m", "+2m 5d"
 *  > 365         → years (+months):  "+1y", "+2y 3m"
 */
export const formatDelta = (totalDays: number): string => {
    const sign = totalDays >= 0 ? '+' : '-';
    const abs = Math.abs(totalDays);

    if (abs === 0) return '0d';

    if (abs <= 30) {
        return `${sign}${abs}d`;
    }

    if (abs <= 365) {
        const months = Math.floor(abs / 30);
        const days = abs % 30;
        if (days === 0) return `${sign}${months}m`;
        return `${sign}${months}m ${days}d`;
    }

    // > 365 days
    const years = Math.floor(abs / 365);
    const remainingDays = abs % 365;
    const months = Math.floor(remainingDays / 30);
    if (months === 0) return `${sign}${years}y`;
    return `${sign}${years}y ${months}m`;
};

/**
 * Convenience: format the delta between two ISO date strings.
 * Returns formatted string or null if either date is missing/invalid.
 */
export const formatDateDelta = (suggestedDateStr: string, myVideoDateStr: string): string | null => {
    const diff = diffDays(suggestedDateStr, myVideoDateStr);
    if (diff === null) return null;
    return formatDelta(diff);
};

/**
 * Compute the average delta (in days) across all traffic sources that have a publishedAt.
 * Returns the formatted average delta, or null if no valid dates.
 */
export const computeAverageDelta = (
    publishDates: (string | undefined)[],
    myVideoDateStr: string
): string | null => {
    const diffs: number[] = [];
    for (const pd of publishDates) {
        if (!pd) continue;
        const d = diffDays(pd, myVideoDateStr);
        if (d !== null) diffs.push(d);
    }
    if (diffs.length === 0) return null;
    const avg = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
    return formatDelta(avg);
};

// =============================================================================
// Traffic Source Auto-Label
//
// Uses the retrospective calendar-day convention (same as check-in scheduler):
// Upload day offset N (from publish day) = (N-1)*24 hours of data coverage.
//   - offset 2 → "24 hours" (d1+d2 range = 24h snapshot)
//   - offset 3 → "48 hours" (d1+d2+d3 = 48h)
//   - offset 5 → "96 hours"
//   - offset 8 → "7 days"
//
// Early/online uploads (offset 0 or 1, before retrospective availability) keep
// the raw elapsed-hours label since they don't align with a calendar-day milestone.
// =============================================================================

const fallbackDate = (ts: number): string =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Generate an auto-label for a Traffic Source snapshot.
 *
 * @param publishedAt - ISO date string of video publication (or undefined for drafts)
 * @param uploadTimestamp - Timestamp (ms) when the CSV was uploaded
 * @returns Human-readable label aligned with check-in milestones
 *
 * @example
 * // Pub Apr 15, upload Apr 17 12:00 (offset 2) → "24 hours"
 * // Pub Apr 15, upload Apr 18 12:00 (offset 3) → "48 hours"
 * // Pub Apr 15, upload Apr 23 12:00 (offset 8) → "7 days"
 * // Pub Apr 15, upload Apr 16 10:00 (offset 1, online) → "19 hours"
 */
export function generateAutoLabel(
    publishedAt: string | undefined,
    uploadTimestamp: number
): string {
    if (!publishedAt) return fallbackDate(uploadTimestamp);

    const pub = new Date(publishedAt);
    const upload = new Date(uploadTimestamp);
    if (upload.getTime() < pub.getTime()) return fallbackDate(uploadTimestamp);

    // Calendar day offset in local time (matches check-in scheduler's calculateDueDate)
    const pubDayStart = new Date(pub.getFullYear(), pub.getMonth(), pub.getDate()).getTime();
    const uploadDayStart = new Date(upload.getFullYear(), upload.getMonth(), upload.getDate()).getTime();
    const dayOffset = Math.round((uploadDayStart - pubDayStart) / (24 * 60 * 60 * 1000));

    // Retrospective milestone label (matches scheduler + check-in rules)
    if (dayOffset >= 2) {
        const hours = (dayOffset - 1) * 24;
        if (hours < 168) return `${hours} hours`;

        const days = hours / 24;
        if (days < 14) return `${days} days`;

        const weeks = Math.round(days / 7);
        if (weeks < 8) return `${weeks} weeks`;

        const months = Math.round(days / 30);
        if (months === 1) return '1 month';
        return `${months} months`;
    }

    // Online/early upload (offset 0 or 1): raw elapsed hours
    const diffHours = Math.round((uploadTimestamp - pub.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return '<1 hour';
    if (diffHours === 1) return '1 hour';
    return `${diffHours} hours`;
}

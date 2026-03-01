// =============================================================================
// Traffic Source Auto-Label
//
// Generates human-readable labels for snapshots based on time elapsed
// since video publication: "13 hours", "3 days", "2 weeks", "1 month".
// =============================================================================

/**
 * Generate an auto-label for a Traffic Source snapshot.
 *
 * @param publishedAt - ISO date string of video publication (or undefined for drafts)
 * @param uploadTimestamp - Timestamp (ms) when the CSV was uploaded
 * @returns Human-readable label like "13 hours", "3 days", "2 weeks"
 *
 * @example
 * generateAutoLabel('2026-03-01T08:00:00Z', Date.now()) // "13 hours"
 * generateAutoLabel(undefined, Date.now())               // "Mar 1"
 */
export function generateAutoLabel(
    publishedAt: string | undefined,
    uploadTimestamp: number
): string {
    if (!publishedAt) {
        // Fallback for unpublished videos: use upload date
        return new Date(uploadTimestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    }

    const publishedMs = new Date(publishedAt).getTime();
    const diffMs = uploadTimestamp - publishedMs;

    // Guard against negative diff (upload before publish — shouldn't happen, but be safe)
    if (diffMs < 0) {
        return new Date(uploadTimestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    }

    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return '<1 hour';
    if (diffHours === 1) return '1 hour';
    if (diffHours < 24) return `${diffHours} hours`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return '1 day';
    if (diffDays < 14) return `${diffDays} days`;

    const diffWeeks = Math.round(diffDays / 7);
    if (diffWeeks === 1) return '1 week';
    if (diffWeeks < 8) return `${diffWeeks} weeks`;

    const diffMonths = Math.round(diffDays / 30);
    if (diffMonths === 1) return '1 month';
    return `${diffMonths} months`;
}

import React from 'react';
import { Telescope } from 'lucide-react';
import { formatViewCount } from '../../../../core/utils/formatUtils';

// --- Date range helpers ---

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format ISO date as "Mar 4" or "Mar 4, 2026" (with year). */
function formatShortDate(iso: string, includeYear: boolean): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const month = SHORT_MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    return includeYear ? `${month} ${day}, ${d.getUTCFullYear()}` : `${month} ${day}`;
}

/**
 * Compute the actual date range of published videos from competitorActivity.
 *
 * Shows the real data range ("what was found") instead of the raw search window
 * ("where we looked"). This prevents confusing future dates when the ±N day window
 * extends past today. Falls back to the raw window if no videos are present.
 *
 * Format: "Mar 4 — Mar 10, 2026" (year on the last date only, unless they differ).
 */
function getDisplayDateRange(
    activity: Array<{ videos: Array<{ publishedAt: string }> }> | undefined,
    window: { from: string; to: string } | undefined,
): string | null {
    // Extract all publishedAt dates from all channels' videos
    const dates: string[] = [];
    if (activity) {
        for (const ch of activity) {
            for (const v of (ch.videos ?? [])) {
                if (v.publishedAt) dates.push(v.publishedAt);
            }
        }
    }

    // Fallback: no videos → show raw window (user sees "0 videos" + the search range)
    if (dates.length === 0) {
        if (!window) return null;
        return `${formatShortDate(window.from, false)} — ${formatShortDate(window.to, true)}`;
    }

    dates.sort();
    const earliest = dates[0];
    const latest = dates[dates.length - 1];

    const startYear = new Date(earliest).getUTCFullYear();
    const endYear = new Date(latest).getUTCFullYear();
    const sameYear = startYear === endYear;

    // "Mar 4 — Mar 10, 2026" (same year) or "Dec 28, 2025 — Jan 4, 2026" (cross-year)
    return `${formatShortDate(earliest, !sameYear)} — ${formatShortDate(latest, true)}`;
}

// --- Component ---

/** Compact stats for getNicheSnapshot expanded view. */
export const NicheSnapshotStats: React.FC<{ result: Record<string, unknown> }> = ({ result }) => {
    const window = result.window as { from: string; to: string } | undefined;
    const aggregates = result.aggregates as {
        totalVideosInWindow?: number;
        commonTags?: Array<{ tag: string; weight: number }>;
        avgViewsInWindow?: number;
    } | undefined;
    const activity = result.competitorActivity as Array<{
        channelTitle: string;
        videosPublished: number;
        avgViews: number;
        videos: Array<{ publishedAt: string }>;
    }> | undefined;

    const dateRange = getDisplayDateRange(activity, window);

    // Sort channels by average views (highest first) for at-a-glance performance ranking
    const sortedActivity = activity
        ? [...activity].sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0))
        : undefined;

    return (
        <div className="flex flex-col gap-1 px-2 py-1.5 rounded-md bg-surface-primary dark:bg-white/[0.03] text-[11px] text-text-secondary">
            {dateRange && (
                <span className="text-[10px] text-text-tertiary">
                    {dateRange}
                </span>
            )}
            <span className="inline-flex items-center gap-1.5">
                <Telescope size={11} className="shrink-0 opacity-60" />
                {aggregates?.totalVideosInWindow ?? 0} videos
                {aggregates?.avgViewsInWindow != null && ` · avg ${formatViewCount(aggregates.avgViewsInWindow)}`}
            </span>
            {sortedActivity && sortedActivity.length > 0 && (
                <div className="flex flex-col gap-0.5 text-[10px] text-text-tertiary">
                    {sortedActivity.slice(0, 5).map(ch => (
                        <span key={ch.channelTitle} className="truncate">
                            {ch.channelTitle}: {ch.videosPublished} videos · avg {formatViewCount(ch.avgViews)}
                        </span>
                    ))}
                </div>
            )}
            {aggregates?.commonTags && aggregates.commonTags.length > 0 && (
                <span className="text-[10px] text-text-tertiary truncate">
                    Top tags: {aggregates.commonTags.slice(0, 5).map(t => t.tag).join(', ')}
                </span>
            )}
        </div>
    );
};

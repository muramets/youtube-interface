// =============================================================================
// AI CHAT: Relative Time Formatting
// =============================================================================

import { Timestamp } from 'firebase/firestore';

/**
 * Format a Firestore Timestamp as a relative time string.
 * - < 1 min:  "just now"
 * - < 1 hour: "3m ago"
 * - < 1 day:  "2h ago"
 * - < 2 days: "Yesterday"
 * - older:    "Feb 10"
 */
export function formatRelativeTime(ts: Timestamp): string {
    const now = Date.now();
    const then = ts.toMillis();
    const diff = now - then;

    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 172_800_000) return 'Yesterday';

    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Age thresholds for adaptive timers */
export const STATIC_AGE = 172_800_000; // > 2 days: date is static, no timer needed

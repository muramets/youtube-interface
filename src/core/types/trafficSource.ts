// =============================================================================
// Traffic Source Types
//
// Data types for the Traffic Sources feature — aggregate traffic metrics
// (Suggested videos, Browse, Search, Notifications) tracked through
// CSV snapshots over time.
//
// NOT to be confused with traffic.ts (Suggested Traffic = individual videos).
// =============================================================================

/**
 * A single row from a Traffic Sources CSV — aggregate metrics for one traffic source.
 *
 * Example: "Suggested videos" had 684 impressions, 2.34% CTR, 22 views.
 */
export interface TrafficSourceMetric {
    /** Traffic source name: "Suggested videos", "Browse features", "YouTube search", etc. */
    source: string;
    /** Total views from this source */
    views: number;
    /** Watch time in hours (decimal) */
    watchTimeHours: number;
    /** Average view duration — "HH:MM:SS" format */
    avgViewDuration: string;
    /** Number of impressions */
    impressions: number;
    /** Click-through rate as percentage (e.g., 2.5 means 2.5%) */
    ctr: number;
}

/**
 * A snapshot = one uploaded CSV file, frozen at a point in time.
 *
 * Auto-labeled by time since video publication:
 * "13 hours", "3 days", "2 weeks", "1 month"
 */
export interface TrafficSourceSnapshot {
    /** Unique snapshot ID */
    id: string;
    /** Upload timestamp (ms since epoch) */
    timestamp: number;
    /** User-editable label (overrides autoLabel in UI) */
    label?: string;
    /** Auto-generated label: "13 hours", "3 days" — computed from publishedAt */
    autoLabel: string;
    /** Cloud Storage path to the CSV file */
    storagePath: string;
    /** Cached total views (avoids CSV download for sidebar/summary display) */
    totalViews?: number;
    /** Cached total impressions */
    totalImpressions?: number;
    /** Cached total CTR */
    totalCtr?: number;
}

/**
 * Root data structure stored in Firestore on the video document.
 *
 * Firestore path: users/{uid}/channels/{channelId}/videos/{videoId}.trafficSourceData
 */
export interface TrafficSourceData {
    /** Last time any snapshot was added/modified */
    lastUpdated: number;
    /** Ordered list of snapshots (newest first) */
    snapshots: TrafficSourceSnapshot[];
}

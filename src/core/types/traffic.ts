import type { TrafficSnapshotBase } from './versioning';

export interface TrafficSource {
    sourceType: string;
    sourceTitle: string;
    videoId: string | null; // Extracted from "YT_RELATED.videoId"
    impressions: number;
    ctr: number;
    views: number;
    avgViewDuration: string; // "HH:MM:SS"
    watchTimeHours: number;
    // API fetched data (optional, populated later)
    thumbnail?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
}

import type { TrafficNicheProperty } from './suggestedTrafficNiches';

export interface TrafficGroup {
    id: string;
    name: string;
    color: string; // Hex code
    videoIds: string[]; // List of video IDs assigned to this group
    property?: TrafficNicheProperty;
}

/**
 * BUSINESS LOGIC: Traffic Snapshot Attribution
 * 
 * STORAGE STRATEGY:
 * - Metadata stored in Firestore (fast queries, small size)
 * - Full CSV stored in Cloud Storage (no size limits, cheaper)
 * 
 * Snapshots are created when:
 * 1. A new packaging version is created (closes the previous version)
 * 2. A version is restored (closes the currently active version)
 * 3. User manually uploads CSV in Traffic tab
 * 
 * The snapshot "closes" a version period, allowing us to calculate:
 * Views for that period = (this snapshot) - (previous snapshot)
 * 
 * Example:
 * - v.1 active from Day 1-2
 * - Create v.2 on Day 2 → Upload CSV → Creates snapshot that closes v.1's period
 * - v.1 views = (Day 2 snapshot) - (Day 1 initial data)
 */
export interface TrafficSnapshot extends TrafficSnapshotBase {
    /**
     * Metadata about which version period this snapshot closes.
     * 
     * Example: When creating v.3, we upload CSV that closes v.2's active period.
     * - closesVersionPeriod.versionNumber = 2
     * - closesVersionPeriod.periodIndex = 0 (first/only period for v.2)
     * 
     * This allows the system to know:
     * - Which version's period ended
     * - Which period (if version has multiple)
     * - How to calculate views for that period
     */
    closesVersionPeriod?: {
        versionNumber: number;
        periodIndex: number; // Index in PackagingVersion.activePeriods array
    };

    /**
     * PACKAGING SNAPSHOT PRESERVATION:
     * When a packaging version is deleted, its configuration is preserved here
     * to maintain historical context for traffic attribution.
     * 
     * This allows users to see what packaging drove the traffic even after
     * the version is deleted from the Packaging tab.
     */
    packagingSnapshot?: {
        title: string;
        description: string;
        tags: string[];
        coverImage?: string;
        abTestTitles?: string[];
        abTestThumbnails?: string[];
        abTestResults?: {
            titles?: Array<{ variant: string; ctr: number; impressions: number }>;
            thumbnails?: Array<{ variant: string; ctr: number; impressions: number }>;
        };
        localizations?: Record<string, any>;
        cloneOf?: number; // Preserved restoration metadata
        restoredAt?: number; // Preserved restoration metadata
        periodStart?: number; // NEW: Preserve period start
        periodEnd?: number | null; // NEW: Preserve period end
    };

    /**
     * Flag indicating the packaging version for this snapshot was deleted.
     * When true, UI shows "(packaging deleted)" with tooltip containing packagingSnapshot data.
     */
    isPackagingDeleted?: boolean;

    // LEGACY REMOVED: sources and totalRow fields removed. Use storagePath for all snapshots.
}

export interface TrafficVersionInfo {
    version: number | 'draft';
    label: string; // "v.1", "v.2", "Draft"
    isActive: boolean;
    hasDraft: boolean;
}

export interface TrafficData {
    lastUpdated: number;
    sources: TrafficSource[];
    groups: TrafficGroup[]; // Groups persist across versions
    totalRow?: TrafficSource;
    snapshots: TrafficSnapshot[]; // History of "freezes"
}

/**
 * BUSINESS LOGIC: Traffic Filter Types
 * 
 * Filters allow users to narrow down traffic sources by various metrics.
 * Each filter type corresponds to a TrafficSource property or special behavior.
 */
export type TrafficFilterType =
    | 'impressions'           // Filter by impression count
    | 'ctr'                   // Filter by click-through rate
    | 'views'                 // Filter by view count
    | 'avgViewDuration'       // Filter by average view duration
    | 'hideZeroViews'         // Special: Hide sources with 0 views
    | 'hideZeroImpressions'   // Special: Hide sources with 0 impressions
    | 'hideZeroImpressions'   // Special: Hide sources with 0 impressions
    | 'niche'                 // Filter by Niche assignment
    | 'trafficType';          // Filter by Traffic Type (autoplay/user_click)

/**
 * BUSINESS LOGIC: Traffic Filter Persistence
 * 
 * Filters are persisted per-context to maintain user preferences across:
 * - Page reloads
 * - Navigation between different versions/periods
 * - Navigation between snapshots
 * 
 * Context Key Format:
 * - For snapshots: `snapshot-${snapshotId}`
 * - For version periods: `version-${versionNumber}-period-${periodIndex}`
 * 
 * This ensures each view maintains its own independent filter state.
 */
export interface TrafficFilter {
    id: string;                    // Unique identifier for this filter instance
    type: TrafficFilterType;       // Which metric to filter on
    operator: import('../stores/filterStore').FilterOperator;  // Comparison operator
    value: any;                    // Filter value (number, range, etc.)
    label: string;                 // Display label for filter chips
}

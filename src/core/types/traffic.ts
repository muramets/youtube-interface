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
    channelTitle?: string;
    publishedAt?: string;
}

export interface TrafficGroup {
    id: string;
    name: string;
    color: string; // Hex code
    videoIds: string[]; // List of video IDs assigned to this group
}

/**
 * BUSINESS LOGIC: Traffic Snapshot Attribution (Hybrid Storage)
 * 
 * HYBRID APPROACH:
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
export interface TrafficSnapshot {
    /**
     * Unique ID for referencing from PackagingVersion.activePeriods.
     * Format: "snap_" + timestamp + "_v" + versionNumber
     * Example: "snap_1704672000000_v2"
     */
    id: string;

    /**
     * The packaging version this snapshot is associated with.
     * This is the version whose data is being captured, NOT necessarily
     * the version being closed.
     */
    version: number;

    timestamp: number; // When this snapshot was created
    createdAt: string; // ISO date for display

    /**
     * HYBRID STORAGE: Path to CSV file in Cloud Storage.
     * Format: "users/{userId}/channels/{channelId}/videos/{videoId}/snapshots/{snapshotId}.csv"
     * 
     * If present, full data is in Storage. If missing, data is in `sources` field (legacy).
     */
    storagePath?: string;

    /**
     * HYBRID STORAGE: Summary data for quick display (stored in Firestore).
     * Allows showing snapshot list without downloading CSV files.
     */
    summary?: {
        totalViews: number;      // Total views across all sources
        totalWatchTime: number;  // Total watch time in seconds
        sourcesCount: number;    // Number of traffic sources
        topSource?: string;      // Name of top traffic source
    };

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
    };

    /**
     * Flag indicating the packaging version for this snapshot was deleted.
     * When true, UI shows "(packaging deleted)" with tooltip containing packagingSnapshot data.
     */
    isPackagingDeleted?: boolean;

    /**
     * LEGACY: Complete traffic data (for backward compatibility).
     * New snapshots store data in Cloud Storage instead.
     * If `storagePath` exists, this field may be omitted to save Firestore space.
     */
    sources?: TrafficSource[];
    totalRow?: TrafficSource;
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

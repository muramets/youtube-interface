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
 * BUSINESS LOGIC: Traffic Snapshot Attribution
 * 
 * A snapshot captures the state of traffic sources at a specific moment.
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

    // Complete traffic data at this point in time
    sources: TrafficSource[];
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

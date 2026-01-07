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
 * Snapshot of traffic data at a specific point in time (when version changes).
 * This allows us to calculate how many views belong to a specific version.
 */
export interface TrafficSnapshot {
    version: number; // The version number this snapshot effectively "closes"
    timestamp: number;
    createdAt: string; // ISO date for display
    // Store complete sources array for accurate historical data
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

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

export interface TrafficData {
    lastUpdated: number;
    sources: TrafficSource[];
    groups: TrafficGroup[];
    totalRow?: TrafficSource; // The "Total" row from CSV
}

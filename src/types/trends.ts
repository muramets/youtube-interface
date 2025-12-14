export interface HitCriteria {
    type: 'absolute' | 'relative';
    value: number; // For absolute: view count. For relative: multiplier (e.g. 2.0 for 2x average)
}

export interface TrendNiche {
    id: string;
    name: string;
    color: string;
    type: 'global' | 'local'; // Global = available for all channels, Local = specific to a channel
    channelId?: string; // If local
    hitCriteria: HitCriteria;
    createdAt: number;
}

export interface TrendChannel {
    id: string; // Channel ID (e.g. UC...)
    title: string;
    handle?: string;
    avatarUrl: string;
    uploadsPlaylistId: string;
    isVisible: boolean;
    subscriberCount?: number; // Optional context
    averageViews?: number; // Cached average for relative hit calc
    lastUpdated: number;
}

export interface TrendVideo {
    id: string;
    channelId: string;
    publishedAt: string; // ISO date
    publishedAtTimestamp: number; // For easier sorting/timeline pos
    title: string;
    thumbnail: string;
    viewCount: number;
    duration?: string;
    tags?: string[];
    description?: string;
    // Computed meta
    isHit?: boolean;
    nicheId?: string; // Assigned niche
}

export interface TimelineConfig {
    zoomLevel: number; // Scale factor
    startDate: number;
    endDate: number;
    viewMode: 'global' | 'per-channel'; // Global = all on one timeline (optional future), Per-channel = separate tracks
}

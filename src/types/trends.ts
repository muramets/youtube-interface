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
    channelTitle?: string;
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
    zoomLevel: number;
    offsetX: number;
    offsetY: number;
    isCustomView: boolean; // True if user has manually panned/zoomed
    startDate: number;
    endDate: number;
    viewMode: 'global' | 'per-channel'; // Global = all on one timeline (optional future), Per-channel = separate tracks
    scalingMode: 'linear' | 'log' | 'sqrt' | 'percentile'; // Scaling algorithm for video sizes
    verticalSpread: number; // 0.0-1.0, controls vertical spread of nodes
    timeLinearity: number; // 0.0-1.0, 0 = Linear (time-based), 1 = Compact (count-based)
    layoutMode?: 'compact' | 'spacious'; // Optional view preference
    contentHash?: string; // ID hash of the content visible when this config was saved
}

export interface MonthRegion {
    month: string;
    year: number;
    startX: number; // 0-1 normalized
    endX: number;   // 0-1 normalized
    center: number;
    daysInMonth: number; // For grid rendering
    isFirstOfYear: boolean;
}

export interface YearMarker {
    year: number;
    startX: number; // 0-1 normalized
    endX: number;   // 0-1 normalized
}

export interface MonthLayout {
    year: number;
    month: number;
    monthKey: string;
    label: string;
    count: number;
    startX: number;
    endX: number;
    width: number;
    startTs: number;
    endTs: number;
}

export interface TimelineStats {
    minDate: number;
    maxDate: number;
    minViews: number;
    maxViews: number;
}

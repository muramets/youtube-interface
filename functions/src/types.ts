export interface TrendChannel {
    id: string;
    uploadsPlaylistId: string;
    isVisible: boolean;
    name?: string;
    avatarUrl?: string;
}

export interface UserSettings {
    apiKey?: string;
}

export interface SyncSettings {
    trendSync?: {
        enabled: boolean;
    };
}

export interface Notification {
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    timestamp: FirebaseFirestore.FieldValue;
    isRead: boolean;
    meta?: string;
    quotaBreakdown?: {
        search?: number;
        list?: number;
        details?: number;
    };
}

export interface YouTubePlaylistItem {
    contentDetails: {
        videoId: string;
    };
}

export interface YouTubePlaylistResponse {
    items?: YouTubePlaylistItem[];
    nextPageToken?: string;
}

export interface YouTubeVideoSnippet {
    title: string;
    thumbnails?: {
        default?: { url: string };
        medium?: { url: string };
        high?: { url: string };
    };
    publishedAt: string;
    channelTitle: string;
}

export interface YouTubeVideoStatistics {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
}

export interface YouTubeVideoItem {
    id: string;
    snippet: YouTubeVideoSnippet;
    statistics: YouTubeVideoStatistics;
}

export interface YouTubeVideoResponse {
    items?: YouTubeVideoItem[];
}

export interface ProcessStats {
    videosProcessed: number;
    quotaList: number;
    quotaDetails: number;
}

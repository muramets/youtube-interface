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
    description?: string;
    tags?: string[];
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
    newAvatarUrl?: string;
}

// --- AI Chat Proxy Types ---

export interface ChatAttachmentData {
    type: "image" | "audio" | "video" | "file";
    url: string;
    name: string;
    mimeType: string;
    geminiFileUri?: string;
    geminiFileExpiry?: number;
}

export interface HistoryMessageData {
    id: string;
    role: "user" | "model";
    text: string;
    attachments?: ChatAttachmentData[];
}

export interface AiChatRequest {
    channelId: string;
    conversationId: string;
    text: string;
    model?: string;
    systemPrompt?: string;
    attachments?: Array<{ geminiFileUri: string; mimeType: string }>;
    thumbnailUrls?: string[];
    /** Lightweight metadata about attached context items — for server-side logging only */
    contextMeta?: {
        videoCards?: number;
        trafficSources?: number;
        canvasNodes?: number;
        totalItems?: number;
    };
}

export interface GeminiUploadRequest {
    storagePath: string;
    mimeType: string;
    displayName: string;
}

export interface GenerateTitleRequest {
    firstMessage: string;
    model?: string;
}

export interface AiUsageLog {
    userId: string;
    channelId: string;
    conversationId: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    timestamp: FirebaseFirestore.FieldValue;
    type: "chat" | "title" | "memorize";
}

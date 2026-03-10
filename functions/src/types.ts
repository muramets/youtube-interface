export interface TrendChannel {
    id: string;
    title?: string;
    handle?: string;
    uploadsPlaylistId: string;
    isVisible: boolean;
    name?: string; // legacy alias for title
    avatarUrl?: string;
    subscriberCount?: number;
    averageViews?: number;
    totalViewCount?: number;
    lastUpdated?: number;
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
    category?: 'channel' | 'trends' | 'smart-search' | 'checkin' | 'video';
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
        maxres?: { url: string };
    };
    publishedAt: string;
    channelId?: string;
    channelTitle: string;
    description?: string;
    tags?: string[];
}

export interface YouTubeVideoStatistics {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
}

export interface YouTubeVideoContentDetails {
    duration?: string;
}

export interface YouTubeVideoItem {
    id: string;
    snippet: YouTubeVideoSnippet;
    statistics: YouTubeVideoStatistics;
    contentDetails?: YouTubeVideoContentDetails;
}

export interface YouTubeVideoResponse {
    items?: YouTubeVideoItem[];
}

export interface YouTubeChannelSnippet {
    title: string;
    customUrl?: string;
    thumbnails?: {
        default?: { url: string };
        medium?: { url: string };
    };
}

export interface YouTubeChannelStatistics {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
}

export interface YouTubeChannelContentDetails {
    relatedPlaylists: {
        uploads: string;
    };
}

export interface YouTubeChannelItem {
    id: string;
    snippet: YouTubeChannelSnippet;
    statistics: YouTubeChannelStatistics;
    contentDetails: YouTubeChannelContentDetails;
}

export interface YouTubeChannelResponse {
    items?: YouTubeChannelItem[];
}

// --- YouTube Comment Threads ---

export interface YouTubeCommentSnippet {
    authorDisplayName: string;
    authorChannelId?: { value: string };
    textDisplay: string;
    likeCount: number;
    publishedAt: string;
}

export interface YouTubeComment {
    snippet: YouTubeCommentSnippet;
}

export interface YouTubeCommentThreadSnippet {
    topLevelComment: YouTubeComment;
    totalReplyCount: number;
}

export interface YouTubeCommentThread {
    snippet: YouTubeCommentThreadSnippet;
    replies?: {
        comments: YouTubeComment[];
    };
}

export interface YouTubeCommentThreadResponse {
    pageInfo: {
        totalResults: number;
        resultsPerPage: number;
    };
    items?: YouTubeCommentThread[];
    nextPageToken?: string;
}

export interface ProcessStats {
    videosProcessed: number;
    quotaList: number;
    quotaDetails: number;
    newAvatarUrl?: string;
}

// --- AI Chat Proxy Types ---

/**
 * Firestore-stored attachment shape. Extends the provider-agnostic AttachmentRef
 * with Gemini-specific cached upload fields that are persisted to Firestore.
 * See also: services/ai/types.ts → AttachmentRef (provider-agnostic).
 */
export interface ChatAttachmentData {
    type: "image" | "audio" | "video" | "file";
    url: string;
    name: string;
    mimeType: string;
    /** Cached Gemini File API URI (provider-specific, persisted to Firestore). */
    geminiFileUri?: string;
    /** Expiry timestamp for the cached Gemini URI (ms since epoch). */
    geminiFileExpiry?: number;
}

/**
 * Firestore-stored message shape. Similar to HistoryMessage from ai/types.ts
 * but retains Firestore-specific ChatAttachmentData (with gemini cache fields).
 * See also: services/ai/types.ts → HistoryMessage (provider-agnostic).
 */
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
    /** Per-layer char sizes of the system prompt (settings, persistent context, cross-memory). */
    systemLayers?: { settings: number; persistentContext: number; crossMemory: number };
    attachments?: Array<{
        type: 'image' | 'audio' | 'video' | 'file';
        url: string;
        name: string;
        mimeType: string;
        /** Gemini File URI — present only when client pre-uploaded to Gemini Files API. */
        fileRef?: string;
        /** Image dimensions in pixels (captured on frontend via Image.onload). */
        width?: number;
        height?: number;
    }>;
    thumbnailUrls?: string[];
    /** Thinking depth option id (matches model's thinkingOptions) */
    thinkingOptionId?: string;
    /** Lightweight metadata about attached context items — for server-side logging only */
    contextMeta?: {
        videoCards?: number;
        trafficSources?: number;
        canvasNodes?: number;
        totalItems?: number;
    };
    /** User confirmed loading a large batch of thumbnails (≥15) via the confirmation UI. */
    largePayloadApproved?: boolean;
}

/**
 * Request payload for uploading a Firebase Storage file to an AI provider's
 * file API (e.g. Gemini File API). Provider-agnostic name; the upload handler
 * routes to the correct provider internally.
 */
export interface FileUploadRequest {
    storagePath: string;
    mimeType: string;
    displayName: string;
}

/** @deprecated Use FileUploadRequest instead. Alias kept for backward compatibility. */
export type GeminiUploadRequest = FileUploadRequest;

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
    cachedTokens?: number;
    cacheWriteTokens?: number;
    timestamp: FirebaseFirestore.FieldValue;
    type: "chat" | "title" | "memorize" | "summarize";
}

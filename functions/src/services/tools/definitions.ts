// =============================================================================
// Tool Definitions — Provider-agnostic tool declarations
//
// Single source of truth for all tools available to the AI agent.
// Each tool has a ToolDefinition (provider-agnostic) and metadata.
// Provider-specific adapters convert these
// to the native format (e.g. FunctionDeclaration) at call time.
//
// To add a new tool:
//   1. Add the name to TOOL_NAMES
//   2. Create a ToolDefinition below
//   3. Add a handler in handlers/ directory
//   4. Register the handler in executor.ts HANDLERS map
// =============================================================================

import type { ToolDefinition } from "../ai/types.js";

// --- Tool name constants (used by executor for routing) ---

export const TOOL_NAMES = {
    MENTION_VIDEO: "mentionVideo",
    GET_MULTIPLE_VIDEO_DETAILS: "getMultipleVideoDetails",
    ANALYZE_SUGGESTED_TRAFFIC: "analyzeSuggestedTraffic",
    VIEW_THUMBNAILS: "viewThumbnails",
    GET_VIDEO_COMMENTS: "getVideoComments",
    GET_CHANNEL_OVERVIEW: "getChannelOverview",
    BROWSE_CHANNEL_VIDEOS: "browseChannelVideos",
    ANALYZE_TRAFFIC_SOURCES: "analyzeTrafficSources",
    LIST_TREND_CHANNELS: "listTrendChannels",
    BROWSE_TREND_VIDEOS: "browseTrendVideos",
    GET_NICHE_SNAPSHOT: "getNicheSnapshot",
    FIND_SIMILAR_VIDEOS: "findSimilarVideos",
    SEARCH_DATABASE: "searchDatabase",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

// --- Provider-agnostic tool declarations ---

const mentionVideo: ToolDefinition = {
    name: TOOL_NAMES.MENTION_VIDEO,
    description:
        "Reference a specific video in your response. Call this tool whenever you mention " +
        "or discuss a video — the UI renders an interactive badge the user can click. " +
        "Works for ANY video you know the ID of: from attached context, from previous tool " +
        "results (e.g. analyzeSuggestedTraffic topSources), or from conversation history. " +
        "Do NOT write plain text references like 'Video #3' — always use this tool instead. " +
        "IMPORTANT: videoId must be the exact ID from the [id: ...] annotation in the context " +
        "or from previous tool results. Never invent IDs. " +
        "After calling this tool, write [Title](mention://videoId) in your response text.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoId: {
                type: "string",
                description:
                    "The unique ID of the video to reference. Can come from [id: ...] in context, " +
                    "from videoId fields in previous tool results, or from conversation history.",
            },
        },
        required: ["videoId"],
    },
};

const getMultipleVideoDetails: ToolDefinition = {
    name: TOOL_NAMES.GET_MULTIPLE_VIDEO_DETAILS,
    description:
        "Fetch full metadata (description, tags, etc.) for one or more videos by their IDs. " +
        "The context only contains compact info (title + key metrics). Use this tool when " +
        "you need description, tags, or other detailed fields to answer the user's question. " +
        "Response includes view growth data (viewDelta24h/7d/30d) when the video's channel " +
        "is tracked in Trends — use these to assess whether a video is actively growing or stagnating. " +
        "You can request up to 20 videos in a single call.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoIds: {
                type: "array",
                items: { type: "string" },
                description:
                    "Array of video IDs to look up (from the [id: ...] annotation in context).",
            },
        },
        required: ["videoIds"],
    },
};

const analyzeSuggestedTraffic: ToolDefinition = {
    name: TOOL_NAMES.ANALYZE_SUGGESTED_TRAFFIC,
    description:
        "Analyze suggested traffic data for a video. Downloads all CSV snapshots, " +
        "builds per-video timeline trajectories across all snapshots with pre-computed deltas, " +
        "identifies pool transitions (new/dropped sources per period), and optionally analyzes " +
        "tag/keyword overlap. Each suggested video includes YouTube-wide view deltas " +
        "(viewDelta24h/7d/30d) showing whether it is growing or stagnating on YouTube overall. " +
        "Returns structured findings for strategic interpretation. " +
        "Use when the user asks about suggested traffic, algorithmic neighbors, " +
        "or which videos appear alongside theirs. " +
        "IMPORTANT: This tool only works for videos that have Suggested Traffic CSV snapshots " +
        "uploaded by the user in the app. Check suggestedTrafficSnapshotCount from " +
        "getMultipleVideoDetails — if 0 or missing, do NOT call this tool. " +
        "External videos and videos not imported into the app will never have this data. " +
        "After analysis, use mentionVideo to reference key competitor videos from topSources " +
        "so the user sees interactive badges instead of plain text names. " +
        "If your findings lead to CTR or thumbnail recommendations, also call viewThumbnails " +
        "with the relevant videoIds to visually compare covers before advising.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoId: {
                type: "string",
                description: "The video ID to analyze suggested traffic for",
            },
            depth: {
                type: "string",
                enum: ["quick", "standard", "detailed", "deep"],
                description:
                    "Analysis depth: quick=top 20, standard=top 50 (default), " +
                    "detailed=top 100, deep=all sources",
            },
            minImpressions: {
                type: "number",
                description: "Filter out sources with fewer impressions",
            },
            minViews: {
                type: "number",
                description: "Filter out sources with fewer views",
            },
            includeContentAnalysis: {
                type: "boolean",
                description:
                    "Include tag/keyword/channel analysis (default true, heavier operation)",
            },
        },
        required: ["videoId"],
    },
};

const viewThumbnails: ToolDefinition = {
    name: TOOL_NAMES.VIEW_THUMBNAILS,
    description:
        "View actual video thumbnails as images. Call this PROACTIVELY when your analysis " +
        "leads to thumbnail, CTR, or cover art recommendations — do the visual comparison yourself " +
        "instead of asking the user to look. Also use when you need to visually analyze, " +
        "compare, or describe the cover art of specific videos. Works for BOTH own AND " +
        "competitor/suggested traffic videos. Returns the images so you can see them directly. " +
        "Use videoIds from any source: attached context, previous tool results " +
        "(e.g. analyzeSuggestedTraffic topSources), or conversation history. " +
        "If you only know video titles but not IDs, pass them in the titles parameter — " +
        "the system will look them up. You can request up to 50 videos in a single call.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoIds: {
                type: "array",
                items: { type: "string" },
                description: "Array of video IDs to load thumbnails for.",
            },
            titles: {
                type: "array",
                items: { type: "string" },
                description:
                    "Optional fallback: exact video titles to look up when videoIds are unknown. " +
                    "Use exact titles as they appeared in previous tool results.",
            },
        },
    },
};

const getVideoComments: ToolDefinition = {
    name: TOOL_NAMES.GET_VIDEO_COMMENTS,
    description:
        "Read comments from any public YouTube video. Returns top-level comment threads " +
        "with author, text, like count, reply count, and inline replies. " +
        "Default: 100 comments sorted by relevance (YouTube ML-ranking). " +
        "Use after getMultipleVideoDetails when commentCount suggests active discussion. " +
        "Costs 1 API unit per 100 comments. " +
        "Pass maxPages (1-3) only if the user explicitly asks for more coverage.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoId: {
                type: "string",
                description: "The video ID to read comments from.",
            },
            order: {
                type: "string",
                enum: ["relevance", "time"],
                description:
                    "Sort order. 'relevance' (default) = YouTube ML ranking (best engagement). " +
                    "'time' = newest first.",
            },
            maxResults: {
                type: "number",
                description: "Comments per page (1-100, default 100).",
            },
            maxPages: {
                type: "number",
                description:
                    "Number of pages to fetch (1-3, default 1). " +
                    "Only increase if the user EXPLICITLY asks for more comments.",
            },
        },
        required: ["videoId"],
    },
};

const getChannelOverview: ToolDefinition = {
    name: TOOL_NAMES.GET_CHANNEL_OVERVIEW,
    description:
        "Look up a YouTube channel by URL, @handle, or channel ID. " +
        "Returns channel metadata (title, subscriberCount, videoCount) and uploadsPlaylistId. " +
        "Always safe — costs 1-2 API units. " +
        "IMPORTANT: always call this BEFORE browseChannelVideos. " +
        "The response includes a quota estimate — ask the user to approve before proceeding to browseChannelVideos.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            channelId: {
                type: "string",
                description:
                    "YouTube channel URL (youtube.com/@handle, youtube.com/channel/UCxxx), " +
                    "@handle, or raw channel ID.",
            },
        },
        required: ["channelId"],
    },
};

const browseChannelVideos: ToolDefinition = {
    name: TOOL_NAMES.BROWSE_CHANNEL_VIDEOS,
    description:
        "Fetch the video list from a YouTube channel's uploads playlist. " +
        "Requires uploadsPlaylistId from a prior getChannelOverview call — " +
        "do NOT call this tool without calling getChannelOverview first and getting user approval for the quota cost. " +
        "Returns a compact chronological list (videoId, title, publishedAt, viewCount, thumbnailUrl). " +
        "Use publishedAfter to narrow the time range and save quota. " +
        "Pass channelId from getChannelOverview to enable trend channel caching (saves quota if channel is tracked). " +
        "When browsing the user's own channel, the response includes ownChannelSync (inApp vs onYouTube vs notInApp) — " +
        "highlight this sync comparison to help the user see which videos are missing from the app. " +
        "After browsing, use getMultipleVideoDetails for full metadata (description, tags) on specific videos " +
        "— the data is already cached, so it costs 0 quota units.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            uploadsPlaylistId: {
                type: "string",
                description:
                    "The uploadsPlaylistId from getChannelOverview response. Required.",
            },
            channelId: {
                type: "string",
                description:
                    "The channelId from getChannelOverview response. Optional — enables trend channel caching " +
                    "to save quota if this channel is tracked in Trends.",
            },
            publishedAfter: {
                type: "string",
                description:
                    "ISO date string (e.g. '2024-10-01'). Only return videos published after this date. " +
                    "Saves quota for large channels by narrowing the fetch window.",
            },
        },
        required: ["uploadsPlaylistId"],
    },
};

const analyzeTrafficSources: ToolDefinition = {
    name: TOOL_NAMES.ANALYZE_TRAFFIC_SOURCES,
    description:
        "Analyze WHERE a video's traffic comes from (Browse, Suggested, Search, External, etc.). " +
        "Returns a per-source breakdown with timeline and pre-computed deltas across snapshots. " +
        "Use this tool BEFORE analyzeSuggestedTraffic — it's the gateway: " +
        "if Suggested traffic dominates, THEN drill down with analyzeSuggestedTraffic to see the specific videos. " +
        "IMPORTANT: This tool only works for videos that have Traffic Source CSV snapshots " +
        "uploaded by the user in the app. Check trafficSourceSnapshotCount from " +
        "getMultipleVideoDetails — if 0 or missing, do NOT call this tool. " +
        "External videos and videos not imported into the app will never have this data.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoId: {
                type: "string",
                description: "The video ID to analyze traffic sources for.",
            },
        },
        required: ["videoId"],
    },
};

// --- Layer 4: Competition (Firestore-only, zero YouTube API cost) ---

const listTrendChannels: ToolDefinition = {
    name: TOOL_NAMES.LIST_TREND_CHANNELS,
    description:
        "List all competitor channels the user is tracking in Trends. " +
        "Returns channel metadata, video counts, average views, and performance distribution (p25/median/p75/max). " +
        "Call this FIRST when the user asks about competitors — it gives you the landscape. " +
        "Zero API cost (all data from Firestore). " +
        "Use the channelId values from the response to filter subsequent browseTrendVideos calls.",
    parametersJsonSchema: {
        type: "object",
        properties: {},
    },
};

const browseTrendVideos: ToolDefinition = {
    name: TOOL_NAMES.BROWSE_TREND_VIDEOS,
    description:
        "Browse and filter competitor videos from Trends data. " +
        "Supports filtering by channels, date range, and performance tier. " +
        "Each video includes per-channel performance tier and view growth deltas (24h/7d/30d). " +
        "Default limit is 50 videos (~6K tokens), max 200. " +
        "Response always includes totalMatched — if truncated, narrow filters or increase limit. " +
        "Zero API cost (all data from Firestore). " +
        "Use after listTrendChannels to explore specific channels or time periods. " +
        "To see thumbnails of results, pass videoIds to viewThumbnails.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            channelIds: {
                type: "array",
                items: { type: "string" },
                description:
                    "Filter to specific competitor channel IDs (from listTrendChannels). " +
                    "Omit to browse all tracked channels.",
            },
            dateRange: {
                type: "object",
                properties: {
                    from: { type: "string", description: "Start date (ISO 8601, e.g. '2026-02-01')" },
                    to: { type: "string", description: "End date (ISO 8601, e.g. '2026-03-01')" },
                },
                description: "Filter videos by publish date range.",
            },
            performanceTier: {
                type: "string",
                enum: ["Top 1%", "Top 5%", "Top 20%", "Middle 60%", "Bottom 20%"],
                description:
                    "Filter by performance tier (per-channel percentile). " +
                    "E.g. 'Top 1%' returns the best-performing videos of EACH channel.",
            },
            sort: {
                type: "string",
                enum: ["date", "views", "delta24h", "delta7d", "delta30d"],
                description: "Sort order (default: 'date'). Delta sorts fall back to views if data unavailable.",
            },
            limit: {
                type: "number",
                description: "Max videos to return (default 50, max 200).",
            },
        },
    },
};

const getNicheSnapshot: ToolDefinition = {
    name: TOOL_NAMES.GET_NICHE_SNAPSHOT,
    description:
        "Get a snapshot of competitor activity around a specific date. " +
        "Shows what all tracked channels published in a time window (default ±7 days), " +
        "grouped by channel with per-channel stats, view-weighted top tags, and top performers. " +
        "Returns structured data + pre-computed aggregates for your interpretation. " +
        "Zero API cost (all data from Firestore). " +
        "Prefer the 'date' parameter when publishedAt is known from context (zero extra reads). " +
        "Use 'videoId' only when date is unavailable. " +
        "Pass 'channelId' alongside 'videoId' when known (from browseTrendVideos result) to minimize lookups. " +
        "At least one of 'date' or 'videoId' is required.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            date: {
                type: "string",
                description:
                    "Reference date (ISO 8601, e.g. '2026-02-20'). Primary input — use when publishedAt is known.",
            },
            videoId: {
                type: "string",
                description:
                    "Video ID to use as reference point. Fallback — the tool resolves its publishedAt. " +
                    "Prefer 'date' when available.",
            },
            channelId: {
                type: "string",
                description:
                    "Channel ID of the video (from browseTrendVideos). Optimization — reduces lookup to 1 read.",
            },
            windowDays: {
                type: "number",
                description: "Half-window size in days (default 7 = ±7 days = 14 days total).",
            },
        },
    },
};

// --- Layer 4: Competition — Semantic search (embedding-based) ---

const findSimilarVideos: ToolDefinition = {
    name: TOOL_NAMES.FIND_SIMILAR_VIDEOS,
    description:
        "Find competitor videos similar to a given video. Three search modes: " +
        "'packaging' for topic similarity (title, tags, description), " +
        "'visual' for thumbnail/visual style similarity, " +
        "'both' for comprehensive match using Reciprocal Rank Fusion to combine results. " +
        "Returns ranked results with similarity scores, performance data, and view growth metrics. " +
        "Use after browseTrendVideos or getMultipleVideoDetails when user asks about similar content, " +
        "competitive overlap, visual trends, or topic analysis. " +
        "Pass videoId from any previous tool result.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoId: {
                type: "string",
                description:
                    "The video ID to find similar videos for. Can be own video or competitor video.",
            },
            mode: {
                type: "string",
                enum: ["packaging", "visual", "both"],
                description:
                    "Search mode. 'packaging' = topic similarity (default). " +
                    "'visual' = thumbnail image similarity. " +
                    "'both' = combined search with Reciprocal Rank Fusion.",
            },
            limit: {
                type: "number",
                description: "Max results to return (default 20, max 50).",
            },
        },
        required: ["videoId"],
    },
};

const searchDatabase: ToolDefinition = {
    name: TOOL_NAMES.SEARCH_DATABASE,
    description:
        "Search the competitor video database using free-text semantic search. " +
        "Use when the user asks about topics, themes, or concepts across competitor videos " +
        "(e.g., 'what videos exist about AI?', 'find videos about cooking challenges'). " +
        "Returns semantically relevant videos ranked by relevance with view deltas and performance tiers. " +
        "Only searches videos from user's tracked trend channels. " +
        "For finding videos similar to a SPECIFIC video, use findSimilarVideos instead.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description:
                    "Free-text search query describing what to find " +
                    "(e.g., 'Iceland travel vlog', 'AI tools tutorial'). Minimum 3 characters.",
            },
            channelIds: {
                type: "array",
                items: { type: "string" },
                description:
                    "Optional. YouTube channel IDs (UC...) to limit search to specific channels. " +
                    "If omitted, searches all tracked trend channels.",
            },
            limit: {
                type: "number",
                description: "Maximum number of results to return. Default: 20, max: 50.",
            },
        },
        required: ["query"],
    },
};

// --- Exported registry ---

export const TOOL_DECLARATIONS: ToolDefinition[] = [
    mentionVideo,
    getMultipleVideoDetails,
    analyzeSuggestedTraffic,
    viewThumbnails,
    getVideoComments,
    getChannelOverview,
    browseChannelVideos,
    analyzeTrafficSources,
    listTrendChannels,
    browseTrendVideos,
    getNicheSnapshot,
    findSimilarVideos,
    searchDatabase,
];

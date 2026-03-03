// =============================================================================
// Tool Definitions — Gemini Function Calling declarations
//
// Single source of truth for all tools available to the AI agent.
// Each tool has a FunctionDeclaration (for Gemini API) and metadata.
//
// To add a new tool:
//   1. Add the name to TOOL_NAMES
//   2. Create a FunctionDeclaration below
//   3. Add a handler in handlers/ directory
//   4. Register the handler in executor.ts HANDLERS map
// =============================================================================

import type { FunctionDeclaration } from "@google/genai";

// --- Tool name constants (used by executor for routing) ---

export const TOOL_NAMES = {
    MENTION_VIDEO: "mentionVideo",
    GET_MULTIPLE_VIDEO_DETAILS: "getMultipleVideoDetails",
    ANALYZE_SUGGESTED_TRAFFIC: "analyzeSuggestedTraffic",
    VIEW_THUMBNAILS: "viewThumbnails",
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

// --- Declarations for Gemini Function Calling API ---

const mentionVideo: FunctionDeclaration = {
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

const getMultipleVideoDetails: FunctionDeclaration = {
    name: TOOL_NAMES.GET_MULTIPLE_VIDEO_DETAILS,
    description:
        "Fetch full metadata (description, tags, etc.) for one or more videos by their IDs. " +
        "The context only contains compact info (title + key metrics). Use this tool when " +
        "you need description, tags, or other detailed fields to answer the user's question. " +
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

const analyzeSuggestedTraffic: FunctionDeclaration = {
    name: TOOL_NAMES.ANALYZE_SUGGESTED_TRAFFIC,
    description:
        "Analyze suggested traffic data for a video. Downloads all CSV snapshots, " +
        "builds per-video timeline trajectories across all snapshots with pre-computed deltas, " +
        "identifies pool transitions (new/dropped sources per period), and optionally analyzes " +
        "tag/keyword overlap. Returns structured findings for strategic interpretation. " +
        "Use when the user asks about suggested traffic, algorithmic neighbors, " +
        "or which videos appear alongside theirs. " +
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

const viewThumbnails: FunctionDeclaration = {
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

// --- Exported registry ---

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
    mentionVideo,
    getMultipleVideoDetails,
    analyzeSuggestedTraffic,
    viewThumbnails,
];

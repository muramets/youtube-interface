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
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

// --- Declarations for Gemini Function Calling API ---

const mentionVideo: FunctionDeclaration = {
    name: TOOL_NAMES.MENTION_VIDEO,
    description:
        "Reference a specific video in your response. Call this tool whenever you want to " +
        "mention or discuss a video from the attached context. Pass the video's ID so the " +
        "UI can render an interactive badge. Do NOT write plain text references like " +
        "'Video #3' — always use this tool instead.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            videoId: {
                type: "string",
                description:
                    "The unique ID of the video to reference (from the [id: ...] annotation in context).",
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

// --- Exported registry ---

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
    mentionVideo,
    getMultipleVideoDetails,
];

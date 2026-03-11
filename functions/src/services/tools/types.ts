// =============================================================================
// Tool Types — shared interfaces for the tool execution system
// =============================================================================

export interface ToolContext {
    userId: string;
    channelId: string;
    /** User's channel name — used for video ownership detection (own vs competitor). */
    channelName?: string;
    /** User's YouTube Data API key (from Firestore settings). */
    youtubeApiKey?: string;
    /** Optional: emit a mid-execution progress message to the client via SSE. */
    reportProgress?: (message: string) => void;
}

export interface FunctionCallInput {
    name: string;
    args: Record<string, unknown>;
}

export interface FunctionCallResult {
    name: string;
    response: Record<string, unknown> & {
        visualContextUrls?: string[];
    };
}

/** Signature for all tool handlers */
export type ToolHandler = (
    args: Record<string, unknown>,
    ctx: ToolContext,
) => Promise<Record<string, unknown>>;

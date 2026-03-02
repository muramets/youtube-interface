// =============================================================================
// Tool Types — shared interfaces for the tool execution system
// =============================================================================

export interface ToolContext {
    userId: string;
    channelId: string;
}

export interface FunctionCallInput {
    name: string;
    args: Record<string, unknown>;
}

export interface FunctionCallResult {
    name: string;
    response: Record<string, unknown>;
}

/** Signature for all tool handlers */
export type ToolHandler = (
    args: Record<string, unknown>,
    ctx: ToolContext,
) => Promise<Record<string, unknown>>;

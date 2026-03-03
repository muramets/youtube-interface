// =============================================================================
// Tool Executor — dispatcher for Gemini Function Calls
//
// Routes functionCall.name → handler → FunctionResponse.
// Handlers are registered in the HANDLERS map below.
// =============================================================================

import { TOOL_NAMES, type ToolName } from "./definitions.js";
import type { ToolContext, FunctionCallInput, FunctionCallResult, ToolHandler } from "./types.js";
import { handleMentionVideo } from "./handlers/mentionVideo.js";
import { handleGetMultipleVideoDetails } from "./handlers/getMultipleVideoDetails.js";
import { handleAnalyzeSuggestedTraffic } from "./handlers/analyzeSuggestedTraffic.js";

// --- Handler registry ---

const HANDLERS: Record<ToolName, ToolHandler> = {
    [TOOL_NAMES.MENTION_VIDEO]: handleMentionVideo,
    [TOOL_NAMES.GET_MULTIPLE_VIDEO_DETAILS]: handleGetMultipleVideoDetails,
    [TOOL_NAMES.ANALYZE_SUGGESTED_TRAFFIC]: handleAnalyzeSuggestedTraffic,
};

// --- Dispatcher ---

/**
 * Execute a tool call from Gemini and return the result.
 * Unknown tool names return a graceful error (no crash).
 */
export async function executeTool(
    call: FunctionCallInput,
    ctx: ToolContext,
): Promise<FunctionCallResult> {
    const t0 = Date.now();
    const handler = HANDLERS[call.name as ToolName];

    if (!handler) {
        console.warn(`[toolExecutor] Unknown tool: ${call.name}`);
        return {
            name: call.name,
            response: { error: `Unknown tool: ${call.name}` },
        };
    }

    try {
        const response = await handler(call.args, ctx);
        console.log(
            `[toolExecutor] ${call.name}(${JSON.stringify(call.args)}) → ${Date.now() - t0}ms`,
        );
        return { name: call.name, response };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Tool execution failed";
        console.error(`[toolExecutor] ${call.name} failed:`, message);
        return {
            name: call.name,
            response: { error: message },
        };
    }
}

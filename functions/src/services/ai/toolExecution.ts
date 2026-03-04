// =============================================================================
// Tool Execution — Shared tool dispatch for all AI providers
//
// Handles the universal steps of executing tool calls; providers handle
// formatting results into their native message format.
// =============================================================================

import { executeTool } from "../tools/executor.js";
import type { ToolContext } from "../tools/types.js";
import type { StreamCallbacks } from "./types.js";

// --- Result types ---

/** Result of a single tool execution within a batch. */
export interface ToolExecEntry {
    /** Tool name that was called. */
    name: string;
    /** Arguments passed to the tool. */
    args: Record<string, unknown>;
    /** Tool execution result (may include provider-specific fields). */
    result: Record<string, unknown>;
    /** Image URLs extracted from the tool response (if any). */
    imageUrls?: string[];
}

/** Aggregated result of executing a batch of tool calls. */
export interface ToolBatchResult {
    results: ToolExecEntry[];
    /** Number of image batches blocked by the approval gate (if any). */
    blockedCount?: number;
}

// --- Image processing callback ---

/**
 * Provider-specific callback for processing images from tool responses.
 * Each provider implements this differently (e.g. Gemini uploads to Files API,
 * Claude inlines base64, etc.).
 */
export interface ProcessImagesResult {
    /** URLs of successfully processed images. */
    imageUrls: string[];
    /** Tool response with image-related fields stripped/cleaned. */
    cleanedResponse: Record<string, unknown>;
    /** Number of images blocked by approval gate. */
    blockedCount?: number;
}

// --- Batch execution options ---

export interface ExecuteToolBatchOpts {
    /** Tool calls to execute (name + args from the model response). */
    calls: Array<{ name: string; args: Record<string, unknown> }>;
    /** Context for tool execution (userId, channelId). */
    toolContext: ToolContext;
    /** Callbacks for progress reporting (subset of StreamCallbacks). */
    callbacks: Pick<StreamCallbacks, "onToolCall" | "onToolResult" | "onToolProgress">;
    /** Starting index for this batch within the overall tool call sequence. */
    batchStartIndex: number;
    /**
     * Provider-specific image processing callback.
     * Called for each tool response to extract and process images.
     * If not provided, images are not processed and the raw response is used.
     */
    processImages?: (
        response: Record<string, unknown>,
    ) => Promise<ProcessImagesResult>;
}

// --- Batch executor ---

/**
 * Execute a batch of tool calls in parallel and return aggregated results.
 *
 * Steps for each tool call:
 *   1. Fire `onToolCall` callback (UI shows pending badge)
 *   2. Call `executeTool()` from tools/executor
 *   3. Optionally process images via provider-specific callback
 *   4. Fire `onToolResult` callback (UI updates badge)
 *   5. Collect result for the provider to format into its message format
 */
export async function executeToolBatch(
    opts: ExecuteToolBatchOpts,
): Promise<ToolBatchResult> {
    const { calls, toolContext, callbacks, batchStartIndex, processImages } = opts;

    // 1. Fire onToolCall for all calls immediately (UI shows pending state)
    for (let i = 0; i < calls.length; i++) {
        const fc = calls[i];
        callbacks.onToolCall?.(fc.name, fc.args, batchStartIndex + i);
    }

    // 2. Execute all tools in parallel
    const rawResults = await Promise.all(
        calls.map((fc, i) => {
            const callIndex = batchStartIndex + i;
            console.log(
                `[executeToolBatch] Executing tool: ${fc.name}(${JSON.stringify(fc.args)})`,
            );
            const toolCtxWithProgress: ToolContext = {
                ...toolContext,
                reportProgress: (message: string) => {
                    callbacks.onToolProgress?.(fc.name, message, callIndex);
                },
            };
            return executeTool({ name: fc.name, args: fc.args }, toolCtxWithProgress);
        }),
    );

    // 3. Process results: handle images, fire onToolResult
    const entries: ToolExecEntry[] = [];
    let totalBlockedCount: number | undefined;

    for (let i = 0; i < rawResults.length; i++) {
        const rawResult = rawResults[i];
        const fc = calls[i];
        const callIndex = batchStartIndex + i;

        let result = rawResult.response;
        let imageUrls: string[] | undefined;

        // Provider-specific image processing
        if (processImages) {
            const processed = await processImages(rawResult.response);
            result = processed.cleanedResponse;
            if (processed.imageUrls.length > 0) {
                imageUrls = processed.imageUrls;
            }
            if (processed.blockedCount) {
                totalBlockedCount = (totalBlockedCount ?? 0) + processed.blockedCount;
            }
        }

        // 4. Fire onToolResult
        callbacks.onToolResult?.(rawResult.name, result, callIndex);

        entries.push({
            name: rawResult.name,
            args: fc.args,
            result,
            imageUrls,
        });
    }

    return {
        results: entries,
        blockedCount: totalBlockedCount,
    };
}

// =============================================================================
// SSE Writer — type-safe Server-Sent Events helper
//
// Ensures all SSE events sent to the client match the expected shape.
// MIRROR: src/core/types/sseEvents.ts — event types must stay in sync.
// =============================================================================

import type { ToolCallRecord, TokenUsage } from "../services/gemini/index.js";

// --- SSE event types (server-side mirror of client SSEEvent union) ---

type SSEChunkEvent = { type: "chunk"; text: string };
type SSEToolCallEvent = { type: "toolCall"; name: string; args: Record<string, unknown> };
type SSEToolResultEvent = { type: "toolResult"; name: string; result: Record<string, unknown> };
type SSEThoughtEvent = { type: "thought"; text: string };
type SSEDoneEvent = {
    type: "done";
    text: string;
    tokenUsage?: TokenUsage;
    toolCalls?: ToolCallRecord[];
    summary?: string;
    usedSummary?: boolean;
};
type SSEErrorEvent = { type: "error"; error: string };

export type SSEEvent =
    | SSEChunkEvent
    | SSEToolCallEvent
    | SSEToolResultEvent
    | SSEThoughtEvent
    | SSEDoneEvent
    | SSEErrorEvent;

// --- Writer ---

/**
 * Write a typed SSE event to the response stream.
 * Ensures payload matches the discriminated union — typos and missing fields
 * are caught at compile time.
 */
export function writeSSE(
    res: { write: (data: string) => boolean },
    event: SSEEvent,
): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
}

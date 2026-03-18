// =============================================================================
// SSE Writer — type-safe Server-Sent Events helper
//
// Ensures all SSE events sent to the client match the expected shape.
// MIRROR: src/core/types/sseEvents.ts — event types must stay in sync.
// =============================================================================

import type { ToolCallRecord, TokenUsage } from "../services/ai/types.js";
import type { NormalizedTokenUsage, ContextBreakdown } from "../shared/models.js";

// --- SSE event types (server-side mirror of client SSEEvent union) ---

type SSEChunkEvent = { type: "chunk"; text: string };
type SSEToolCallEvent = { type: "toolCall"; name: string; args: Record<string, unknown>; toolCallIndex: number };
type SSEToolResultEvent = { type: "toolResult"; name: string; result: Record<string, unknown>; toolCallIndex: number };
type SSEThoughtEvent = { type: "thought"; text: string };
type SSEDoneEvent = {
    type: "done";
    text: string;
    tokenUsage?: TokenUsage;
    normalizedUsage?: NormalizedTokenUsage;
    toolCalls?: ToolCallRecord[];
    summary?: string;
    usedSummary?: boolean;
    status?: 'complete' | 'stopped';
    partial?: boolean;
    contextBreakdown?: ContextBreakdown;
    messageId?: string;
};
type SSEToolProgressEvent = { type: "toolProgress"; toolName: string; message: string; toolCallIndex: number };
type SSEErrorEvent = { type: "error"; error: string };
type SSEConfirmLargePayloadEvent = { type: "confirmLargePayload"; count: number };
type SSERetryEvent = { type: "retry"; attempt: number };
type SSEHeartbeatEvent = { type: "heartbeat" };

export type SSEEvent =
    | SSEChunkEvent
    | SSEToolCallEvent
    | SSEToolResultEvent
    | SSEThoughtEvent
    | SSEDoneEvent
    | SSEToolProgressEvent
    | SSEErrorEvent
    | SSEConfirmLargePayloadEvent
    | SSERetryEvent
    | SSEHeartbeatEvent;

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

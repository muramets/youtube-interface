// =============================================================================
// SSE Event Types — Discriminated union for AI Chat streaming events
//
// Used by both the server (aiChat.ts) and the client (aiProxyService.ts)
// to ensure type-safe SSE communication.
// =============================================================================

// --- Tool call record (persisted in ChatMessage) ---

// MIRROR: functions/src/services/gemini/client.ts:ToolCallRecord — keep in sync
export interface ToolCallRecord {
    name: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
}

// --- Token usage (shared with existing types) ---

export interface SSETokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

// --- SSE event discriminated union ---

export type SSEEvent =
    | SSEChunkEvent
    | SSEToolCallEvent
    | SSEToolResultEvent
    | SSEThoughtEvent
    | SSEDoneEvent
    | SSEToolProgressEvent
    | SSEErrorEvent
    | SSEConfirmLargePayloadEvent;

export interface SSEChunkEvent {
    type: 'chunk';
    text: string;
}

export interface SSEToolCallEvent {
    type: 'toolCall';
    name: string;
    args: Record<string, unknown>;
    toolCallIndex: number;
}

export interface SSEToolResultEvent {
    type: 'toolResult';
    name: string;
    result: Record<string, unknown>;
    toolCallIndex: number;
}

export interface SSEThoughtEvent {
    type: 'thought';
    text: string;
}

export interface SSEDoneEvent {
    type: 'done';
    text: string;
    tokenUsage?: SSETokenUsage;
    toolCalls?: ToolCallRecord[];
    summary?: string;
    usedSummary?: boolean;
}

export interface SSEToolProgressEvent {
    type: 'toolProgress';
    toolName: string;
    message: string;
    toolCallIndex: number;
}

export interface SSEErrorEvent {
    type: 'error';
    error: string;
}

export interface SSEConfirmLargePayloadEvent {
    type: 'confirmLargePayload';
    count: number;
}

// --- Parser ---

/**
 * Parse a raw SSE data string into a typed SSEEvent.
 * Returns null if the data cannot be parsed.
 */
export function parseSSEEvent(data: string): SSEEvent | null {
    try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        const type = parsed.type as string;

        switch (type) {
            case 'chunk':
                return { type: 'chunk', text: parsed.text as string };
            case 'toolCall':
                return {
                    type: 'toolCall',
                    name: parsed.name as string,
                    args: (parsed.args as Record<string, unknown>) ?? {},
                    toolCallIndex: (parsed.toolCallIndex as number) ?? 0,
                };
            case 'toolResult':
                return {
                    type: 'toolResult',
                    name: parsed.name as string,
                    result: (parsed.result as Record<string, unknown>) ?? {},
                    toolCallIndex: (parsed.toolCallIndex as number) ?? 0,
                };
            case 'thought':
                return { type: 'thought', text: parsed.text as string };
            case 'done':
                return {
                    type: 'done',
                    text: parsed.text as string,
                    tokenUsage: parsed.tokenUsage as SSETokenUsage | undefined,
                    toolCalls: parsed.toolCalls as ToolCallRecord[] | undefined,
                    summary: parsed.summary as string | undefined,
                    usedSummary: parsed.usedSummary as boolean | undefined,
                };
            case 'toolProgress':
                return {
                    type: 'toolProgress',
                    toolName: String(parsed.toolName ?? ''),
                    message: String(parsed.message ?? ''),
                    toolCallIndex: (parsed.toolCallIndex as number) ?? 0,
                };
            case 'error':
                return { type: 'error', error: parsed.error as string };
            case 'confirmLargePayload':
                return { type: 'confirmLargePayload', count: parsed.count as number };
            default:
                console.warn(`[parseSSEEvent] Unknown event type: ${type}`);
                return null;
        }
    } catch {
        console.warn('[parseSSEEvent] Failed to parse SSE data:', data.slice(0, 100));
        return null;
    }
}

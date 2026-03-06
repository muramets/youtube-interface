// =============================================================================
// sseEvents.test.ts — Characterization tests for parseSSEEvent()
//
// These tests lock down the existing behavior of the SSE event parser
// before any refactoring. Every event type, field, default, and edge case
// is covered so regressions are caught immediately.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSSEEvent } from '../sseEvents';
import type {
    SSEChunkEvent,
    SSEToolCallEvent,
    SSEToolResultEvent,
    SSEThoughtEvent,
    SSEDoneEvent,
    SSEToolProgressEvent,
    SSEErrorEvent,
    SSEConfirmLargePayloadEvent,
    SSERetryEvent,
} from '../sseEvents';

// ---------------------------------------------------------------------------
// Suppress console.warn from the parser during tests — we assert on it instead
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.restoreAllMocks();
});

// ===========================================================================
// 1. chunk event
// ===========================================================================
describe('parseSSEEvent — chunk', () => {
    it('parses a text chunk with content', () => {
        const data = JSON.stringify({ type: 'chunk', text: 'Hello world' });
        const result = parseSSEEvent(data) as SSEChunkEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('chunk');
        expect(result.text).toBe('Hello world');
    });

    it('parses a chunk with empty text', () => {
        const data = JSON.stringify({ type: 'chunk', text: '' });
        const result = parseSSEEvent(data) as SSEChunkEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('chunk');
        expect(result.text).toBe('');
    });

    it('parses a chunk with markdown content', () => {
        const markdown = '## Heading\n\n- item 1\n- item 2\n\n```ts\nconst x = 1;\n```';
        const data = JSON.stringify({ type: 'chunk', text: markdown });
        const result = parseSSEEvent(data) as SSEChunkEvent;

        expect(result.text).toBe(markdown);
    });

    it('only includes type and text fields', () => {
        const data = JSON.stringify({ type: 'chunk', text: 'hi' });
        const result = parseSSEEvent(data);

        expect(result).toEqual({ type: 'chunk', text: 'hi' });
    });
});

// ===========================================================================
// 2. toolCall event
// ===========================================================================
describe('parseSSEEvent — toolCall', () => {
    it('parses a tool call with all fields present', () => {
        const data = JSON.stringify({
            type: 'toolCall',
            name: 'getVideoStats',
            args: { videoId: 'abc123', period: '30d' },
            toolCallIndex: 2,
        });
        const result = parseSSEEvent(data) as SSEToolCallEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('toolCall');
        expect(result.name).toBe('getVideoStats');
        expect(result.args).toEqual({ videoId: 'abc123', period: '30d' });
        expect(result.toolCallIndex).toBe(2);
    });

    it('defaults toolCallIndex to 0 when missing', () => {
        const data = JSON.stringify({
            type: 'toolCall',
            name: 'search',
            args: { query: 'test' },
        });
        const result = parseSSEEvent(data) as SSEToolCallEvent;

        expect(result.toolCallIndex).toBe(0);
    });

    it('defaults args to empty object when missing', () => {
        const data = JSON.stringify({
            type: 'toolCall',
            name: 'listChannels',
            toolCallIndex: 1,
        });
        const result = parseSSEEvent(data) as SSEToolCallEvent;

        expect(result.args).toEqual({});
    });

    it('preserves nested args structure', () => {
        const args = { filter: { status: 'active', tags: ['a', 'b'] }, limit: 10 };
        const data = JSON.stringify({ type: 'toolCall', name: 'query', args, toolCallIndex: 0 });
        const result = parseSSEEvent(data) as SSEToolCallEvent;

        expect(result.args).toEqual(args);
    });
});

// ===========================================================================
// 3. toolResult event
// ===========================================================================
describe('parseSSEEvent — toolResult', () => {
    it('parses a tool result with all fields present', () => {
        const data = JSON.stringify({
            type: 'toolResult',
            name: 'getVideoStats',
            result: { views: 12000, likes: 350 },
            toolCallIndex: 1,
        });
        const result = parseSSEEvent(data) as SSEToolResultEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('toolResult');
        expect(result.name).toBe('getVideoStats');
        expect(result.result).toEqual({ views: 12000, likes: 350 });
        expect(result.toolCallIndex).toBe(1);
    });

    it('defaults toolCallIndex to 0 when missing', () => {
        const data = JSON.stringify({
            type: 'toolResult',
            name: 'search',
            result: { items: [] },
        });
        const result = parseSSEEvent(data) as SSEToolResultEvent;

        expect(result.toolCallIndex).toBe(0);
    });

    it('defaults result to empty object when missing', () => {
        const data = JSON.stringify({
            type: 'toolResult',
            name: 'noDataTool',
            toolCallIndex: 0,
        });
        const result = parseSSEEvent(data) as SSEToolResultEvent;

        expect(result.result).toEqual({});
    });
});

// ===========================================================================
// 4. thought event
// ===========================================================================
describe('parseSSEEvent — thought', () => {
    it('parses a thought event with text', () => {
        const data = JSON.stringify({
            type: 'thought',
            text: 'Let me analyze the video metrics...',
        });
        const result = parseSSEEvent(data) as SSEThoughtEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('thought');
        expect(result.text).toBe('Let me analyze the video metrics...');
    });

    it('parses a thought with empty text', () => {
        const data = JSON.stringify({ type: 'thought', text: '' });
        const result = parseSSEEvent(data) as SSEThoughtEvent;

        expect(result.type).toBe('thought');
        expect(result.text).toBe('');
    });

    it('only includes type and text fields', () => {
        const data = JSON.stringify({ type: 'thought', text: 'thinking...' });
        const result = parseSSEEvent(data);

        expect(result).toEqual({ type: 'thought', text: 'thinking...' });
    });
});

// ===========================================================================
// 5. done event
// ===========================================================================
describe('parseSSEEvent — done', () => {
    it('parses a done event with only required text field', () => {
        const data = JSON.stringify({
            type: 'done',
            text: 'Final AI response text.',
        });
        const result = parseSSEEvent(data) as SSEDoneEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('done');
        expect(result.text).toBe('Final AI response text.');
    });

    it('returns undefined (not null) for absent optional fields', () => {
        const data = JSON.stringify({
            type: 'done',
            text: 'Response without optional fields.',
        });
        const result = parseSSEEvent(data) as SSEDoneEvent;

        expect(result.tokenUsage).toBeUndefined();
        expect(result.toolCalls).toBeUndefined();
        expect(result.summary).toBeUndefined();
        expect(result.usedSummary).toBeUndefined();
    });

    it('parses a done event with all optional fields present', () => {
        const tokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
        const toolCalls = [
            { name: 'getStats', args: { id: '1' }, result: { views: 500 } },
            { name: 'search', args: { q: 'test' } },
        ];
        const data = JSON.stringify({
            type: 'done',
            text: 'Full response.',
            tokenUsage,
            toolCalls,
            summary: 'Conversation summary text',
            usedSummary: true,
        });
        const result = parseSSEEvent(data) as SSEDoneEvent;

        expect(result.type).toBe('done');
        expect(result.text).toBe('Full response.');
        expect(result.tokenUsage).toEqual(tokenUsage);
        expect(result.toolCalls).toEqual(toolCalls);
        expect(result.summary).toBe('Conversation summary text');
        expect(result.usedSummary).toBe(true);
    });

    it('preserves usedSummary as false when explicitly set', () => {
        const data = JSON.stringify({
            type: 'done',
            text: 'No summary used.',
            usedSummary: false,
        });
        const result = parseSSEEvent(data) as SSEDoneEvent;

        expect(result.usedSummary).toBe(false);
    });

    it('handles tokenUsage present but other optional fields absent', () => {
        const tokenUsage = { promptTokens: 200, completionTokens: 80, totalTokens: 280 };
        const data = JSON.stringify({
            type: 'done',
            text: 'Partial optionals.',
            tokenUsage,
        });
        const result = parseSSEEvent(data) as SSEDoneEvent;

        expect(result.tokenUsage).toEqual(tokenUsage);
        expect(result.toolCalls).toBeUndefined();
        expect(result.summary).toBeUndefined();
        expect(result.usedSummary).toBeUndefined();
    });

    it('passes normalizedUsage through without dropping it', () => {
        const normalizedUsage = {
            contextWindow: {
                inputTokens: 10_000,
                outputTokens: 2_000,
                thinkingTokens: 0,
                limit: 200_000,
                percent: 5.0,
            },
            billing: {
                input: { total: 10_000, fresh: 7_000, cached: 3_000, cacheWrite: 0 },
                output: { total: 2_000, thinking: 0 },
                iterations: 1,
                cost: { input: 0.02, cached: 0.003, cacheWrite: 0, output: 0.03, total: 0.053, withoutCache: 0.05, thinkingSubset: 0 },
            },
            provider: 'anthropic' as const,
            model: 'claude-sonnet-4-20250514',
        };
        const data = JSON.stringify({
            type: 'done',
            text: 'Response',
            normalizedUsage,
        });
        const result = parseSSEEvent(data) as SSEDoneEvent;

        expect(result.normalizedUsage).toBeDefined();
        expect(result.normalizedUsage!.contextWindow.inputTokens).toBe(10_000);
        expect(result.normalizedUsage!.billing.iterations).toBe(1);
        expect(result.normalizedUsage!.provider).toBe('anthropic');
    });

    it('returns undefined normalizedUsage when not present in payload', () => {
        const data = JSON.stringify({ type: 'done', text: 'No usage.' });
        const result = parseSSEEvent(data) as SSEDoneEvent;

        expect(result.normalizedUsage).toBeUndefined();
    });
});

// ===========================================================================
// 6. toolProgress event
// ===========================================================================
describe('parseSSEEvent — toolProgress', () => {
    it('parses a tool progress event with all fields', () => {
        const data = JSON.stringify({
            type: 'toolProgress',
            toolName: 'analyzeVideo',
            message: 'Processing frame 42 of 100...',
            toolCallIndex: 3,
        });
        const result = parseSSEEvent(data) as SSEToolProgressEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('toolProgress');
        expect(result.toolName).toBe('analyzeVideo');
        expect(result.message).toBe('Processing frame 42 of 100...');
        expect(result.toolCallIndex).toBe(3);
    });

    it('defaults toolCallIndex to 0 when missing', () => {
        const data = JSON.stringify({
            type: 'toolProgress',
            toolName: 'render',
            message: 'Starting...',
        });
        const result = parseSSEEvent(data) as SSEToolProgressEvent;

        expect(result.toolCallIndex).toBe(0);
    });

    it('converts toolName to string using String() when missing', () => {
        const data = JSON.stringify({
            type: 'toolProgress',
            message: 'Progress update',
            toolCallIndex: 0,
        });
        const result = parseSSEEvent(data) as SSEToolProgressEvent;

        // String(undefined ?? '') → ''
        expect(result.toolName).toBe('');
    });

    it('converts message to string using String() when missing', () => {
        const data = JSON.stringify({
            type: 'toolProgress',
            toolName: 'someTool',
            toolCallIndex: 0,
        });
        const result = parseSSEEvent(data) as SSEToolProgressEvent;

        // String(undefined ?? '') → ''
        expect(result.message).toBe('');
    });

    it('converts non-string toolName via String()', () => {
        const data = JSON.stringify({
            type: 'toolProgress',
            toolName: 42,
            message: 'msg',
            toolCallIndex: 0,
        });
        const result = parseSSEEvent(data) as SSEToolProgressEvent;

        // String(42) → '42'
        expect(result.toolName).toBe('42');
    });
});

// ===========================================================================
// 7. error event
// ===========================================================================
describe('parseSSEEvent — error', () => {
    it('parses an error event with error message', () => {
        const data = JSON.stringify({
            type: 'error',
            error: 'Rate limit exceeded. Please try again later.',
        });
        const result = parseSSEEvent(data) as SSEErrorEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('error');
        expect(result.error).toBe('Rate limit exceeded. Please try again later.');
    });

    it('only includes type and error fields', () => {
        const data = JSON.stringify({ type: 'error', error: 'Oops' });
        const result = parseSSEEvent(data);

        expect(result).toEqual({ type: 'error', error: 'Oops' });
    });
});

// ===========================================================================
// 8. confirmLargePayload event
// ===========================================================================
describe('parseSSEEvent — confirmLargePayload', () => {
    it('parses a confirmLargePayload event with count', () => {
        const data = JSON.stringify({
            type: 'confirmLargePayload',
            count: 15,
        });
        const result = parseSSEEvent(data) as SSEConfirmLargePayloadEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('confirmLargePayload');
        expect(result.count).toBe(15);
    });

    it('preserves count of zero', () => {
        const data = JSON.stringify({ type: 'confirmLargePayload', count: 0 });
        const result = parseSSEEvent(data) as SSEConfirmLargePayloadEvent;

        expect(result.count).toBe(0);
    });
});

// ===========================================================================
// 9. retry event
// ===========================================================================
describe('parseSSEEvent — retry', () => {
    it('parses a retry event with 1-based attempt number', () => {
        const data = JSON.stringify({
            type: 'retry',
            attempt: 3,
        });
        const result = parseSSEEvent(data) as SSERetryEvent;

        expect(result).not.toBeNull();
        expect(result.type).toBe('retry');
        expect(result.attempt).toBe(3);
    });

    it('parses first retry attempt', () => {
        const data = JSON.stringify({ type: 'retry', attempt: 1 });
        const result = parseSSEEvent(data) as SSERetryEvent;

        expect(result.attempt).toBe(1);
    });
});

// ===========================================================================
// Edge cases and error handling
// ===========================================================================
describe('parseSSEEvent — error handling', () => {
    it('returns null for malformed JSON', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = parseSSEEvent('this is not json');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            '[parseSSEEvent] Failed to parse SSE data:',
            'this is not json',
        );
    });

    it('returns null for incomplete JSON', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = parseSSEEvent('{"type":"chunk"');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('returns null for empty string', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = parseSSEEvent('');

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('returns null for unknown event type and logs a warning', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const data = JSON.stringify({ type: 'unknownEvent', data: 'something' });
        const result = parseSSEEvent(data);

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            '[parseSSEEvent] Unknown event type: unknownEvent',
        );
    });

    it('returns null when type field is missing (undefined)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const data = JSON.stringify({ text: 'no type here' });
        const result = parseSSEEvent(data);

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            '[parseSSEEvent] Unknown event type: undefined',
        );
    });

    it('truncates long data in the warning message to 100 chars', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const longString = 'x'.repeat(200);
        parseSSEEvent(longString);

        expect(warnSpy).toHaveBeenCalledWith(
            '[parseSSEEvent] Failed to parse SSE data:',
            'x'.repeat(100),
        );
    });
});

// ===========================================================================
// Type discrimination contract
// ===========================================================================
describe('parseSSEEvent — type discrimination', () => {
    it('returns correct discriminant for each event type', () => {
        const eventTypes = [
            { input: { type: 'chunk', text: '' }, expectedType: 'chunk' },
            { input: { type: 'toolCall', name: 't', args: {} }, expectedType: 'toolCall' },
            { input: { type: 'toolResult', name: 't', result: {} }, expectedType: 'toolResult' },
            { input: { type: 'thought', text: '' }, expectedType: 'thought' },
            { input: { type: 'done', text: '' }, expectedType: 'done' },
            { input: { type: 'toolProgress', toolName: 't', message: 'm' }, expectedType: 'toolProgress' },
            { input: { type: 'error', error: 'e' }, expectedType: 'error' },
            { input: { type: 'confirmLargePayload', count: 1 }, expectedType: 'confirmLargePayload' },
            { input: { type: 'retry', attempt: 1 }, expectedType: 'retry' },
        ] as const;

        for (const { input, expectedType } of eventTypes) {
            const result = parseSSEEvent(JSON.stringify(input));
            expect(result).not.toBeNull();
            expect(result!.type).toBe(expectedType);
        }
    });
});

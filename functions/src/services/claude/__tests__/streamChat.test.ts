// =============================================================================
// Claude streamChat — contract tests
//
// Lock down the behavior of the Claude streamChat() function.
// Tests verify behavior through the public interface only:
//   - Suite A: Happy path — single-turn text streaming
//   - Suite B: Agentic loop — tool calling, chaining, MAX_AGENTIC_ITERATIONS
//   - Suite C: Thinking — thought extraction and leak protection
//   - Suite D: Retry — transient error recovery
//   - Suite E: Error handling — non-transient errors propagate
//
// All external dependencies are mocked — no live Anthropic API key needed.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TokenUsage } from "../../ai/types.js";

// ---------------------------------------------------------------------------
// Mock stream builder
// ---------------------------------------------------------------------------

type EventHandler = (data: unknown) => void;

interface MockStream {
    on: (event: string, handler: EventHandler) => MockStream;
    /** Internal: fire all registered events in order, then emit 'end'. */
    _run: () => void;
}

interface StreamEvent {
    event: "text" | "thinking" | "contentBlock" | "finalMessage" | "message" | "error" | "end";
    data: unknown;
}

/**
 * Build a mock MessageStream that mirrors the Claude SDK's event-based API.
 *
 * Usage in streamChat:
 *   stream.on('text', cb)         — text delta strings
 *   stream.on('thinking', cb)     — thinking delta strings
 *   stream.on('contentBlock', cb) — complete content blocks (tool_use, thinking, text)
 *   stream.on('finalMessage', cb) — final message with usage
 *   stream.on('error', cb)        — error event
 *   stream.on('end', cb)          — stream completed
 */
function buildMockStream(events: StreamEvent[]): MockStream {
    const handlers: Record<string, EventHandler[]> = {};

    const stream: MockStream = {
        on(event: string, handler: EventHandler) {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(handler);
            return stream;
        },
        _run() {
            // Use queueMicrotask to defer event emission until after
            // all .on() calls are registered by streamIteration.
            queueMicrotask(() => {
                for (const { event, data } of events) {
                    const eventHandlers = handlers[event];
                    if (eventHandlers) {
                        for (const h of eventHandlers) h(data);
                    }
                }
                // Always emit 'end' to resolve the stream promise
                const endHandlers = handlers["end"];
                if (endHandlers) {
                    for (const h of endHandlers) h(undefined);
                }
            });
        },
    };

    return stream;
}

// ---------------------------------------------------------------------------
// Event builder helpers
// ---------------------------------------------------------------------------

/** Create text delta events + text contentBlock for a text response. */
function textEvents(text: string): StreamEvent[] {
    return [
        { event: "text", data: text },
        { event: "contentBlock", data: { type: "text", text } },
    ];
}

/** Create thinking delta event + thinking contentBlock. */
function thinkingEvents(text: string): StreamEvent[] {
    return [
        { event: "thinking", data: text },
        {
            event: "contentBlock",
            data: { type: "thinking", thinking: text, signature: "sig-mock" },
        },
    ];
}

/** Create a tool_use contentBlock event. */
function toolUseEvent(
    id: string,
    name: string,
    input: Record<string, unknown>,
): StreamEvent {
    return {
        event: "contentBlock",
        data: { type: "tool_use", id, name, input },
    };
}

/** Create a "message" event (fires before content — carries input_tokens). */
function messageEvent(usage: { input_tokens: number }): StreamEvent {
    return { event: "message", data: { usage } };
}

/** Create a finalMessage event with usage data. */
function finalMessageEvent(usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
}): StreamEvent {
    return {
        event: "finalMessage",
        data: { usage },
    };
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock the Claude client singleton
vi.mock("../client.js", () => ({
    getClaudeClient: vi.fn(),
}));

// Mock memory (used in buildHistory for context labels)
vi.mock("../../memory.js", () => ({
    formatContextLabel: vi.fn().mockReturnValue("[context]"),
}));

// Mock the shared tool batch executor
vi.mock("../../ai/toolExecution.js", () => ({
    executeToolBatch: vi.fn(),
}));

// Mock model registry — provide a Claude-style model config with thinking options + pricing
vi.mock("../../../config/models.js", () => ({
    MODEL_REGISTRY: [
        {
            id: "test-claude-model",
            provider: "anthropic",
            contextLimit: 1_000_000,
            maxOutputTokens: 64_000,
            thinkingMode: "budget",
            thinkingOptions: [
                { id: "off", value: 0 },
                { id: "auto", value: -1 },
                { id: "default", value: 1024 },
                { id: "high", value: 8192 },
            ],
            thinkingDefault: "default",
            pricing: {
                inputPerMillion: 5.00,
                outputPerMillion: 25.00,
                cacheReadMultiplier: 0.1,
                cacheWriteMultiplier: 2.0,
            },
        },
    ],
}));

// Mock the Anthropic SDK — we need APIError for error handling tests
vi.mock("@anthropic-ai/sdk", () => {
    return {
        default: vi.fn(),
    };
});

vi.mock("@anthropic-ai/sdk/error.js", () => {
    class APIError extends Error {
        status: number | undefined;
        error: unknown;
        constructor(status: number | undefined, errorOrMessage: unknown, message?: string) {
            const msg = typeof errorOrMessage === "string"
                ? errorOrMessage
                : message ?? (errorOrMessage ? JSON.stringify(errorOrMessage) : "(no body)");
            super(status ? `${status} ${msg}` : msg);
            this.name = "APIError";
            this.status = status;
            this.error = errorOrMessage;
        }
    }
    return { APIError };
});

// ---------------------------------------------------------------------------
// Import mocked modules
// ---------------------------------------------------------------------------

import { getClaudeClient } from "../client.js";
import { executeToolBatch } from "../../ai/toolExecution.js";
import { AiStreamTimeoutError } from "../../ai/retry.js";
import { APIError } from "@anthropic-ai/sdk/error.js";

const mockGetClaudeClient = vi.mocked(getClaudeClient);
const mockExecuteToolBatch = vi.mocked(executeToolBatch);

// Import the module under test AFTER mocks are registered
import { streamChat } from "../streamChat.js";
import type { ClaudeStreamChatOpts } from "../streamChat.js";

// ---------------------------------------------------------------------------
// Shared opts factory
// ---------------------------------------------------------------------------

function makeOpts(
    overrides: Partial<ClaudeStreamChatOpts> = {},
): ClaudeStreamChatOpts {
    return {
        apiKey: "test-key",
        model: "test-claude-model",
        history: [],
        text: "hello",
        tools: [],
        callbacks: {
            onChunk: vi.fn(),
            ...overrides.callbacks,
        },
        ...overrides,
        // Ensure callbacks spread doesn't overwrite the parent spread
    };
}

/** Helper to build opts with specific callbacks without double-nesting. */
function makeOptsWithCallbacks(
    callbacks: Partial<ClaudeStreamChatOpts["callbacks"]>,
    overrides: Partial<Omit<ClaudeStreamChatOpts, "callbacks">> = {},
): ClaudeStreamChatOpts {
    return {
        apiKey: "test-key",
        model: "test-claude-model",
        history: [],
        text: "hello",
        tools: [],
        callbacks: {
            onChunk: vi.fn(),
            ...callbacks,
        },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Configure the mock Claude client to return mock streams for each call.
 * Each entry in `streamSequence` defines the events for one messages.stream() call.
 */
function mockClientStreams(
    ...streamSequence: Array<{ events: StreamEvent[]; throwError?: Error }>
) {
    const mockStream = vi.fn();

    for (const entry of streamSequence) {
        mockStream.mockImplementationOnce(() => {
            if (entry.throwError) {
                // Build a stream that emits the error event
                const errStream = buildMockStream([
                    { event: "error", data: entry.throwError },
                ]);
                errStream._run();
                return errStream;
            }
            const stream = buildMockStream(entry.events);
            stream._run();
            return stream;
        });
    }

    mockGetClaudeClient.mockResolvedValue({
        messages: { stream: mockStream },
    } as never);

    return mockStream;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
});

// ===========================================================================
// Suite A: Happy path — single-turn text streaming
// ===========================================================================

describe("Claude streamChat — happy path (single-turn text)", () => {
    it("returns accumulated text from a stream of text deltas", async () => {
        mockClientStreams({
            events: [
                { event: "text", data: "Hello" },
                { event: "text", data: " world" },
                { event: "contentBlock", data: { type: "text", text: "Hello world" } },
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.text).toBe("Hello world");
    });

    it("calls onChunk with accumulated text after each text delta", async () => {
        const onChunk = vi.fn();

        mockClientStreams({
            events: [
                { event: "text", data: "Hello" },
                { event: "text", data: " world" },
                { event: "contentBlock", data: { type: "text", text: "Hello world" } },
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ],
        });

        await streamChat(makeOptsWithCallbacks({ onChunk }));

        // onChunk is called with accumulated text on each delta
        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onChunk).toHaveBeenNthCalledWith(1, "Hello");
        expect(onChunk).toHaveBeenNthCalledWith(2, "Hello world");
    });

    it("extracts token usage from finalMessage (input_tokens -> promptTokens)", async () => {
        mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({
                    input_tokens: 100,
                    output_tokens: 50,
                }),
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.tokenUsage).toEqual<TokenUsage>({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            cachedTokens: undefined,
        });
    });

    it("extracts cache_read_input_tokens into cachedTokens", async () => {
        mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({
                    input_tokens: 200,
                    output_tokens: 80,
                    cache_read_input_tokens: 120,
                }),
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.tokenUsage?.cachedTokens).toBe(120);
    });

    it("sets cachedTokens to undefined when cache_read_input_tokens is 0", async () => {
        mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({
                    input_tokens: 100,
                    output_tokens: 50,
                    cache_read_input_tokens: 0,
                }),
            ],
        });

        const result = await streamChat(makeOpts());

        // 0 cache reads → cachedTokens should be undefined
        expect(result.tokenUsage?.cachedTokens).toBeUndefined();
    });

    it("returns empty text and valid result when model sends no text deltas", async () => {
        mockClientStreams({
            events: [
                finalMessageEvent({ input_tokens: 5, output_tokens: 0 }),
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.text).toBe("");
        expect(result.tokenUsage).toBeDefined();
    });

    it("uses maxOutputTokens from MODEL_REGISTRY as max_tokens", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ],
        });

        await streamChat(makeOpts());

        // messages.stream() is called with params containing max_tokens from model config
        const apiParams = mockStream.mock.calls[0][0];
        expect(apiParams.max_tokens).toBe(64_000);
    });

    it("returns undefined toolCalls when no tools were called", async () => {
        mockClientStreams({
            events: [
                ...textEvents("No tools"),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.toolCalls).toBeUndefined();
    });
});

// ===========================================================================
// Suite B: Agentic loop — tool calling
// ===========================================================================

describe("Claude streamChat — agentic loop (tool calling)", () => {
    const toolContext = { userId: "u1", channelId: "c1" };
    const tools = [
        {
            name: "mentionVideo",
            description: "Mention a video",
            parametersJsonSchema: { type: "object", properties: { videoId: { type: "string" } } },
        },
    ];

    it("executes tool when model returns tool_use and calls model again for final text", async () => {
        const onToolCall = vi.fn();
        const onToolResult = vi.fn();

        // Iteration 1: model returns tool_use
        // Iteration 2: model returns final text
        mockClientStreams(
            {
                events: [
                    toolUseEvent("call-1", "mentionVideo", { videoId: "v1" }),
                    finalMessageEvent({ input_tokens: 20, output_tokens: 10 }),
                ],
            },
            {
                events: [
                    ...textEvents("Done"),
                    finalMessageEvent({ input_tokens: 30, output_tokens: 15 }),
                ],
            },
        );

        // Mock executeToolBatch to return the tool result
        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [
                {
                    name: "mentionVideo",
                    args: { videoId: "v1" },
                    result: { success: true },
                },
            ],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({ onToolCall, onToolResult }, { toolContext, tools }),
        );

        // executeToolBatch was called with the tool call
        expect(mockExecuteToolBatch).toHaveBeenCalledTimes(1);
        const batchCall = mockExecuteToolBatch.mock.calls[0][0];
        expect(batchCall.calls).toEqual([
            { name: "mentionVideo", args: { videoId: "v1" } },
        ]);

        // Final text is from the second model call
        expect(result.text).toBe("Done");

        // toolCalls recorded
        expect(result.toolCalls).toEqual([
            {
                name: "mentionVideo",
                args: { videoId: "v1" },
                result: { success: true },
            },
        ]);
    });

    it("handles chained tool calls: tool A -> result -> tool B -> result -> final text", async () => {
        // Iteration 1: model calls tool A
        // Iteration 2: model calls tool B
        // Iteration 3: model returns final text
        mockClientStreams(
            {
                events: [
                    toolUseEvent("call-1", "analyzeSuggestedTraffic", { videoId: "v1" }),
                    finalMessageEvent({ input_tokens: 20, output_tokens: 10 }),
                ],
            },
            {
                events: [
                    toolUseEvent("call-2", "viewThumbnails", { videoIds: ["v2", "v3"] }),
                    finalMessageEvent({ input_tokens: 40, output_tokens: 20 }),
                ],
            },
            {
                events: [
                    ...textEvents("Analysis complete"),
                    finalMessageEvent({ input_tokens: 60, output_tokens: 30 }),
                ],
            },
        );

        // Tool A result
        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [
                {
                    name: "analyzeSuggestedTraffic",
                    args: { videoId: "v1" },
                    result: { topSources: [{ videoId: "v2" }, { videoId: "v3" }] },
                },
            ],
        });

        // Tool B result
        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [
                {
                    name: "viewThumbnails",
                    args: { videoIds: ["v2", "v3"] },
                    result: { thumbnails: ["url1", "url2"] },
                },
            ],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({}, { toolContext, tools }),
        );

        expect(mockExecuteToolBatch).toHaveBeenCalledTimes(2);
        expect(result.text).toBe("Analysis complete");
        expect(result.toolCalls).toHaveLength(2);
        expect(result.toolCalls![0].name).toBe("analyzeSuggestedTraffic");
        expect(result.toolCalls![1].name).toBe("viewThumbnails");
    });

    it("stops after MAX_AGENTIC_ITERATIONS when model always returns tool_use", async () => {
        // Build 10 streams that all return tool_use (MAX_AGENTIC_ITERATIONS = 10)
        const streams = Array.from({ length: 10 }, (_, i) => ({
            events: [
                toolUseEvent(`call-${i}`, "mentionVideo", { videoId: `v${i}` }),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ],
        }));
        const mockStream = mockClientStreams(...streams);

        // Each iteration executes a tool
        mockExecuteToolBatch.mockResolvedValue({
            results: [
                {
                    name: "mentionVideo",
                    args: { videoId: "v0" },
                    result: { success: true },
                },
            ],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({}, { toolContext, tools }),
        );

        // Model was called 10 times (MAX_AGENTIC_ITERATIONS)
        expect(mockStream).toHaveBeenCalledTimes(10);
        // Should return whatever text accumulated (empty since all iterations returned tool_use)
        expect(result.text).toBe("");
        // 10 tool calls recorded
        expect(result.toolCalls).toHaveLength(10);
    });

    it("skips tool execution when no toolContext is provided", async () => {
        mockClientStreams({
            events: [
                toolUseEvent("call-1", "mentionVideo", { videoId: "v1" }),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({}, { tools, toolContext: undefined }),
        );

        // executeToolBatch should not be called
        expect(mockExecuteToolBatch).not.toHaveBeenCalled();
        // Should break out of the loop
        expect(result.text).toBe("");
    });

    it("handles multiple tool_use blocks in a single iteration", async () => {
        // Iteration 1: model returns two tool_use blocks
        // Iteration 2: model returns final text
        mockClientStreams(
            {
                events: [
                    toolUseEvent("call-1", "mentionVideo", { videoId: "v1" }),
                    toolUseEvent("call-2", "mentionVideo", { videoId: "v2" }),
                    finalMessageEvent({ input_tokens: 20, output_tokens: 10 }),
                ],
            },
            {
                events: [
                    ...textEvents("Both referenced"),
                    finalMessageEvent({ input_tokens: 40, output_tokens: 20 }),
                ],
            },
        );

        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [
                {
                    name: "mentionVideo",
                    args: { videoId: "v1" },
                    result: { success: true },
                },
                {
                    name: "mentionVideo",
                    args: { videoId: "v2" },
                    result: { success: true },
                },
            ],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({}, { toolContext, tools }),
        );

        // executeToolBatch received both calls in a single batch
        expect(mockExecuteToolBatch).toHaveBeenCalledTimes(1);
        const batchCall = mockExecuteToolBatch.mock.calls[0][0];
        expect(batchCall.calls).toHaveLength(2);

        expect(result.text).toBe("Both referenced");
        expect(result.toolCalls).toHaveLength(2);
    });

    it("sums tokenUsage across agentic iterations (baseline for token transparency)", async () => {
        // Iteration 1: tool call with usage
        // Iteration 2: final text with usage
        mockClientStreams(
            {
                events: [
                    toolUseEvent("call-1", "mentionVideo", { videoId: "v1" }),
                    finalMessageEvent({
                        input_tokens: 20,
                        output_tokens: 10,
                        cache_read_input_tokens: 5,
                    }),
                ],
            },
            {
                events: [
                    ...textEvents("Done"),
                    finalMessageEvent({
                        input_tokens: 30,
                        output_tokens: 15,
                        cache_read_input_tokens: 8,
                    }),
                ],
            },
        );

        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [
                {
                    name: "mentionVideo",
                    args: { videoId: "v1" },
                    result: { success: true },
                },
            ],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({}, { toolContext, tools }),
        );

        // Current behavior: tokens are SUMMED across iterations
        expect(result.tokenUsage).toEqual<TokenUsage>({
            promptTokens: 50,      // 20 + 30
            completionTokens: 25,  // 10 + 15
            totalTokens: 75,       // 50 + 25
            cachedTokens: 13,      // 5 + 8
            cacheWriteTokens: undefined,
        });
    });

    it("preserves accumulated text on abort even without message event (earlyInputTokens null)", async () => {
        mockClientStreams({
            events: [
                { event: "text", data: "partial response" },
                { event: "contentBlock", data: { type: "text", text: "partial response" } },
                { event: "error", data: new DOMException("The operation was aborted", "AbortError") },
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.partial).toBe(true);
        expect(result.text).toBe("partial response");
        expect(result.tokenUsage).toBeUndefined();
    });
});

// ===========================================================================
// Suite C: Thinking — thought extraction and leak protection
// ===========================================================================

describe("Claude streamChat — thinking (thought leak protection)", () => {
    it("calls onThought when a thinking block is streamed", async () => {
        const onThought = vi.fn();

        mockClientStreams({
            events: [
                ...thinkingEvents("Let me think about this..."),
                ...textEvents("Here is my answer"),
                finalMessageEvent({ input_tokens: 50, output_tokens: 20 }),
            ],
        });

        await streamChat(makeOptsWithCallbacks({ onThought }));

        expect(onThought).toHaveBeenCalledTimes(1);
        expect(onThought).toHaveBeenCalledWith("Let me think about this...");
    });

    it("does NOT include thinking text in the final response text", async () => {
        const onThought = vi.fn();

        mockClientStreams({
            events: [
                ...thinkingEvents("Internal reasoning here"),
                ...textEvents("Visible response"),
                finalMessageEvent({ input_tokens: 50, output_tokens: 20 }),
            ],
        });

        const result = await streamChat(makeOptsWithCallbacks({ onThought }));

        // Thinking text must not leak into the response
        expect(result.text).toBe("Visible response");
        expect(result.text).not.toContain("Internal reasoning");
    });

    it("correctly separates thinking and text when mixed in a stream", async () => {
        const onThought = vi.fn();

        mockClientStreams({
            events: [
                // Thinking first
                { event: "thinking", data: "Step 1: analyze" },
                {
                    event: "contentBlock",
                    data: { type: "thinking", thinking: "Step 1: analyze", signature: "sig1" },
                },
                // Then more thinking
                { event: "thinking", data: "Step 2: formulate" },
                {
                    event: "contentBlock",
                    data: { type: "thinking", thinking: "Step 2: formulate", signature: "sig2" },
                },
                // Then text response
                ...textEvents("Here is the answer"),
                finalMessageEvent({ input_tokens: 80, output_tokens: 30 }),
            ],
        });

        const result = await streamChat(makeOptsWithCallbacks({ onThought }));

        // Two thinking deltas emitted
        expect(onThought).toHaveBeenCalledTimes(2);
        expect(onThought).toHaveBeenNthCalledWith(1, "Step 1: analyze");
        expect(onThought).toHaveBeenNthCalledWith(2, "Step 2: formulate");

        // Only text in the response
        expect(result.text).toBe("Here is the answer");
    });

    it("does not crash when onThought is not provided", async () => {
        mockClientStreams({
            events: [
                ...thinkingEvents("Some thought"),
                ...textEvents("Response"),
                finalMessageEvent({ input_tokens: 50, output_tokens: 20 }),
            ],
        });

        // No onThought callback — should not throw
        const result = await streamChat(
            makeOptsWithCallbacks({ onThought: undefined }),
        );

        expect(result.text).toBe("Response");
    });

    it("handles thinking + tool_use in the same iteration", async () => {
        const onThought = vi.fn();
        const toolContext = { userId: "u1", channelId: "c1" };
        const tools = [
            {
                name: "mentionVideo",
                description: "Mention a video",
                parametersJsonSchema: { type: "object" },
            },
        ];

        mockClientStreams(
            // Iteration 1: thinking + tool_use
            {
                events: [
                    ...thinkingEvents("I need to look up this video"),
                    toolUseEvent("call-1", "mentionVideo", { videoId: "v1" }),
                    finalMessageEvent({ input_tokens: 30, output_tokens: 15 }),
                ],
            },
            // Iteration 2: thinking + text response
            {
                events: [
                    ...thinkingEvents("Now I can respond"),
                    ...textEvents("Here is the video"),
                    finalMessageEvent({ input_tokens: 50, output_tokens: 25 }),
                ],
            },
        );

        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [
                {
                    name: "mentionVideo",
                    args: { videoId: "v1" },
                    result: { success: true },
                },
            ],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({ onThought }, { toolContext, tools }),
        );

        // Thoughts from both iterations
        expect(onThought).toHaveBeenCalledTimes(2);
        expect(onThought).toHaveBeenNthCalledWith(1, "I need to look up this video");
        expect(onThought).toHaveBeenNthCalledWith(2, "Now I can respond");

        // Final text has no thought leaks
        expect(result.text).toBe("Here is the video");
    });
});

// ===========================================================================
// Suite D: Retry — transient error recovery
// ===========================================================================

describe("Claude streamChat — retry logic", () => {
    it("retries on transient 529 overloaded error and returns result on success", async () => {
        const onRetry = vi.fn();
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // First call: stream emits error
        const error529 = new APIError(529, "Overloaded");
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: error529 },
            ]);
            stream._run();
            return stream;
        });

        // Second call: stream succeeds
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                ...textEvents("Recovered"),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ]);
            stream._run();
            return stream;
        });

        const result = await streamChat(
            makeOptsWithCallbacks({ onRetry }),
        );

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(1);
        expect(result.text).toBe("Recovered");
    });

    it("retries on AiStreamTimeoutError with hadThinkingProgress=false (default)", async () => {
        const onRetry = vi.fn();
        const mockMessagesStream = vi.fn();

        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // First call: stream emits AiStreamTimeoutError (no thinking progress — retryable)
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: new AiStreamTimeoutError("Timed out") },
            ]);
            stream._run();
            return stream;
        });

        // Second call: stream succeeds
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                ...textEvents("After timeout"),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ]);
            stream._run();
            return stream;
        });

        const result = await streamChat(
            makeOptsWithCallbacks({ onRetry }),
        );

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(result.text).toBe("After timeout");
    });

    it("does NOT retry AiStreamTimeoutError when hadThinkingProgress=true — returns partial", async () => {
        const onRetry = vi.fn();
        const mockMessagesStream = vi.fn();

        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // Stream emits thinking timeout — hadThinkingProgress=true → NOT transient → NOT retried
        // streamChat catches it and returns partial result
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: new AiStreamTimeoutError("Thinking timeout", { hadThinkingProgress: true }) },
            ]);
            stream._run();
            return stream;
        });

        const result = await streamChat(makeOptsWithCallbacks({ onRetry }));

        // Should NOT retry
        expect(onRetry).not.toHaveBeenCalled();
        expect(mockMessagesStream).toHaveBeenCalledTimes(1);
        // Returns partial result instead of throwing
        expect(result.partial).toBe(true);
    });
});

describe("Claude streamChat — SSE error retry (status undefined)", () => {
    it("retries on SSE overloaded_error (status undefined) and succeeds", async () => {
        const onRetry = vi.fn();
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // SSE error event: SDK creates APIError(undefined, parsedJSON, ...)
        const sseOverloaded = new APIError(
            undefined as never,
            { type: "error", error: { details: null, type: "overloaded_error", message: "Overloaded" } },
        );
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: sseOverloaded },
            ]);
            stream._run();
            return stream;
        });

        // Second call: stream succeeds
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                ...textEvents("Recovered from SSE overload"),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ]);
            stream._run();
            return stream;
        });

        const result = await streamChat(
            makeOptsWithCallbacks({ onRetry }),
        );

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(result.text).toBe("Recovered from SSE overload");
    });

    it("retries on SSE api_error (status undefined) and succeeds", async () => {
        const onRetry = vi.fn();
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        const sseApiError = new APIError(
            undefined as never,
            { type: "error", error: { details: null, type: "api_error", message: "Internal server error" } },
        );
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: sseApiError },
            ]);
            stream._run();
            return stream;
        });

        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                ...textEvents("Recovered"),
                finalMessageEvent({ input_tokens: 10, output_tokens: 5 }),
            ]);
            stream._run();
            return stream;
        });

        const result = await streamChat(
            makeOptsWithCallbacks({ onRetry }),
        );

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(result.text).toBe("Recovered");
    });

    it("does NOT retry SSE authentication_error (non-transient)", async () => {
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        const sseAuthError = new APIError(
            undefined as never,
            { type: "error", error: { type: "authentication_error", message: "Invalid key" } },
        );
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: sseAuthError },
            ]);
            stream._run();
            return stream;
        });

        await expect(
            streamChat(makeOpts()),
        ).rejects.toThrow();

        expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    });
});

// ===========================================================================
// Suite E: Error handling — non-transient errors propagate
// ===========================================================================

describe("Claude streamChat — error handling", () => {
    it("throws immediately on non-transient API error (e.g. 400 bad request)", async () => {
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        const error400 = new APIError(400, "Bad request: invalid model");
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: error400 },
            ]);
            stream._run();
            return stream;
        });

        await expect(
            streamChat(makeOpts()),
        ).rejects.toThrow("Bad request: invalid model");

        // Should not retry
        expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    });

    it("throws immediately on 401 authentication error without retry", async () => {
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        const error401 = new APIError(401, "Invalid API key");
        mockMessagesStream.mockImplementationOnce(() => {
            const stream = buildMockStream([
                { event: "error", data: error401 },
            ]);
            stream._run();
            return stream;
        });

        await expect(
            streamChat(makeOpts()),
        ).rejects.toThrow("Invalid API key");

        // No retry
        expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    });
});

// ===========================================================================
// Suite F: Prompt caching — cache_control breakpoint placement
// ===========================================================================

describe("Claude streamChat — prompt caching (cache_control breakpoints)", () => {
    const EXPECTED_CACHE_CONTROL = { type: "ephemeral", ttl: "1h" };

    // --- BP1: System prompt ---

    it("converts system prompt to TextBlockParam[] with cache_control (BP1)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        await streamChat(makeOpts({ systemPrompt: "You are a helpful assistant." }));

        const params = mockStream.mock.calls[0][0];
        expect(params.system).toEqual([{
            type: "text",
            text: "You are a helpful assistant.",
            cache_control: EXPECTED_CACHE_CONTROL,
        }]);
    });

    it("skips BP1 when no system prompt is provided", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        await streamChat(makeOpts({ systemPrompt: undefined }));

        const params = mockStream.mock.calls[0][0];
        expect(params.system).toBeUndefined();
    });

    // --- BP2: Last tool definition ---

    it("adds cache_control to the last tool definition (BP2)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        const tools = [
            { name: "tool1", description: "First", parametersJsonSchema: { type: "object" } },
            { name: "tool2", description: "Second", parametersJsonSchema: { type: "object" } },
        ];

        await streamChat(makeOpts({
            tools,
            toolContext: { userId: "u1", channelId: "c1" },
        }));

        const params = mockStream.mock.calls[0][0];
        expect(params.tools[0].cache_control).toBeUndefined();
        expect(params.tools[1].cache_control).toEqual(EXPECTED_CACHE_CONTROL);
    });

    it("adds cache_control to a single tool (BP2 with 1 tool)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        const tools = [
            { name: "onlyTool", description: "Only", parametersJsonSchema: { type: "object" } },
        ];

        await streamChat(makeOpts({
            tools,
            toolContext: { userId: "u1", channelId: "c1" },
        }));

        const params = mockStream.mock.calls[0][0];
        expect(params.tools[0].cache_control).toEqual(EXPECTED_CACHE_CONTROL);
    });

    it("skips BP2 when no tools are provided", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        await streamChat(makeOpts({ tools: [] }));

        const params = mockStream.mock.calls[0][0];
        expect(params.tools).toBeUndefined();
    });

    // --- BP3: Incremental message history ---

    it("adds cache_control to last content block of second-to-last message (BP3)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Response"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "1", role: "user", text: "Hello" },
                { id: "2", role: "model", text: "Hi there" },
            ],
            text: "How are you?",
        }));

        const params = mockStream.mock.calls[0][0];
        // messages: [user_1, assistant_1, user_2]
        // BP3 on assistant_1 (second-to-last)
        const secondToLast = params.messages[1];
        expect(secondToLast.role).toBe("assistant");
        const lastBlock = secondToLast.content[secondToLast.content.length - 1];
        expect(lastBlock.cache_control).toEqual(EXPECTED_CACHE_CONTROL);
    });

    it("skips BP3 when there is no history (first message)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        await streamChat(makeOpts({ history: [], text: "Hello" }));

        const params = mockStream.mock.calls[0][0];
        // Only 1 message — no second-to-last
        expect(params.messages).toHaveLength(1);
        const userMsg = params.messages[0];
        const lastBlock = userMsg.content[userMsg.content.length - 1];
        expect(lastBlock.cache_control).toBeUndefined();
    });

    it("does not add BP3 to the current user message (only to history)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Response"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 50 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "1", role: "user", text: "Hello" },
                { id: "2", role: "model", text: "Hi" },
            ],
            text: "New question",
        }));

        const params = mockStream.mock.calls[0][0];
        // Last message (current user) should NOT have cache_control
        const lastMsg = params.messages[params.messages.length - 1];
        const lastBlock = lastMsg.content[lastMsg.content.length - 1];
        expect(lastBlock.cache_control).toBeUndefined();
    });

    it("shifts BP3 to assistant tool_use message in agentic loop", async () => {
        const toolContext = { userId: "u1", channelId: "c1" };
        const tools = [
            { name: "getTool", description: "Get", parametersJsonSchema: { type: "object" } },
        ];

        const mockStream = mockClientStreams(
            // Iteration 1: tool_use
            {
                events: [
                    toolUseEvent("call-1", "getTool", { id: "1" }),
                    finalMessageEvent({ input_tokens: 20, output_tokens: 10 }),
                ],
            },
            // Iteration 2: final text
            {
                events: [
                    ...textEvents("Done"),
                    finalMessageEvent({ input_tokens: 40, output_tokens: 15 }),
                ],
            },
        );

        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [{
                name: "getTool",
                args: { id: "1" },
                result: { success: true },
            }],
        });

        await streamChat(makeOptsWithCallbacks({}, { tools, toolContext }));

        // Second API call (iteration 2): messages = [user_msg, assistant_tool_use, tool_result_user]
        const params2 = mockStream.mock.calls[1][0];
        // BP3 on assistant_tool_use (second-to-last)
        const assistantMsg = params2.messages[params2.messages.length - 2];
        expect(assistantMsg.role).toBe("assistant");
        const lastBlock = assistantMsg.content[assistantMsg.content.length - 1];
        expect(lastBlock.cache_control).toEqual(EXPECTED_CACHE_CONTROL);
    });

    it("does not mutate original agenticMessages when applying BP3", async () => {
        const toolContext = { userId: "u1", channelId: "c1" };
        const tools = [
            { name: "getTool", description: "Get", parametersJsonSchema: { type: "object" } },
        ];

        const mockStream = mockClientStreams(
            // Iteration 1: tool_use
            {
                events: [
                    toolUseEvent("call-1", "getTool", { id: "1" }),
                    finalMessageEvent({ input_tokens: 20, output_tokens: 10 }),
                ],
            },
            // Iteration 2: another tool_use
            {
                events: [
                    toolUseEvent("call-2", "getTool", { id: "2" }),
                    finalMessageEvent({ input_tokens: 30, output_tokens: 10 }),
                ],
            },
            // Iteration 3: final text
            {
                events: [
                    ...textEvents("Done"),
                    finalMessageEvent({ input_tokens: 50, output_tokens: 20 }),
                ],
            },
        );

        mockExecuteToolBatch.mockResolvedValue({
            results: [{
                name: "getTool",
                args: { id: "1" },
                result: { ok: true },
            }],
        });

        await streamChat(makeOptsWithCallbacks({}, { tools, toolContext }));

        // Iteration 2: should have BP3 on iteration 1's assistant message
        const params2 = mockStream.mock.calls[1][0];
        const bp3msg2 = params2.messages[params2.messages.length - 2];
        expect(bp3msg2.content[bp3msg2.content.length - 1].cache_control).toEqual(EXPECTED_CACHE_CONTROL);

        // Iteration 3: BP3 should have moved to iteration 2's assistant message (not duplicated)
        const params3 = mockStream.mock.calls[2][0];
        const bp3msg3 = params3.messages[params3.messages.length - 2];
        expect(bp3msg3.content[bp3msg3.content.length - 1].cache_control).toEqual(EXPECTED_CACHE_CONTROL);

        // Earlier messages in iteration 3 should NOT have leftover cache_control from previous iterations
        // (iteration 1's assistant message at index 1 should be clean)
        const earlyAssistant = params3.messages[1];
        if (earlyAssistant.role === "assistant" && Array.isArray(earlyAssistant.content)) {
            const earlyLastBlock = earlyAssistant.content[earlyAssistant.content.length - 1];
            expect(earlyLastBlock.cache_control).toBeUndefined();
        }
    });

    // --- Cache token metrics ---

    it("extracts cache_creation_input_tokens into cacheWriteTokens", async () => {
        mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({
                    input_tokens: 200,
                    output_tokens: 80,
                    cache_read_input_tokens: 150,
                    cache_creation_input_tokens: 50,
                }),
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.tokenUsage?.cachedTokens).toBe(150);
        expect(result.tokenUsage?.cacheWriteTokens).toBe(50);
    });

    it("sets cacheWriteTokens to undefined when cache_creation_input_tokens is 0", async () => {
        mockClientStreams({
            events: [
                ...textEvents("Hi"),
                finalMessageEvent({
                    input_tokens: 200,
                    output_tokens: 80,
                    cache_read_input_tokens: 0,
                    cache_creation_input_tokens: 0,
                }),
            ],
        });

        const result = await streamChat(makeOpts());

        expect(result.tokenUsage?.cacheWriteTokens).toBeUndefined();
    });

    it("accumulates cacheWriteTokens across agentic iterations", async () => {
        const toolContext = { userId: "u1", channelId: "c1" };
        const tools = [
            { name: "getTool", description: "Get", parametersJsonSchema: { type: "object" } },
        ];

        mockClientStreams(
            {
                events: [
                    toolUseEvent("call-1", "getTool", { id: "1" }),
                    finalMessageEvent({
                        input_tokens: 100,
                        output_tokens: 10,
                        cache_read_input_tokens: 0,
                        cache_creation_input_tokens: 80,
                    }),
                ],
            },
            {
                events: [
                    ...textEvents("Done"),
                    finalMessageEvent({
                        input_tokens: 150,
                        output_tokens: 20,
                        cache_read_input_tokens: 80,
                        cache_creation_input_tokens: 30,
                    }),
                ],
            },
        );

        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [{ name: "getTool", args: { id: "1" }, result: { ok: true } }],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({}, { tools, toolContext }),
        );

        // Accumulated: 80 + 30 = 110 write, 0 + 80 = 80 read
        expect(result.tokenUsage?.cacheWriteTokens).toBe(110);
        expect(result.tokenUsage?.cachedTokens).toBe(80);
    });
});

// =============================================================================
// Suite G: Normalized Usage (Token Transparency — Wave 2)
// =============================================================================

describe("Claude streamChat — normalizedUsage", () => {
    it("returns normalizedUsage for single iteration", () => {
        const mockStream = buildMockStream([
            ...textEvents("Hello"),
            finalMessageEvent({
                input_tokens: 5_000,
                output_tokens: 1_000,
                cache_read_input_tokens: 3_000,
                cache_creation_input_tokens: 500,
            }),
        ]);

        mockGetClaudeClient.mockResolvedValue({
            messages: {
                stream: vi.fn(() => {
                    mockStream._run();
                    return mockStream;
                }),
            },
        } as never);

        return streamChat(makeOpts()).then((result) => {
            expect(result.normalizedUsage).toBeDefined();
            const nu = result.normalizedUsage!;

            // Claude: input.total = input_tokens + cache_read + cache_write
            expect(nu.contextWindow.inputTokens).toBe(5_000 + 3_000 + 500);
            // input.fresh = input_tokens (Claude excludes cached from input_tokens)
            expect(nu.billing.input.fresh).toBe(5_000);
            expect(nu.billing.input.cached).toBe(3_000);
            expect(nu.billing.input.cacheWrite).toBe(500);
            expect(nu.billing.output.total).toBe(1_000);
            expect(nu.billing.iterations).toBe(1);
            expect(nu.iterationDetails).toBeUndefined(); // single iteration
            expect(nu.provider).toBe("anthropic");
            expect(nu.model).toBe("test-claude-model");
            expect(nu.contextWindow.limit).toBe(1_000_000);
            // percent is float
            const expectedPercent = (8_500 / 1_000_000) * 100;
            expect(nu.contextWindow.percent).toBeCloseTo(expectedPercent, 6);
        });
    });

    it("contextWindow uses last iteration, billing sums all", async () => {
        const tools = [
            { name: "testTool", description: "test", parametersJsonSchema: { type: "object" } },
        ];
        const toolContext = { userId: "u1", channelId: "ch1" };

        // Iteration 1: tool call → iteration 2: final text
        mockClientStreams(
            {
                events: [
                    toolUseEvent("tu-1", "testTool", { x: 1 }),
                    finalMessageEvent({
                        input_tokens: 5_000,
                        output_tokens: 500,
                    }),
                ],
            },
            {
                events: [
                    ...textEvents("Result"),
                    finalMessageEvent({
                        input_tokens: 8_000,
                        output_tokens: 1_000,
                        cache_read_input_tokens: 4_000,
                    }),
                ],
            },
        );

        mockExecuteToolBatch.mockResolvedValueOnce({
            results: [{ name: "testTool", args: { x: 1 }, result: { ok: true } }],
        });

        const result = await streamChat(
            makeOptsWithCallbacks({}, { tools, toolContext }),
        );

        expect(result.normalizedUsage).toBeDefined();
        const nu = result.normalizedUsage!;

        // contextWindow from last iteration (iteration 2)
        expect(nu.contextWindow.inputTokens).toBe(8_000 + 4_000); // 12_000
        // billing sums both iterations
        expect(nu.billing.iterations).toBe(2);
        expect(nu.billing.input.total).toBe(5_000 + 12_000); // 17_000
        expect(nu.billing.output.total).toBe(500 + 1_000); // 1_500
        expect(nu.iterationDetails).toHaveLength(2);
    });

    it("counts thinking tokens from thinking_delta chars / 4", () => {
        const thinkingText = "a".repeat(400); // 400 chars → ~100 tokens

        const mockStream = buildMockStream([
            ...thinkingEvents(thinkingText),
            ...textEvents("Answer"),
            finalMessageEvent({
                input_tokens: 5_000,
                output_tokens: 2_000,
            }),
        ]);

        mockGetClaudeClient.mockResolvedValue({
            messages: {
                stream: vi.fn(() => {
                    mockStream._run();
                    return mockStream;
                }),
            },
        } as never);

        return streamChat(
            makeOptsWithCallbacks({ thinkingOptionId: "default" }),
        ).then((result) => {
            expect(result.normalizedUsage).toBeDefined();
            const nu = result.normalizedUsage!;

            // thinking chars = 400, tokens = ceil(400/4) = 100
            expect(nu.billing.output.thinking).toBe(100);
            expect(nu.contextWindow.thinkingTokens).toBe(100);
            // thinking is subset of output, not additive
            expect(nu.billing.cost.thinkingSubset).toBeGreaterThan(0);
            expect(nu.billing.cost.thinkingSubset).toBeLessThan(nu.billing.cost.output);
        });
    });
});

// ===========================================================================
// Suite F: Abort handling — partial usage on stopped messages
// ===========================================================================

describe("Claude streamChat — abort handling (stopped messages)", () => {
    it("returns partial=true and partial usage when aborted with earlyInputTokens", async () => {
        // Build a stream that emits "message" (earlyInputTokens), text, then AbortError
        const abortError = new Error("This operation was aborted");
        abortError.name = "AbortError";

        const abortController = new AbortController();

        const mockStream = vi.fn().mockImplementationOnce(() => {
            const stream = buildMockStream([
                // "message" event fires before content — carries input_tokens
                messageEvent({ input_tokens: 500 }),
                // Some text before abort
                { event: "text", data: "Hello partial" },
                // AbortError interrupts the stream
                { event: "error", data: abortError },
            ]);
            // Abort the signal before running — simulates client disconnect
            abortController.abort();
            stream._run();
            return stream;
        });

        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockStream },
        } as never);

        const result = await streamChat(makeOpts({ signal: abortController.signal }));

        // Should be marked as partial
        expect(result.partial).toBe(true);

        // Token usage should be built from earlyInputTokens
        expect(result.tokenUsage).toBeDefined();
        expect(result.tokenUsage!.promptTokens).toBe(500);

        // Output is approximate: ceil(text.length / 4)
        // "Hello partial" = 13 chars → ceil(13/4) = 4
        expect(result.tokenUsage!.completionTokens).toBe(Math.ceil("Hello partial".length / 4));

        // Total = input + output
        expect(result.tokenUsage!.totalTokens).toBe(
            result.tokenUsage!.promptTokens + result.tokenUsage!.completionTokens,
        );
    });

    it("sets normalizedUsage.partial=true on abort", async () => {
        const abortError = new Error("This operation was aborted");
        abortError.name = "AbortError";

        const abortController = new AbortController();

        const mockStream = vi.fn().mockImplementationOnce(() => {
            const stream = buildMockStream([
                messageEvent({ input_tokens: 1000 }),
                { event: "text", data: "Partial response text here" },
                { event: "error", data: abortError },
            ]);
            abortController.abort();
            stream._run();
            return stream;
        });

        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockStream },
        } as never);

        const result = await streamChat(makeOpts({ signal: abortController.signal }));

        expect(result.partial).toBe(true);
        expect(result.normalizedUsage).toBeDefined();
        expect(result.normalizedUsage!.partial).toBe(true);
    });

    it("captures cache tokens from message event on abort", async () => {
        const abortError = new Error("This operation was aborted");
        abortError.name = "AbortError";

        const abortController = new AbortController();

        const mockStream = vi.fn().mockImplementationOnce(() => {
            const stream = buildMockStream([
                // "message" event with cache fields
                { event: "message", data: { usage: {
                    input_tokens: 500,
                    cache_read_input_tokens: 4000,
                    cache_creation_input_tokens: 1000,
                } } },
                { event: "text", data: "Cached abort" },
                { event: "error", data: abortError },
            ]);
            abortController.abort();
            stream._run();
            return stream;
        });

        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockStream },
        } as never);

        const result = await streamChat(makeOpts({ signal: abortController.signal }));

        expect(result.partial).toBe(true);
        expect(result.tokenUsage).toBeDefined();
        expect(result.tokenUsage!.promptTokens).toBe(500);
        expect(result.tokenUsage!.cachedTokens).toBe(4000);
        expect(result.tokenUsage!.cacheWriteTokens).toBe(1000);
        // total = input + cached + cacheWrite + output
        const expectedOutput = Math.ceil("Cached abort".length / 4);
        expect(result.tokenUsage!.totalTokens).toBe(500 + 4000 + 1000 + expectedOutput);

        // normalizedUsage should reflect cache too
        expect(result.normalizedUsage).toBeDefined();
        expect(result.normalizedUsage!.billing.input.cached).toBe(4000);
        expect(result.normalizedUsage!.billing.input.cacheWrite).toBe(1000);
        expect(result.normalizedUsage!.billing.input.total).toBe(500 + 4000 + 1000);
    });

    it("preserves accumulated text on abort", async () => {
        const abortError = new Error("This operation was aborted");
        abortError.name = "AbortError";

        const abortController = new AbortController();

        const mockStream = vi.fn().mockImplementationOnce(() => {
            const stream = buildMockStream([
                messageEvent({ input_tokens: 100 }),
                { event: "text", data: "First " },
                { event: "text", data: "Second" },
                { event: "error", data: abortError },
            ]);
            abortController.abort();
            stream._run();
            return stream;
        });

        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockStream },
        } as never);

        const result = await streamChat(makeOpts({ signal: abortController.signal }));

        expect(result.text).toBe("First Second");
        expect(result.partial).toBe(true);
    });
});

// ===========================================================================
// Suite F: buildHistory — tool call reconstruction from history
// ===========================================================================

describe("Claude streamChat — buildHistory tool reconstruction", () => {
    it("history message with toolCalls → API receives tool_use + tool_result + text blocks", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Follow-up response"),
                finalMessageEvent({ input_tokens: 500, output_tokens: 20 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                {
                    id: "msg-1",
                    role: "user",
                    text: "Show me trending videos",
                },
                {
                    id: "msg-2",
                    role: "model",
                    text: "Here are the top videos",
                    toolCalls: [
                        {
                            name: "browseTrendVideos",
                            args: { channelId: "ch1", limit: 5 },
                            result: { videos: [{ id: "v1", title: "Top Video" }] },
                        },
                    ],
                },
            ],
            text: "Show thumbnails for the first one",
        }));

        // Extract messages sent to Claude API
        const apiCall = mockStream.mock.calls[0][0];
        const messages = apiCall.messages as Array<{ role: string; content: unknown }>;

        // msg-1: user message (standard)
        expect(messages[0].role).toBe("user");

        // msg-2 expands to 3 messages: assistant[tool_use], user[tool_result], assistant[text]
        // Index 1: assistant with tool_use
        expect(messages[1].role).toBe("assistant");
        const assistantBlocks = messages[1].content as Array<Record<string, unknown>>;
        expect(assistantBlocks).toHaveLength(1);
        expect(assistantBlocks[0].type).toBe("tool_use");
        expect(assistantBlocks[0].name).toBe("browseTrendVideos");
        expect(assistantBlocks[0].input).toEqual({ channelId: "ch1", limit: 5 });
        expect(assistantBlocks[0].id).toBe("hist-msg-2-0");

        // Index 2: user with tool_result
        expect(messages[2].role).toBe("user");
        const resultBlocks = messages[2].content as Array<Record<string, unknown>>;
        expect(resultBlocks).toHaveLength(1);
        expect(resultBlocks[0].type).toBe("tool_result");
        expect(resultBlocks[0].tool_use_id).toBe("hist-msg-2-0");
        const resultContent = resultBlocks[0].content as string;
        expect(resultContent).toContain("v1");
        expect(resultContent).toContain("Top Video");

        // Index 3: assistant with text
        expect(messages[3].role).toBe("assistant");
        const textBlocks = messages[3].content as Array<Record<string, unknown>>;
        expect(textBlocks[0].type).toBe("text");
        expect(textBlocks[0].text).toBe("Here are the top videos");

        // Index 4: current user message
        expect(messages[4].role).toBe("user");
    });

    it("tool_use_id matches between tool_use and tool_result for each tool call", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Done"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 10 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "query" },
                {
                    id: "m1",
                    role: "model",
                    text: "result",
                    toolCalls: [
                        { name: "toolA", args: { x: 1 }, result: { a: "yes" } },
                        { name: "toolB", args: { y: 2 }, result: { b: "no" } },
                    ],
                },
            ],
            text: "next",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // assistant message: 2 tool_use blocks
        const assistantContent = messages[1].content as Array<Record<string, unknown>>;
        expect(assistantContent).toHaveLength(2);
        const ids = assistantContent.map(b => b.id);
        expect(ids).toEqual(["hist-m1-0", "hist-m1-1"]);

        // user message: 2 tool_result blocks with matching ids
        const resultContent = messages[2].content as Array<Record<string, unknown>>;
        expect(resultContent).toHaveLength(2);
        expect(resultContent[0].tool_use_id).toBe("hist-m1-0");
        expect(resultContent[1].tool_use_id).toBe("hist-m1-1");
    });

    it("strict user/assistant alternation maintained after reconstruction", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Reply"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 10 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "first" },
                {
                    id: "m1",
                    role: "model",
                    text: "tool answer",
                    toolCalls: [{ name: "t1", args: {}, result: { ok: true } }],
                },
                { id: "u2", role: "user", text: "second" },
                { id: "m2", role: "model", text: "plain answer" },
            ],
            text: "third",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string }>;
        const roles = messages.map(m => m.role);

        // Expected: user, assistant(tool_use), user(tool_result), assistant(text), user, assistant, user(current)
        expect(roles).toEqual([
            "user",       // u1
            "assistant",  // m1 → tool_use
            "user",       // m1 → tool_result
            "assistant",  // m1 → text
            "user",       // u2
            "assistant",  // m2
            "user",       // current message
        ]);
    });

    it("history message without toolCalls → standard single message (regression)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Reply"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 10 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "hello" },
                { id: "m1", role: "model", text: "hi there" },
            ],
            text: "follow up",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // 3 messages: user, assistant, user(current) — no expansion
        expect(messages).toHaveLength(3);
        expect(messages[0].role).toBe("user");
        expect(messages[1].role).toBe("assistant");
        expect(messages[2].role).toBe("user");
    });

    it("toolCalls with undefined result → fallback to text-only (stopped message)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Reply"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 10 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "query" },
                {
                    id: "m1",
                    role: "model",
                    text: "Partial response before stop",
                    toolCalls: [{ name: "stoppedTool", args: { x: 1 } }], // no result
                },
            ],
            text: "continue",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // Fallback: 3 messages (user, assistant-text-only, user-current) — no tool reconstruction
        expect(messages).toHaveLength(3);
        expect(messages[1].role).toBe("assistant");
        const blocks = messages[1].content as Array<Record<string, unknown>>;
        // Should be text block only, no tool_use
        expect(blocks.every(b => b.type === "text")).toBe(true);
    });

    it("toolCalls with mixed results (some defined, some undefined) → reconstruction with is_error fallback", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Reply"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 10 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "query" },
                {
                    id: "m1",
                    role: "model",
                    text: "Partial analysis before abort",
                    toolCalls: [
                        { name: "analyzeTraffic", args: { videoId: "v1" }, result: { views: 1000 } },
                        { name: "analyzeSuggested", args: { videoId: "v1" } }, // no result — interrupted
                    ],
                },
            ],
            text: "continue",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // Reconstruction: u1(user) → m1-tool_use(assistant) → m1-tool_result(user) → m1-text(assistant) → current(user)
        expect(messages).toHaveLength(5);

        // assistant message: both tool_use blocks present
        const assistantBlocks = messages[1].content as Array<Record<string, unknown>>;
        const toolUseBlocks = assistantBlocks.filter(b => b.type === "tool_use");
        expect(toolUseBlocks).toHaveLength(2);

        // user message: tool_result blocks — first with real result, second with is_error
        const resultBlocks = messages[2].content as Array<Record<string, unknown>>;
        expect(resultBlocks).toHaveLength(2);

        // First tool: real result
        expect(resultBlocks[0].is_error).toBeFalsy();
        expect(resultBlocks[0].content).toBe(JSON.stringify({ views: 1000 }));

        // Second tool: interrupted → is_error
        expect(resultBlocks[1].is_error).toBe(true);
        expect(resultBlocks[1].content).toBe("Tool execution was interrupted by user.");

        // Third message: assistant text block
        expect(messages[3].role).toBe("assistant");
        const textBlocks = messages[3].content as Array<Record<string, unknown>>;
        expect(textBlocks[0].text).toBe("Partial analysis before abort");
    });

    it("empty text in model message with toolCalls → no empty text block added", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Reply"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 10 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "query" },
                {
                    id: "m1",
                    role: "model",
                    text: "", // empty text
                    toolCalls: [{ name: "tool1", args: {}, result: { ok: true } }],
                },
            ],
            text: "next",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // Only 2 messages from reconstruction (no 3rd text block) + user(u1) + user(current)
        // u1(user) → m1-tool_use(assistant) → m1-tool_result(user) → current(user)
        // But wait — two consecutive user messages! The current message is user.
        // Actually: u1(user), m1-tool_use(assistant), m1-tool_result(user), current(user)
        // Two consecutive user messages (tool_result + current) — Claude will handle this
        // because cache breakpoints merge adjacent same-role messages.
        // The key point: NO empty assistant text block.
        const roles = messages.map(m => m.role);
        expect(roles).not.toContain(undefined);

        // Verify no assistant message has empty text block
        for (const msg of messages) {
            if (msg.role === "assistant") {
                const content = msg.content as Array<Record<string, unknown>>;
                for (const block of content) {
                    if (block.type === "text") {
                        expect(block.text).not.toBe("");
                    }
                }
            }
        }
    });
});

// ===========================================================================
// Suite H: Dynamic timeout + heartbeat during thinking
// ===========================================================================

describe("Claude streamChat — thinking timeout resilience", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("escalates timeout to 600s after first thinking event — no timeout at 90s", async () => {
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // Stream: message → thinking → (100s gap) → text → finalMessage → end
        // Without escalation, 100s gap would exceed 90s default timeout
        mockMessagesStream.mockImplementationOnce(() => {
            const handlers: Record<string, EventHandler[]> = {};
            const stream = {
                on(event: string, handler: EventHandler) {
                    if (!handlers[event]) handlers[event] = [];
                    handlers[event].push(handler);
                    return stream;
                },
            };
            setTimeout(() => {
                handlers["message"]?.forEach(h => h({ usage: { input_tokens: 100 } }));
            }, 100);
            setTimeout(() => {
                handlers["thinking"]?.forEach(h => h("Let me think deeply..."));
            }, 200);
            setTimeout(() => {
                handlers["contentBlock"]?.forEach(h => h({ type: "thinking", thinking: "Let me think deeply...", signature: "sig" }));
            }, 200);
            // 100s gap — exceeds 90s default, within 600s escalated
            setTimeout(() => {
                handlers["text"]?.forEach(h => h("Answer"));
            }, 100_200);
            setTimeout(() => {
                handlers["contentBlock"]?.forEach(h => h({ type: "text", text: "Answer" }));
            }, 100_200);
            setTimeout(() => {
                handlers["finalMessage"]?.forEach(h => h({ usage: { input_tokens: 100, output_tokens: 20 } }));
            }, 100_300);
            setTimeout(() => {
                handlers["end"]?.forEach(h => h(undefined));
            }, 100_400);
            return stream;
        });

        const resultPromise = streamChat(makeOpts());
        await vi.advanceTimersByTimeAsync(110_000);
        const result = await resultPromise;
        expect(result.text).toBe("Answer");
    });

    it("de-escalates timeout to 90s after text event follows thinking", async () => {
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // Stream: thinking → text (quickly) → then 95s silence → timeout at de-escalated 90s
        // Since hadThinkingEvents is still true, streamChat returns partial (not throws)
        mockMessagesStream.mockImplementationOnce(() => {
            const handlers: Record<string, EventHandler[]> = {};
            const stream = {
                on(event: string, handler: EventHandler) {
                    if (!handlers[event]) handlers[event] = [];
                    handlers[event].push(handler);
                    return stream;
                },
            };
            setTimeout(() => {
                handlers["message"]?.forEach(h => h({ usage: { input_tokens: 100 } }));
            }, 100);
            setTimeout(() => {
                handlers["thinking"]?.forEach(h => h("Quick thought"));
            }, 200);
            setTimeout(() => {
                handlers["text"]?.forEach(h => h("Start"));
            }, 1200);
            // No 'end' event — stream will timeout after 90s from last text event
            return stream;
        });

        const resultPromise = streamChat(makeOpts());
        await vi.advanceTimersByTimeAsync(97_000);

        // Returns partial (thinking was active earlier) — de-escalated timeout fires at 90s
        const result = await resultPromise;
        expect(result.partial).toBe(true);
        // Text "Start" was inside streamIteration (which threw), not propagated to outer scope
        expect(result.text).toBe("");
    });

    it("returns partial result with earlyInputTokens on thinking timeout", async () => {
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // Stream: thinking event, then silence → 600s timeout → partial result (not throw)
        mockMessagesStream.mockImplementationOnce(() => {
            const handlers: Record<string, EventHandler[]> = {};
            const stream = {
                on(event: string, handler: EventHandler) {
                    if (!handlers[event]) handlers[event] = [];
                    handlers[event].push(handler);
                    return stream;
                },
            };
            setTimeout(() => {
                handlers["message"]?.forEach(h => h({ usage: { input_tokens: 500, cache_read_input_tokens: 200 } }));
            }, 100);
            setTimeout(() => {
                handlers["thinking"]?.forEach(h => h("Deep thinking..."));
            }, 200);
            // No end — will timeout at 600s
            return stream;
        });

        const resultPromise = streamChat(makeOpts());
        await vi.advanceTimersByTimeAsync(700_000);

        const result = await resultPromise;
        expect(result.partial).toBe(true);
        expect(result.text).toBe("");
        // tokenUsage built from earlyInputTokens
        expect(result.tokenUsage?.promptTokens).toBe(500);
        expect(result.tokenUsage?.cachedTokens).toBe(200);
    });

    it("calls onHeartbeat during thinking silence", async () => {
        const onHeartbeat = vi.fn();
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // Stream: thinking → 120s silence → text → end
        mockMessagesStream.mockImplementationOnce(() => {
            const handlers: Record<string, EventHandler[]> = {};
            const stream = {
                on(event: string, handler: EventHandler) {
                    if (!handlers[event]) handlers[event] = [];
                    handlers[event].push(handler);
                    return stream;
                },
            };
            setTimeout(() => {
                handlers["message"]?.forEach(h => h({ usage: { input_tokens: 100 } }));
            }, 100);
            setTimeout(() => {
                handlers["thinking"]?.forEach(h => h("Thinking..."));
            }, 200);
            // Text at 120s
            setTimeout(() => {
                handlers["text"]?.forEach(h => h("Answer"));
            }, 120_000);
            setTimeout(() => {
                handlers["contentBlock"]?.forEach(h => h({ type: "text", text: "Answer" }));
            }, 120_000);
            setTimeout(() => {
                handlers["finalMessage"]?.forEach(h => h({ usage: { input_tokens: 100, output_tokens: 20 } }));
            }, 120_100);
            setTimeout(() => {
                handlers["end"]?.forEach(h => h(undefined));
            }, 120_200);
            return stream;
        });

        const resultPromise = streamChat(
            makeOptsWithCallbacks({ onHeartbeat }),
        );

        await vi.advanceTimersByTimeAsync(130_000);
        await resultPromise;

        // Heartbeat every 30s: at ~30.2s, ~60.2s, ~90.2s = 3 heartbeats before text at 120s
        expect(onHeartbeat).toHaveBeenCalled();
        expect(onHeartbeat.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("returns partial result (not throws) on thinking timeout", async () => {
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // Stream: message → thinking → silence → 600s timeout
        // streamChat should catch the thinking timeout and return partial result
        mockMessagesStream.mockImplementationOnce(() => {
            const handlers: Record<string, EventHandler[]> = {};
            const stream = {
                on(event: string, handler: EventHandler) {
                    if (!handlers[event]) handlers[event] = [];
                    handlers[event].push(handler);
                    return stream;
                },
            };
            setTimeout(() => {
                handlers["message"]?.forEach(h => h({ usage: { input_tokens: 1000, cache_read_input_tokens: 500 } }));
            }, 100);
            setTimeout(() => {
                handlers["thinking"]?.forEach(h => h("Deep analysis in progress..."));
            }, 200);
            // No end — will timeout at 600s
            return stream;
        });

        const resultPromise = streamChat(makeOpts());
        // Attach handler before advancing timers
        const resultOrError = resultPromise.catch((err: unknown) => err);
        await vi.advanceTimersByTimeAsync(700_000);

        const result = await resultOrError;
        // Should be a partial result, NOT an error
        expect(result).not.toBeInstanceOf(Error);
        expect((result as { partial: boolean }).partial).toBe(true);
        expect((result as { text: string }).text).toBe("");
        // tokenUsage built from earlyInputTokens
        expect((result as { tokenUsage: { promptTokens: number } }).tokenUsage?.promptTokens).toBe(1000);
    });

    it("stops heartbeat after text event arrives", async () => {
        const onHeartbeat = vi.fn();
        const mockMessagesStream = vi.fn();
        mockGetClaudeClient.mockResolvedValue({
            messages: { stream: mockMessagesStream },
        } as never);

        // Stream: thinking → text (at 5s) → end (at 6s)
        mockMessagesStream.mockImplementationOnce(() => {
            const handlers: Record<string, EventHandler[]> = {};
            const stream = {
                on(event: string, handler: EventHandler) {
                    if (!handlers[event]) handlers[event] = [];
                    handlers[event].push(handler);
                    return stream;
                },
            };
            setTimeout(() => {
                handlers["message"]?.forEach(h => h({ usage: { input_tokens: 100 } }));
            }, 100);
            setTimeout(() => {
                handlers["thinking"]?.forEach(h => h("Quick"));
            }, 200);
            setTimeout(() => {
                handlers["text"]?.forEach(h => h("Done"));
            }, 5_000);
            setTimeout(() => {
                handlers["contentBlock"]?.forEach(h => h({ type: "text", text: "Done" }));
            }, 5_000);
            setTimeout(() => {
                handlers["finalMessage"]?.forEach(h => h({ usage: { input_tokens: 100, output_tokens: 10 } }));
            }, 5_100);
            setTimeout(() => {
                handlers["end"]?.forEach(h => h(undefined));
            }, 5_200);
            return stream;
        });

        const resultPromise = streamChat(
            makeOptsWithCallbacks({ onHeartbeat }),
        );

        await vi.advanceTimersByTimeAsync(100_000);
        await resultPromise;

        // Text at 5s, heartbeat interval = 30s → first heartbeat would be at ~30.2s
        // But text arrives at 5s, clearing heartbeat interval. No heartbeats fired.
        expect(onHeartbeat).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// Suite G: Cache-aligned history — toolIterations reconstruction
// ===========================================================================

describe("Claude streamChat — toolIterations (cache-aligned history)", () => {

    it("toolIterations → per-iteration assistant/user pairs (not collapsed)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("Follow-up"),
                finalMessageEvent({ input_tokens: 200, output_tokens: 10 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "analyze" },
                {
                    id: "m1",
                    role: "model",
                    text: "Analysis complete",
                    toolIterations: [
                        {
                            assistantContent: [
                                { type: "thinking", thinking: "Let me analyze..." },
                                { type: "tool_use", id: "toolu_abc", name: "analyzeTraffic", input: { videoId: "v1" } },
                            ],
                            toolResults: [
                                { type: "tool_result", tool_use_id: "toolu_abc", content: [{ type: "text", text: '{"views":1000}' }] },
                            ],
                        },
                        {
                            assistantContent: [
                                { type: "tool_use", id: "toolu_def", name: "mentionVideo", input: { videoId: "v1" } },
                            ],
                            toolResults: [
                                { type: "tool_result", tool_use_id: "toolu_def", content: [{ type: "text", text: '{"title":"My Video"}' }] },
                            ],
                        },
                    ],
                    toolCalls: [
                        { name: "analyzeTraffic", args: { videoId: "v1" }, result: { views: 1000 } },
                        { name: "mentionVideo", args: { videoId: "v1" }, result: { title: "My Video" } },
                    ],
                },
            ],
            text: "next question",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // u1, asst_iter1, user_iter1, asst_iter2, user_iter2, asst_text, user_current = 7
        expect(messages).toHaveLength(7);
        expect(messages.map(m => m.role)).toEqual([
            "user",       // u1
            "assistant",  // iter1 assistant (thinking + tool_use)
            "user",       // iter1 tool_result
            "assistant",  // iter2 assistant (tool_use)
            "user",       // iter2 tool_result
            "assistant",  // final text
            "user",       // current message
        ]);

        // Iteration 1: assistant with thinking + tool_use
        const iter1Asst = messages[1].content as Array<Record<string, unknown>>;
        expect(iter1Asst).toHaveLength(2);
        expect(iter1Asst[0].type).toBe("thinking");
        expect(iter1Asst[1].type).toBe("tool_use");
        expect(iter1Asst[1].id).toBe("toolu_abc");

        // Iteration 1: user with tool_result
        const iter1Results = messages[2].content as Array<Record<string, unknown>>;
        expect(iter1Results[0].type).toBe("tool_result");
        expect(iter1Results[0].tool_use_id).toBe("toolu_abc");

        // Iteration 2: original API ID preserved
        const iter2Asst = messages[3].content as Array<Record<string, unknown>>;
        expect(iter2Asst[0].id).toBe("toolu_def");

        // Final text
        const textBlocks = messages[5].content as Array<Record<string, unknown>>;
        expect(textBlocks[0].type).toBe("text");
        expect(textBlocks[0].text).toBe("Analysis complete");
    });

    it("toolIterations with text → 2*N+1 assistant/user messages + current", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("OK"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 5 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "query" },
                {
                    id: "m1",
                    role: "model",
                    text: "Final answer",
                    toolIterations: [
                        {
                            assistantContent: [
                                { type: "tool_use", id: "toolu_1", name: "tool1", input: {} },
                            ],
                            toolResults: [
                                { type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "{}" }] },
                            ],
                        },
                    ],
                },
            ],
            text: "follow up",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // u1, asst(tool_use), user(tool_result), asst(text), user(current) = 5
        expect(messages).toHaveLength(5);
        expect(messages.map(m => m.role)).toEqual([
            "user", "assistant", "user", "assistant", "user",
        ]);

        // Final assistant message has text
        const textMsg = messages[3].content as Array<Record<string, unknown>>;
        expect(textMsg[0].type).toBe("text");
        expect(textMsg[0].text).toBe("Final answer");
    });

    it("toolIterations takes priority over toolCalls (not both expanded)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("OK"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 5 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "q" },
                {
                    id: "m1",
                    role: "model",
                    text: "Answer",
                    toolIterations: [
                        {
                            assistantContent: [
                                { type: "tool_use", id: "real-id", name: "myTool", input: { a: 1 } },
                            ],
                            toolResults: [
                                { type: "tool_result", tool_use_id: "real-id", content: [{ type: "text", text: '{"ok":true}' }] },
                            ],
                        },
                    ],
                    toolCalls: [
                        { name: "myTool", args: { a: 1 }, result: { ok: true } },
                    ],
                },
            ],
            text: "next",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // Should use toolIterations (real-id), NOT toolCalls (hist-m1-0)
        const assistantContent = messages[1].content as Array<Record<string, unknown>>;
        expect(assistantContent[0].id).toBe("real-id"); // From toolIterations
        expect(assistantContent[0].id).not.toBe("hist-m1-0"); // NOT from legacy
    });

    it("invalid toolIterations → fallback to legacy toolCalls", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("OK"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 5 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "q" },
                {
                    id: "m1",
                    role: "model",
                    text: "Answer",
                    toolIterations: [
                        {
                            assistantContent: [{ broken: true }], // Missing type/id
                            toolResults: [{ type: "tool_result", tool_use_id: "x", content: "" }],
                        },
                    ],
                    toolCalls: [
                        { name: "myTool", args: {}, result: { ok: true } },
                    ],
                },
            ],
            text: "next",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // Fallback to legacy: should use synthetic IDs
        const assistantContent = messages[1].content as Array<Record<string, unknown>>;
        expect(assistantContent[0].id).toBe("hist-m1-0"); // Legacy synthetic ID
    });

    it("tool_use IDs from API preserved (not synthetic)", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("OK"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 5 }),
            ],
        });

        const originalId = "toolu_01ABC123XYZ";
        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "q" },
                {
                    id: "m1",
                    role: "model",
                    text: "Done",
                    toolIterations: [
                        {
                            assistantContent: [
                                { type: "tool_use", id: originalId, name: "analyzeTraffic", input: { v: "x" } },
                            ],
                            toolResults: [
                                { type: "tool_result", tool_use_id: originalId, content: [{ type: "text", text: "{}" }] },
                            ],
                        },
                    ],
                },
            ],
            text: "next",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;
        const assistantContent = messages[1].content as Array<Record<string, unknown>>;
        const resultContent = messages[2].content as Array<Record<string, unknown>>;

        expect(assistantContent[0].id).toBe(originalId);
        expect(resultContent[0].tool_use_id).toBe(originalId);
    });

    it("thinking blocks preserved in toolIterations reconstruction", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("OK"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 5 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "q" },
                {
                    id: "m1",
                    role: "model",
                    text: "Result",
                    toolIterations: [
                        {
                            assistantContent: [
                                { type: "thinking", thinking: "Deep analysis of traffic patterns..." },
                                { type: "tool_use", id: "toolu_think", name: "analyze", input: {} },
                            ],
                            toolResults: [
                                { type: "tool_result", tool_use_id: "toolu_think", content: [{ type: "text", text: "{}" }] },
                            ],
                        },
                    ],
                },
            ],
            text: "next",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;
        const assistantContent = messages[1].content as Array<Record<string, unknown>>;

        expect(assistantContent[0].type).toBe("thinking");
        expect(assistantContent[0].thinking).toBe("Deep analysis of traffic patterns...");
        expect(assistantContent[1].type).toBe("tool_use");
    });

    it("toolIterations without msg.text → no extra assistant text message", async () => {
        const mockStream = mockClientStreams({
            events: [
                ...textEvents("OK"),
                finalMessageEvent({ input_tokens: 100, output_tokens: 5 }),
            ],
        });

        await streamChat(makeOpts({
            history: [
                { id: "u1", role: "user", text: "q" },
                {
                    id: "m1",
                    role: "model",
                    text: "", // Empty text — no final assistant text message should be appended
                    toolIterations: [
                        {
                            assistantContent: [
                                { type: "tool_use", id: "toolu_x", name: "tool1", input: {} },
                            ],
                            toolResults: [
                                { type: "tool_result", tool_use_id: "toolu_x", content: [{ type: "text", text: "{}" }] },
                            ],
                        },
                    ],
                },
            ],
            text: "next",
        }));

        const messages = mockStream.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;

        // u1, asst(tool_use), user(tool_result), user(current) = 4 (no assistant text)
        expect(messages).toHaveLength(4);
        expect(messages.map(m => m.role)).toEqual([
            "user", "assistant", "user", "user",
        ]);
    });

    it("JSON.parse(JSON.stringify()) roundtrip preserves content blocks", () => {
        // Simulates Firestore serialization roundtrip
        const original = {
            assistantContent: [
                { type: "thinking", thinking: "analysis" },
                { type: "tool_use", id: "toolu_abc", name: "tool1", input: { nested: { deep: true } } },
            ],
            toolResults: [
                { type: "tool_result", tool_use_id: "toolu_abc", content: [{ type: "text", text: '{"data":42}' }] },
            ],
        };

        const roundtripped = JSON.parse(JSON.stringify(original));

        expect(roundtripped).toEqual(original);
        expect(roundtripped.assistantContent[1].id).toBe("toolu_abc");
        expect(roundtripped.toolResults[0].tool_use_id).toBe("toolu_abc");
    });

    it("ImageBlockParam in tool_result survives roundtrip", () => {
        const original = {
            assistantContent: [
                { type: "tool_use", id: "toolu_img", name: "viewThumbnails", input: {} },
            ],
            toolResults: [
                {
                    type: "tool_result",
                    tool_use_id: "toolu_img",
                    content: [
                        { type: "text", text: '{"ok":true}' },
                        { type: "image", source: { type: "url", url: "https://example.com/thumb.jpg" } },
                    ],
                },
            ],
        };

        const roundtripped = JSON.parse(JSON.stringify(original));
        expect(roundtripped).toEqual(original);

        const imgBlock = roundtripped.toolResults[0].content[1];
        expect(imgBlock.type).toBe("image");
        expect(imgBlock.source.url).toBe("https://example.com/thumb.jpg");
    });
});

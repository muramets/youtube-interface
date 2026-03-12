// =============================================================================
// streamChat — contract tests (characterization)
//
// Lock down the EXISTING behavior of streamChat() before wrapping in AiProvider.
// Tests verify behavior through the public interface only:
//   - Suite A: Happy path — single-turn text response
//   - Suite B: Agentic loop — tool calling, chaining, MAX_AGENTIC_ITERATIONS
//   - Suite C: Thinking — thought extraction and leak protection
//
// All external dependencies are mocked — no live Gemini API key needed.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat } from '../streamChat.js';
import type { TokenUsage } from '../../ai/types.js';

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

type ChunkShape = {
    candidates?: Array<{
        content?: {
            parts?: Array<Record<string, unknown>>;
        };
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        cachedContentTokenCount?: number;
        thoughtsTokenCount?: number;
    };
};

/** Build an async iterable that yields the given chunks in order. */
async function* makeChunks(...chunks: ChunkShape[]) {
    for (const chunk of chunks) {
        yield chunk;
    }
}

/** Build a single text chunk with optional usage metadata. */
function textChunk(
    text: string,
    usage?: ChunkShape['usageMetadata'],
): ChunkShape {
    return {
        candidates: [{ content: { parts: [{ text }] } }],
        ...(usage ? { usageMetadata: usage } : {}),
    };
}

/** Build a chunk with a functionCall part. */
function functionCallChunk(
    name: string,
    args: Record<string, unknown>,
): ChunkShape {
    return {
        candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
    };
}

/** Build a chunk with a thought part (thinking token). */
function thoughtChunk(text: string): ChunkShape {
    return {
        candidates: [{ content: { parts: [{ thought: true, text }] } }],
    };
}

// ---------------------------------------------------------------------------
// Module mocks (same pattern as streamChat.retry.test.ts)
// ---------------------------------------------------------------------------

vi.mock('../client.js', () => ({
    getClient: vi.fn(),
    isGeminiUriValid: vi.fn(() => false),
}));

vi.mock('../thumbnails.js', () => ({
    fetchThumbnailParts: vi.fn().mockResolvedValue({ parts: [], updatedCache: {} }),
    buildUserParts: vi.fn((_text: string) => [{ text: _text }]),
}));

vi.mock('../thumbnailMiddleware.js', () => ({
    enhanceWithThumbnails: vi.fn().mockReturnValue({
        imageUrls: [],
        cleanedResponse: {},
        blockedCount: undefined,
    }),
}));

vi.mock('../../memory.js', () => ({
    formatContextLabel: vi.fn().mockReturnValue('[context]'),
}));

vi.mock('../../tools/index.js', () => ({
    TOOL_DECLARATIONS: [{ name: 'testTool' }],
}));

// executeTool is now imported by executeToolBatch from tools/executor.js
vi.mock('../../tools/executor.js', () => ({
    executeTool: vi.fn(),
}));

vi.mock('../../../config/models.js', () => ({
    MODEL_REGISTRY: [
        {
            id: 'test-model',
            provider: 'gemini',
            contextLimit: 1_000_000,
            thinkingMode: 'budget',
            thinkingOptions: [{ id: 'default', value: 1024 }],
            thinkingDefault: 'default',
            pricing: {
                inputPerMillion: 1.25,
                outputPerMillion: 10.00,
                inputPerMillionLong: 2.50,
                outputPerMillionLong: 15.00,
            },
        },
    ],
}));

vi.mock('../fileUpload.js', () => ({
    reuploadFromStorage: vi.fn(),
    uploadToGemini: vi.fn(),
    uploadFromStoragePath: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: vi.fn(),
    createPartFromFunctionCall: vi.fn(
        (name: string, args: Record<string, unknown>) => ({ functionCall: { name, args } }),
    ),
    createPartFromFunctionResponse: vi.fn(
        (_id: string, name: string, response: Record<string, unknown>) => ({
            functionResponse: { name, response },
        }),
    ),
}));

// ---------------------------------------------------------------------------
// Import mocked modules
// ---------------------------------------------------------------------------

import { getClient } from '../client.js';
import { executeTool } from '../../tools/executor.js';
import { enhanceWithThumbnails } from '../thumbnailMiddleware.js';

const mockGetClient = vi.mocked(getClient);
const mockExecuteTool = vi.mocked(executeTool);
const mockEnhance = vi.mocked(enhanceWithThumbnails);

// ---------------------------------------------------------------------------
// Shared opts factory
// ---------------------------------------------------------------------------

function makeOpts(
    overrides: Partial<Parameters<typeof streamChat>[0]> = {},
): Parameters<typeof streamChat>[0] {
    return {
        apiKey: 'test-key',
        model: 'test-model',
        history: [],
        text: 'hello',
        onChunk: vi.fn(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockStreamResponse(
    ...calls: Array<() => ReturnType<typeof makeChunks>>
) {
    const mockGenerateContentStream = vi.fn();
    for (let i = 0; i < calls.length; i++) {
        mockGenerateContentStream.mockImplementationOnce(async () => calls[i]());
    }
    mockGetClient.mockResolvedValue({
        models: { generateContentStream: mockGenerateContentStream },
    } as never);
    return mockGenerateContentStream;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
    // Reset enhanceWithThumbnails to default passthrough
    mockEnhance.mockReturnValue({
        imageUrls: [],
        cleanedResponse: {},
        blockedCount: undefined,
    });
});

// ===========================================================================
// Suite A: Happy path — single-turn text response
// ===========================================================================

describe('streamChat — happy path (single-turn text)', () => {
    it('returns accumulated text from a stream of text chunks', async () => {
        const onChunk = vi.fn();

        mockStreamResponse(
            () => makeChunks(
                textChunk('Hello'),
                textChunk(' world'),
            ),
        );

        const result = await streamChat(makeOpts({ onChunk }));

        expect(result.text).toBe('Hello world');
    });

    it('calls onChunk with accumulated text after each chunk', async () => {
        const onChunk = vi.fn();

        mockStreamResponse(
            () => makeChunks(
                textChunk('Hello'),
                textChunk(' world'),
            ),
        );

        await streamChat(makeOpts({ onChunk }));

        // onChunk is called with the full accumulated text each time
        expect(onChunk).toHaveBeenCalledTimes(2);
        expect(onChunk).toHaveBeenNthCalledWith(1, 'Hello');
        expect(onChunk).toHaveBeenNthCalledWith(2, 'Hello world');
    });

    it('extracts tokenUsage from usageMetadata', async () => {
        mockStreamResponse(
            () => makeChunks(
                textChunk('Hi', {
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    totalTokenCount: 150,
                }),
            ),
        );

        const result = await streamChat(makeOpts());

        expect(result.tokenUsage).toEqual<TokenUsage>({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            cachedTokens: undefined,
        });
    });

    it('extracts cachedContentTokenCount into cachedTokens', async () => {
        mockStreamResponse(
            () => makeChunks(
                textChunk('Hi', {
                    promptTokenCount: 200,
                    candidatesTokenCount: 80,
                    totalTokenCount: 280,
                    cachedContentTokenCount: 120,
                }),
            ),
        );

        const result = await streamChat(makeOpts());

        expect(result.tokenUsage?.cachedTokens).toBe(120);
    });

    it('uses the LAST usageMetadata when multiple chunks have it', async () => {
        mockStreamResponse(
            () => makeChunks(
                textChunk('A', {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                    totalTokenCount: 15,
                }),
                textChunk('B', {
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    totalTokenCount: 150,
                }),
            ),
        );

        const result = await streamChat(makeOpts());

        // Last chunk's metadata wins
        expect(result.tokenUsage).toEqual<TokenUsage>({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            cachedTokens: undefined,
        });
    });

    it('does not call onToolCall when no function calls are returned', async () => {
        const onToolCall = vi.fn();

        mockStreamResponse(
            () => makeChunks(textChunk('Just text')),
        );

        await streamChat(makeOpts({ onToolCall }));

        expect(onToolCall).not.toHaveBeenCalled();
    });

    it('returns undefined toolCalls when no tools were called', async () => {
        mockStreamResponse(
            () => makeChunks(textChunk('No tools')),
        );

        const result = await streamChat(makeOpts());

        expect(result.toolCalls).toBeUndefined();
    });

    it('returns tokenUsage as undefined when no usageMetadata is present', async () => {
        mockStreamResponse(
            () => makeChunks(
                { candidates: [{ content: { parts: [{ text: 'bare' }] } }] },
            ),
        );

        const result = await streamChat(makeOpts());

        expect(result.tokenUsage).toBeUndefined();
    });
});

// ===========================================================================
// Suite B: Agentic loop — tool calling
// ===========================================================================

describe('streamChat — agentic loop (tool calling)', () => {
    const toolContext = { userId: 'u1', channelId: 'c1' };

    it('fires onToolCall when model returns a functionCall', async () => {
        const onToolCall = vi.fn();

        // First call: model returns functionCall; second call: model returns text
        mockStreamResponse(
            () => makeChunks(functionCallChunk('mentionVideo', { videoId: 'v1' })),
            () => makeChunks(textChunk('Done')),
        );
        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { success: true },
        });
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { success: true },
            blockedCount: undefined,
        });

        await streamChat(makeOpts({ onToolCall, toolContext }));

        expect(onToolCall).toHaveBeenCalledTimes(1);
        expect(onToolCall).toHaveBeenCalledWith('mentionVideo', { videoId: 'v1' }, 0);
    });

    it('fires onToolResult after tool execution', async () => {
        const onToolResult = vi.fn();

        mockStreamResponse(
            () => makeChunks(functionCallChunk('mentionVideo', { videoId: 'v1' })),
            () => makeChunks(textChunk('Done')),
        );
        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { success: true },
        });
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { success: true },
            blockedCount: undefined,
        });

        await streamChat(makeOpts({ onToolResult, toolContext }));

        expect(onToolResult).toHaveBeenCalledTimes(1);
        // onToolResult receives the cleaned response (without _systemNote)
        expect(onToolResult).toHaveBeenCalledWith('mentionVideo', { success: true }, 0);
    });

    it('calls the model again with tool result appended and returns final text', async () => {
        const mockGenerate = mockStreamResponse(
            () => makeChunks(functionCallChunk('mentionVideo', { videoId: 'v1' })),
            () => makeChunks(textChunk('Video mentioned successfully')),
        );
        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { success: true },
        });
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { success: true },
            blockedCount: undefined,
        });

        const result = await streamChat(makeOpts({ toolContext }));

        // Model was called twice: once for initial, once after tool result
        expect(mockGenerate).toHaveBeenCalledTimes(2);
        // Final text is from the second model call
        expect(result.text).toBe('Video mentioned successfully');
    });

    it('returns toolCalls array with recorded tool calls', async () => {
        mockStreamResponse(
            () => makeChunks(functionCallChunk('mentionVideo', { videoId: 'v1' })),
            () => makeChunks(textChunk('Done')),
        );
        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { title: 'My Video' },
        });
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { title: 'My Video' },
            blockedCount: undefined,
        });

        const result = await streamChat(makeOpts({ toolContext }));

        expect(result.toolCalls).toEqual([
            {
                name: 'mentionVideo',
                args: { videoId: 'v1' },
                result: { title: 'My Video' },
            },
        ]);
    });

    it('handles chained tool calls: tool A → result → tool B → result → final text', async () => {
        const onToolCall = vi.fn();
        const onToolResult = vi.fn();

        mockStreamResponse(
            // Iteration 1: model calls tool A
            () => makeChunks(functionCallChunk('analyzeSuggestedTraffic', { videoId: 'v1' })),
            // Iteration 2: model calls tool B based on tool A result
            () => makeChunks(functionCallChunk('viewThumbnails', { videoIds: ['v2', 'v3'] })),
            // Iteration 3: model returns final text
            () => makeChunks(textChunk('Analysis complete')),
        );

        // Tool A result
        mockExecuteTool
            .mockResolvedValueOnce({
                name: 'analyzeSuggestedTraffic',
                response: { topSources: [{ videoId: 'v2' }, { videoId: 'v3' }] },
            })
            // Tool B result
            .mockResolvedValueOnce({
                name: 'viewThumbnails',
                response: { thumbnails: ['url1', 'url2'] },
            });

        mockEnhance
            .mockReturnValueOnce({
                imageUrls: [],
                cleanedResponse: { topSources: [{ videoId: 'v2' }, { videoId: 'v3' }] },
                blockedCount: undefined,
            })
            .mockReturnValueOnce({
                imageUrls: [],
                cleanedResponse: { thumbnails: ['url1', 'url2'] },
                blockedCount: undefined,
            });

        const result = await streamChat(makeOpts({ onToolCall, onToolResult, toolContext }));

        // Two tool calls across two iterations
        expect(onToolCall).toHaveBeenCalledTimes(2);
        expect(onToolCall).toHaveBeenNthCalledWith(1, 'analyzeSuggestedTraffic', { videoId: 'v1' }, 0);
        expect(onToolCall).toHaveBeenNthCalledWith(2, 'viewThumbnails', { videoIds: ['v2', 'v3'] }, 1);

        expect(onToolResult).toHaveBeenCalledTimes(2);
        expect(result.text).toBe('Analysis complete');

        // toolCalls records both calls in order
        expect(result.toolCalls).toHaveLength(2);
        expect(result.toolCalls![0].name).toBe('analyzeSuggestedTraffic');
        expect(result.toolCalls![1].name).toBe('viewThumbnails');
    });

    it('stops after MAX_AGENTIC_ITERATIONS when model always returns function calls', async () => {
        // Model always returns a function call — should stop after 10 iterations
        const mockGenerate = vi.fn().mockImplementation(
            async () => makeChunks(functionCallChunk('mentionVideo', { videoId: 'v1' })),
        );
        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerate },
        } as never);

        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { success: true },
        });
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { success: true },
            blockedCount: undefined,
        });

        const result = await streamChat(makeOpts({ toolContext }));

        // MAX_AGENTIC_ITERATIONS = 10: model called 10 times
        expect(mockGenerate).toHaveBeenCalledTimes(10);
        // The loop should return whatever text accumulated (empty in this case)
        expect(result.text).toBe('');
        // 10 tool calls recorded
        expect(result.toolCalls).toHaveLength(10);
    });

    it('skips tool execution when no toolContext is provided', async () => {
        mockStreamResponse(
            () => makeChunks(functionCallChunk('mentionVideo', { videoId: 'v1' })),
        );

        const result = await streamChat(makeOpts({ toolContext: undefined }));

        // executeTool should not be called
        expect(mockExecuteTool).not.toHaveBeenCalled();
        // Should break out of the loop without further iterations
        expect(result.text).toBe('');
    });

    it('handles multiple function calls in a single chunk batch', async () => {
        const onToolCall = vi.fn();

        // Model returns two function calls in the same iteration (separate chunks)
        mockStreamResponse(
            () => makeChunks(
                functionCallChunk('mentionVideo', { videoId: 'v1' }),
                functionCallChunk('mentionVideo', { videoId: 'v2' }),
            ),
            () => makeChunks(textChunk('Both referenced')),
        );

        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { success: true },
        });
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { success: true },
            blockedCount: undefined,
        });

        const result = await streamChat(makeOpts({ onToolCall, toolContext }));

        // Both tool calls emitted with sequential indices
        expect(onToolCall).toHaveBeenCalledTimes(2);
        expect(onToolCall).toHaveBeenNthCalledWith(1, 'mentionVideo', { videoId: 'v1' }, 0);
        expect(onToolCall).toHaveBeenNthCalledWith(2, 'mentionVideo', { videoId: 'v2' }, 1);
        expect(result.text).toBe('Both referenced');
    });

    it('strips _systemNote from tool result before passing to onToolResult', async () => {
        const onToolResult = vi.fn();

        mockStreamResponse(
            () => makeChunks(functionCallChunk('mentionVideo', { videoId: 'v1' })),
            () => makeChunks(textChunk('Done')),
        );
        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { success: true },
        });
        // enhanceWithThumbnails returns a response with _systemNote
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { success: true, _systemNote: 'internal hint', _failedThumbnails: ['x'] },
            blockedCount: undefined,
        });

        await streamChat(makeOpts({ onToolResult, toolContext }));

        // _systemNote and _failedThumbnails should be stripped from the UI response
        expect(onToolResult).toHaveBeenCalledWith('mentionVideo', { success: true }, 0);
    });
});

// ===========================================================================
// Suite C: Thinking — thought extraction and leak protection
// ===========================================================================

describe('streamChat — thinking (thought leak protection)', () => {
    it('calls onThought when a chunk has a thought-flagged part', async () => {
        const onThought = vi.fn();

        mockStreamResponse(
            () => makeChunks(
                thoughtChunk('Let me think about this...'),
                textChunk('Here is my answer'),
            ),
        );

        await streamChat(makeOpts({ onThought }));

        expect(onThought).toHaveBeenCalledTimes(1);
        expect(onThought).toHaveBeenCalledWith('Let me think about this...');
    });

    it('does NOT include thought text in the final response text', async () => {
        const onThought = vi.fn();

        mockStreamResponse(
            () => makeChunks(
                thoughtChunk('Internal reasoning here'),
                textChunk('Visible response'),
            ),
        );

        const result = await streamChat(makeOpts({ onThought }));

        // Thought text must not leak into the response
        expect(result.text).toBe('Visible response');
        expect(result.text).not.toContain('Internal reasoning');
    });

    it('includes normal text parts (no thought flag) in the response', async () => {
        mockStreamResponse(
            () => makeChunks(
                textChunk('First part'),
                textChunk(' second part'),
            ),
        );

        const result = await streamChat(makeOpts());

        expect(result.text).toBe('First part second part');
    });

    it('correctly separates thoughts and text when mixed in a single chunk', async () => {
        const onThought = vi.fn();

        // Single chunk with both thought and text parts
        mockStreamResponse(
            () => makeChunks({
                candidates: [{
                    content: {
                        parts: [
                            { thought: true, text: 'Hmm, I should analyze this' },
                            { text: 'Based on my analysis...' },
                        ],
                    },
                }],
            }),
        );

        const result = await streamChat(makeOpts({ onThought }));

        // Thought goes to callback
        expect(onThought).toHaveBeenCalledWith('Hmm, I should analyze this');
        // Text goes to response
        expect(result.text).toBe('Based on my analysis...');
        // No leak
        expect(result.text).not.toContain('Hmm');
    });

    it('handles multiple thought chunks across the stream', async () => {
        const onThought = vi.fn();

        mockStreamResponse(
            () => makeChunks(
                thoughtChunk('Step 1: Understand the question'),
                thoughtChunk('Step 2: Formulate answer'),
                textChunk('Here is the answer'),
            ),
        );

        const result = await streamChat(makeOpts({ onThought }));

        expect(onThought).toHaveBeenCalledTimes(2);
        expect(onThought).toHaveBeenNthCalledWith(1, 'Step 1: Understand the question');
        expect(onThought).toHaveBeenNthCalledWith(2, 'Step 2: Formulate answer');
        expect(result.text).toBe('Here is the answer');
    });

    it('does not crash when onThought is not provided', async () => {
        mockStreamResponse(
            () => makeChunks(
                thoughtChunk('Some thought'),
                textChunk('Response'),
            ),
        );

        // No onThought callback — should not throw
        const result = await streamChat(makeOpts({ onThought: undefined }));

        expect(result.text).toBe('Response');
    });

    it('handles thought parts with functionCall in the same iteration', async () => {
        const onThought = vi.fn();
        const onToolCall = vi.fn();
        const toolContext = { userId: 'u1', channelId: 'c1' };

        mockStreamResponse(
            // Iteration 1: thought + function call
            () => makeChunks(
                thoughtChunk('I need to look up this video'),
                functionCallChunk('mentionVideo', { videoId: 'v1' }),
            ),
            // Iteration 2: thought + text response
            () => makeChunks(
                thoughtChunk('Now I can respond'),
                textChunk('Here is the video'),
            ),
        );
        mockExecuteTool.mockResolvedValue({
            name: 'mentionVideo',
            response: { success: true },
        });
        mockEnhance.mockReturnValue({
            imageUrls: [],
            cleanedResponse: { success: true },
            blockedCount: undefined,
        });

        const result = await streamChat(
            makeOpts({ onThought, onToolCall, toolContext }),
        );

        // Thoughts from both iterations
        expect(onThought).toHaveBeenCalledTimes(2);
        expect(onThought).toHaveBeenNthCalledWith(1, 'I need to look up this video');
        expect(onThought).toHaveBeenNthCalledWith(2, 'Now I can respond');

        // Tool call still fired
        expect(onToolCall).toHaveBeenCalledTimes(1);

        // Final text has no thought leaks
        expect(result.text).toBe('Here is the video');
    });
});

// ===========================================================================
// Suite D: Abort behavior — token usage on stream interruption
// ===========================================================================

describe('streamChat — abort behavior', () => {
    it('throws on abort — usageMetadata captured per-chunk but lost to caller (baseline for Task D)', async () => {
        // Create a generator that yields a chunk with usage, then throws
        async function* abortingStream() {
            yield textChunk('partial text', {
                promptTokenCount: 100,
                candidatesTokenCount: 50,
                totalTokenCount: 150,
            });
            throw new DOMException('The operation was aborted', 'AbortError');
        }

        const mockGen = vi.fn().mockImplementation(async () => abortingStream());
        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGen },
        } as never);

        await expect(streamChat(makeOpts())).rejects.toThrow();
        // tokenUsage IS captured from the chunk internally (usageMetadata on each chunk),
        // but the function throws before returning it.
        // Task D will fix this: catch abort and return partial result with tokenUsage.
    });
});

// ===========================================================================
// Suite E: Normalized Usage (Token Transparency — Wave 2)
// ===========================================================================

describe('streamChat — normalizedUsage', () => {
    it('returns normalizedUsage for single iteration with correct Gemini mapping', async () => {
        mockStreamResponse(
            () => makeChunks(
                textChunk('Hello', {
                    promptTokenCount: 10_000,
                    candidatesTokenCount: 2_000,
                    totalTokenCount: 12_000,
                    cachedContentTokenCount: 3_000,
                }),
            ),
        );

        const result = await streamChat(makeOpts());

        expect(result.normalizedUsage).toBeDefined();
        const nu = result.normalizedUsage!;

        // Gemini: promptTokenCount INCLUDES cached → inputTokens = promptTokenCount
        expect(nu.contextWindow.inputTokens).toBe(10_000);
        // fresh = promptTokenCount - cachedContentTokenCount
        expect(nu.billing.input.fresh).toBe(10_000 - 3_000);
        expect(nu.billing.input.cached).toBe(3_000);
        expect(nu.billing.input.cacheWrite).toBe(0); // Gemini has no cache write
        // output = candidatesTokenCount + thoughtsTokenCount (0 here)
        expect(nu.billing.output.total).toBe(2_000);
        expect(nu.billing.output.thinking).toBe(0);
        expect(nu.billing.iterations).toBe(1);
        expect(nu.iterationDetails).toBeUndefined(); // single iteration
        expect(nu.provider).toBe('google');
        expect(nu.model).toBe('test-model');
        expect(nu.contextWindow.limit).toBe(1_000_000);
        // percent is float, not rounded
        const expectedPercent = (10_000 / 1_000_000) * 100;
        expect(nu.contextWindow.percent).toBeCloseTo(expectedPercent, 6);
    });

    it('contextWindow uses last iteration, billing sums all', async () => {
        const toolContext = { userId: 'u1', channelId: 'c1' };

        // Iteration 1: tool call + usage; Iteration 2: text + usage
        mockStreamResponse(
            () => makeChunks(
                functionCallChunk('mentionVideo', { videoId: 'v1' }),
                textChunk('', {
                    promptTokenCount: 5_000,
                    candidatesTokenCount: 500,
                    totalTokenCount: 5_500,
                }),
            ),
            () => makeChunks(
                textChunk('Result', {
                    promptTokenCount: 8_000,
                    candidatesTokenCount: 1_000,
                    totalTokenCount: 9_000,
                    cachedContentTokenCount: 4_000,
                }),
            ),
        );

        mockExecuteTool.mockResolvedValueOnce({
            name: 'mentionVideo',
            response: { success: true },
        });
        mockEnhance.mockReturnValueOnce({
            imageUrls: [],
            cleanedResponse: { success: true },
            blockedCount: undefined,
        });

        const result = await streamChat(makeOpts({ toolContext }));

        expect(result.normalizedUsage).toBeDefined();
        const nu = result.normalizedUsage!;

        // contextWindow from LAST iteration (iteration 2)
        expect(nu.contextWindow.inputTokens).toBe(8_000);
        expect(nu.contextWindow.outputTokens).toBe(1_000); // no thinking
        // billing sums both iterations
        expect(nu.billing.iterations).toBe(2);
        expect(nu.billing.input.total).toBe(5_000 + 8_000);
        expect(nu.billing.output.total).toBe(500 + 1_000);
        expect(nu.billing.input.cached).toBe(0 + 4_000);
        expect(nu.iterationDetails).toHaveLength(2);
    });

    it('reads thoughtsTokenCount from usageMetadata (exact, not approximate)', async () => {
        // Gemini reports thinking tokens separately and exactly
        mockStreamResponse(
            () => makeChunks(
                thoughtChunk('Let me reason about this...'),
                textChunk('Answer', {
                    promptTokenCount: 5_000,
                    candidatesTokenCount: 800,
                    totalTokenCount: 6_000,
                    thoughtsTokenCount: 150,
                }),
            ),
        );

        const result = await streamChat(makeOpts());

        expect(result.normalizedUsage).toBeDefined();
        const nu = result.normalizedUsage!;

        // Gemini: exact thoughtsTokenCount from usageMetadata
        expect(nu.billing.output.thinking).toBe(150);
        expect(nu.contextWindow.thinkingTokens).toBe(150);
        // output.total = candidatesTokenCount + thoughtsTokenCount
        expect(nu.billing.output.total).toBe(800 + 150);
        // thinking cost is subset of output cost
        expect(nu.billing.cost.thinkingSubset).toBeGreaterThan(0);
        expect(nu.billing.cost.thinkingSubset).toBeLessThan(nu.billing.cost.output);
    });
});

// ===========================================================================
// Suite D: Abort handling — partial usage on stopped messages
// ===========================================================================

describe('Gemini streamChat — abort handling (stopped messages)', () => {
    it('returns partial=true and usage from last chunk on caller abort', async () => {
        const abortController = new AbortController();

        // Build an async iterable that yields chunks, then aborts and throws
        async function* abortingChunks() {
            // First chunk with text + usage
            yield textChunk('Hello ', {
                promptTokenCount: 800,
                candidatesTokenCount: 10,
                totalTokenCount: 810,
            });
            // Second chunk updates usage
            yield textChunk('partial', {
                promptTokenCount: 800,
                candidatesTokenCount: 20,
                totalTokenCount: 820,
            });
            // Simulate abort — signal fires, then iteration throws
            abortController.abort();
            throw new DOMException('The operation was aborted', 'AbortError');
        }

        const mockGenerateContentStream = vi.fn().mockImplementationOnce(
            async () => abortingChunks(),
        );
        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerateContentStream },
        } as never);

        const result = await streamChat(makeOpts({ signal: abortController.signal }));

        // Should be marked as partial
        expect(result.partial).toBe(true);

        // Token usage from last received chunk
        expect(result.tokenUsage).toBeDefined();
        expect(result.tokenUsage!.promptTokens).toBe(800);
        expect(result.tokenUsage!.completionTokens).toBe(20);

        // Text accumulated before abort
        expect(result.text).toBe('Hello partial');
    });

    it('sets normalizedUsage.partial=true on abort', async () => {
        const abortController = new AbortController();

        async function* abortingChunks() {
            yield textChunk('Some text', {
                promptTokenCount: 1000,
                candidatesTokenCount: 50,
                totalTokenCount: 1050,
            });
            abortController.abort();
            throw new DOMException('The operation was aborted', 'AbortError');
        }

        const mockGenerateContentStream = vi.fn().mockImplementationOnce(
            async () => abortingChunks(),
        );
        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerateContentStream },
        } as never);

        const result = await streamChat(makeOpts({ signal: abortController.signal }));

        expect(result.partial).toBe(true);
        expect(result.normalizedUsage).toBeDefined();
        expect(result.normalizedUsage!.partial).toBe(true);
    });

    it('rethrows non-abort errors even with usage present', async () => {
        const mockGenerateContentStream = vi.fn().mockImplementationOnce(async () => {
            async function* failingChunks() {
                yield textChunk('text', {
                    promptTokenCount: 100,
                    candidatesTokenCount: 5,
                    totalTokenCount: 105,
                });
                throw new Error('Network failure');
            }
            return failingChunks();
        });
        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerateContentStream },
        } as never);

        await expect(streamChat(makeOpts())).rejects.toThrow('Network failure');
    });
});

// ===========================================================================
// Suite E: buildHistory — tool call reconstruction from history
// ===========================================================================

describe('streamChat — buildHistory tool reconstruction', () => {
    it('history message with toolCalls → API receives functionCall + functionResponse + text', async () => {
        const mockGenerateContentStream = mockStreamResponse(
            () => makeChunks(textChunk('Follow-up', {
                promptTokenCount: 500, candidatesTokenCount: 20, totalTokenCount: 520,
            })),
        );

        await streamChat(makeOpts({
            history: [
                { id: 'u1', role: 'user', text: 'Show trending' },
                {
                    id: 'm1',
                    role: 'model',
                    text: 'Here are the results',
                    toolCalls: [
                        {
                            name: 'browseTrendVideos',
                            args: { channelId: 'ch1', limit: 5 },
                            result: { videos: [{ id: 'v1', title: 'Top Video' }] },
                        },
                    ],
                },
            ],
            text: 'Show thumbnails',
        }));

        // Extract contents sent to Gemini API
        const apiCall = mockGenerateContentStream.mock.calls[0][0];
        const contents = apiCall.contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;

        // contents[0]: user 'Show trending'
        expect(contents[0].role).toBe('user');

        // contents[1]: model with functionCall part (reconstructed)
        expect(contents[1].role).toBe('model');
        expect(contents[1].parts[0]).toHaveProperty('functionCall');
        const fc = contents[1].parts[0].functionCall as Record<string, unknown>;
        expect(fc.name).toBe('browseTrendVideos');
        expect(fc.args).toEqual({ channelId: 'ch1', limit: 5 });

        // contents[2]: user with functionResponse part
        expect(contents[2].role).toBe('user');
        expect(contents[2].parts[0]).toHaveProperty('functionResponse');
        const fr = contents[2].parts[0].functionResponse as Record<string, unknown>;
        expect(fr.name).toBe('browseTrendVideos');
        expect(fr.response).toEqual({ videos: [{ id: 'v1', title: 'Top Video' }] });

        // contents[3]: model with text part
        expect(contents[3].role).toBe('model');
        expect(contents[3].parts[0]).toEqual({ text: 'Here are the results' });

        // contents[4]: current user message
        expect(contents[4].role).toBe('user');
    });

    it('functionCall.name matches functionResponse.name', async () => {
        const mockApi = mockStreamResponse(
            () => makeChunks(textChunk('Done', {
                promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110,
            })),
        );

        await streamChat(makeOpts({
            history: [
                { id: 'u1', role: 'user', text: 'query' },
                {
                    id: 'm1',
                    role: 'model',
                    text: 'result',
                    toolCalls: [
                        { name: 'toolA', args: { x: 1 }, result: { a: 'yes' } },
                        { name: 'toolB', args: { y: 2 }, result: { b: 'no' } },
                    ],
                },
            ],
            text: 'next',
        }));

        const apiCall = mockApi.mock.calls[0][0];
        const contents = apiCall.contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;

        const modelParts = contents[1].parts;
        expect(modelParts).toHaveLength(2);
        const names = modelParts.map((p: Record<string, unknown>) =>
            (p.functionCall as Record<string, unknown>)?.name,
        );
        expect(names).toEqual(['toolA', 'toolB']);

        const userParts = contents[2].parts;
        expect(userParts).toHaveLength(2);
        const responseNames = userParts.map((p: Record<string, unknown>) =>
            (p.functionResponse as Record<string, unknown>)?.name,
        );
        expect(responseNames).toEqual(['toolA', 'toolB']);
    });

    it('model/user/model role alternation correct after reconstruction', async () => {
        const mockApi = mockStreamResponse(
            () => makeChunks(textChunk('Reply', {
                promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110,
            })),
        );

        await streamChat(makeOpts({
            history: [
                { id: 'u1', role: 'user', text: 'first' },
                {
                    id: 'm1',
                    role: 'model',
                    text: 'tool answer',
                    toolCalls: [{ name: 't1', args: {}, result: { ok: true } }],
                },
                { id: 'u2', role: 'user', text: 'second' },
                { id: 'm2', role: 'model', text: 'plain answer' },
            ],
            text: 'third',
        }));

        const apiCall = mockApi.mock.calls[0][0];
        const contents = apiCall.contents as Array<{ role: string }>;
        const roles = contents.map(c => c.role);

        // user, model(fc), user(fr), model(text), user, model, user(current)
        expect(roles).toEqual([
            'user',   // u1
            'model',  // m1 → functionCall
            'user',   // m1 → functionResponse
            'model',  // m1 → text
            'user',   // u2
            'model',  // m2
            'user',   // current
        ]);
    });

    it('history message without toolCalls → standard single Content (regression)', async () => {
        const mockApi = mockStreamResponse(
            () => makeChunks(textChunk('Reply', {
                promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110,
            })),
        );

        await streamChat(makeOpts({
            history: [
                { id: 'u1', role: 'user', text: 'hello' },
                { id: 'm1', role: 'model', text: 'hi there' },
            ],
            text: 'follow up',
        }));

        const apiCall = mockApi.mock.calls[0][0];
        const contents = apiCall.contents as Array<{ role: string }>;

        // 3 content entries: user, model, user(current) — no expansion
        expect(contents).toHaveLength(3);
    });

    it('toolCalls with undefined result → fallback to text only', async () => {
        const mockApi = mockStreamResponse(
            () => makeChunks(textChunk('Reply', {
                promptTokenCount: 100, candidatesTokenCount: 10, totalTokenCount: 110,
            })),
        );

        await streamChat(makeOpts({
            history: [
                { id: 'u1', role: 'user', text: 'query' },
                {
                    id: 'm1',
                    role: 'model',
                    text: 'Partial before stop',
                    toolCalls: [{ name: 'stoppedTool', args: { x: 1 } }], // no result
                },
            ],
            text: 'continue',
        }));

        const apiCall = mockApi.mock.calls[0][0];
        const contents = apiCall.contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;

        // Fallback: 3 entries (user, model-text-only, user-current)
        expect(contents).toHaveLength(3);
        // Model message should have text part only, no functionCall
        const modelParts = contents[1].parts;
        expect(modelParts.every(p => !p.functionCall)).toBe(true);
        expect(modelParts.some(p => p.text)).toBe(true);
    });
});

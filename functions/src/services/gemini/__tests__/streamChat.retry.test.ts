// =============================================================================
// streamChat — retry logic unit tests
//
// Tests the per-iteration retry loop inside streamChat:
//   - GeminiTimeoutError triggers automatic retry (up to MAX_STREAM_RETRIES = 2)
//   - User cancel (signal.abort) skips retry and propagates immediately
//   - Exhausting all retries throws GeminiTimeoutError
//
// All external dependencies are mocked — no live Gemini API key is needed.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamChat, GeminiTimeoutError } from '../streamChat.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal async generator that yields a single text chunk. */
async function* makeChunkIterator(text: string) {
    yield {
        text,
        candidates: [{ content: { parts: [{ text }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    };
}

/** Build an async generator that immediately throws the given error. */
async function* makeErrorIterator(err: Error) {
    throw err;
    // Satisfy generator return type — never reached
    yield undefined as never;
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock getClient — the gateway to the Gemini SDK
vi.mock('../client.js', () => ({
    getClient: vi.fn(),
    isGeminiUriValid: vi.fn(() => false),
}));

// Mock thumbnails so we skip real file uploads
vi.mock('../thumbnails.js', () => ({
    fetchThumbnailParts: vi.fn().mockResolvedValue({ parts: [], updatedCache: {} }),
    buildUserParts: vi.fn().mockReturnValue([{ text: 'hello' }]),
}));

// Mock thumbnailMiddleware
vi.mock('../thumbnailMiddleware.js', () => ({
    enhanceWithThumbnails: vi.fn().mockReturnValue({
        imageUrls: [],
        cleanedResponse: {},
        blockedCount: undefined,
    }),
}));

// Mock memory formatContextLabel
vi.mock('../../memory.js', () => ({
    formatContextLabel: vi.fn().mockReturnValue('[context]'),
}));

// Mock tools — empty declarations means no tool-calling path
vi.mock('../../tools/index.js', () => ({
    TOOL_DECLARATIONS: [],
}));

// executeTool is now imported by executeToolBatch from tools/executor.js
vi.mock('../../tools/executor.js', () => ({
    executeTool: vi.fn(),
}));

// Mock model registry — return a minimal config so thinkingConfig branch works
vi.mock('../../../config/models.js', () => ({
    MODEL_REGISTRY: [
        {
            id: 'test-model',
            thinkingMode: 'budget',
            thinkingOptions: [{ id: 'default', value: 1024 }],
            thinkingDefault: 'default',
        },
    ],
}));

// Mock fileUpload (used inside buildHistory for re-uploads)
vi.mock('../fileUpload.js', () => ({
    reuploadFromStorage: vi.fn(),
    uploadToGemini: vi.fn(),
    uploadFromStoragePath: vi.fn(),
}));

// Mock @google/genai — needed by getPartFactories() lazy import
vi.mock('@google/genai', () => ({
    GoogleGenAI: vi.fn(),
    createPartFromFunctionCall: vi.fn(),
    createPartFromFunctionResponse: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import mocked modules for assertion access
// ---------------------------------------------------------------------------

import { getClient } from '../client.js';
const mockGetClient = vi.mocked(getClient);

// ---------------------------------------------------------------------------
// Shared opts factory
// ---------------------------------------------------------------------------

function makeOpts(overrides: Partial<Parameters<typeof streamChat>[0]> = {}): Parameters<typeof streamChat>[0] {
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
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('streamChat — retry logic', () => {
    it('retries on GeminiTimeoutError and returns text on second attempt', async () => {
        const onRetry = vi.fn();

        // First call throws a timeout; second call succeeds
        const mockGenerateContentStream = vi.fn()
            .mockImplementationOnce(async () => makeErrorIterator(new GeminiTimeoutError()))
            .mockImplementationOnce(async () => makeChunkIterator('hello world'));

        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerateContentStream },
        } as never);

        const result = await streamChat(makeOpts({ onRetry }));

        // onRetry called exactly once with attempt=1
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(1);

        // Text came from the successful second attempt
        expect(result.text).toBe('hello world');
    }, 10_000);

    it('retries when SDK throws DOMException on abort (real-world timeout behavior)', async () => {
        // In production, @google/genai does NOT throw our GeminiTimeoutError.
        // It throws DOMException("The operation was aborted") — our error is only
        // in iterationAbort.signal.reason. This test verifies the signal.reason path.
        vi.useFakeTimers();
        const onRetry = vi.fn();

        const mockGenerateContentStream = vi.fn()
            // First call: simulate SDK behavior — hang until abort, then throw DOMException
            .mockImplementationOnce(async ({ config }: { config: { abortSignal: AbortSignal } }) => {
                async function* hangUntilAbort() {
                    await new Promise<void>((resolve) => {
                        config.abortSignal.addEventListener('abort', () => resolve(), { once: true });
                    });
                    throw new DOMException('The operation was aborted', 'AbortError');
                    yield undefined as never;
                }
                return hangUntilAbort();
            })
            // Second call succeeds
            .mockImplementationOnce(async () => makeChunkIterator('recovered'));

        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerateContentStream },
        } as never);

        // Start streamChat but DON'T await yet — we need to advance timers first
        const resultPromise = streamChat(makeOpts({ onRetry }));

        // Advance past the 90s inactivity timeout + 2s retry delay
        await vi.advanceTimersByTimeAsync(93_000);

        const result = await resultPromise;

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(1);
        expect(result.text).toBe('recovered');

        vi.useRealTimers();
    });

    it('does NOT retry when the caller aborts (user cancel)', async () => {
        const onRetry = vi.fn();
        const controller = new AbortController();

        // generateContentStream throws a timeout, but caller has already aborted
        const mockGenerateContentStream = vi.fn().mockImplementation(async () => {
            controller.abort();
            return makeErrorIterator(new GeminiTimeoutError());
        });

        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerateContentStream },
        } as never);

        await expect(
            streamChat(makeOpts({ onRetry, signal: controller.signal }))
        ).rejects.toBeInstanceOf(GeminiTimeoutError);

        // No retry should have been attempted
        expect(onRetry).not.toHaveBeenCalled();
    });

    it('throws GeminiTimeoutError after exhausting all retries (MAX_STREAM_RETRIES = 2)', async () => {
        const onRetry = vi.fn();

        // Always times out on every attempt
        const mockGenerateContentStream = vi.fn().mockImplementation(
            async () => makeErrorIterator(new GeminiTimeoutError())
        );

        mockGetClient.mockResolvedValue({
            models: { generateContentStream: mockGenerateContentStream },
        } as never);

        await expect(
            streamChat(makeOpts({ onRetry }))
        ).rejects.toBeInstanceOf(GeminiTimeoutError);

        // onRetry called for each retry attempt (1 and 2), not for the final throw
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenNthCalledWith(1, 1);
        expect(onRetry).toHaveBeenNthCalledWith(2, 2);

        // Total calls: 1 initial + 2 retries = 3
        expect(mockGenerateContentStream).toHaveBeenCalledTimes(3);
    }, 15_000);
});


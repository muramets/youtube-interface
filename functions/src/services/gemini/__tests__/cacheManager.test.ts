// =============================================================================
// cacheManager — unit tests
//
// Tests cover all lifecycle paths: resolve (hit/miss/invalidation),
// create (above/below threshold, with/without existing cache),
// invalidate (success/error), and hashPrompt determinism.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock firebase-functions/v2 logger ---
vi.mock('firebase-functions/v2', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// --- Mock getClient ---
const mockCachesCreate = vi.fn();
const mockCachesDelete = vi.fn();
const mockGetClient = vi.fn().mockResolvedValue({
    caches: {
        create: mockCachesCreate,
        delete: mockCachesDelete,
    },
});

vi.mock('../client.js', () => ({
    getClient: (...args: unknown[]) => mockGetClient(...args),
}));

import {
    resolveCache,
    createCache,
    invalidateCache,
    hashPrompt,
    CACHE_TTL,
    type CacheState,
    type CacheableContent,
} from '../cacheManager.js';

const API_KEY = 'test-api-key';
const MODEL = 'gemini-2.5-pro';
const SYSTEM_PROMPT = 'You are a helpful assistant for YouTube analytics.';

function makeCacheState(overrides?: Partial<CacheState>): CacheState {
    return {
        cacheId: 'cachedContents/abc123',
        expiry: Date.now() + 5 * 60 * 1000, // 5 min from now
        model: MODEL,
        promptHash: hashPrompt(SYSTEM_PROMPT),
        historyLen: 4,
        ...overrides,
    };
}

function makeCacheableContent(overrides?: Partial<CacheableContent>): CacheableContent {
    // Generate enough content to exceed MIN_CACHED_TOKENS_ESTIMATE (4096 tokens ≈ 16K chars)
    const longHistory = Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        parts: [{ text: `Message ${i}: ${'x'.repeat(2000)}` }],
    }));
    return {
        systemPrompt: SYSTEM_PROMPT,
        tools: [{ functionDeclarations: [{ name: 'testTool', description: 'A test tool' }] }],
        history: longHistory,
        displayName: 'conv:test1234_msg10',
        ...overrides,
    };
}

describe('hashPrompt', () => {
    it('is deterministic — same input produces same hash', () => {
        const hash1 = hashPrompt('Hello world');
        const hash2 = hashPrompt('Hello world');
        expect(hash1).toBe(hash2);
    });

    it('different inputs produce different hashes', () => {
        const hash1 = hashPrompt('Prompt A');
        const hash2 = hashPrompt('Prompt B');
        expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', () => {
        const hash = hashPrompt('');
        expect(hash).toBe('0::');
    });

    it('handles long strings (uses first/last 64 chars)', () => {
        const long = 'a'.repeat(200);
        const hash = hashPrompt(long);
        expect(hash).toBe(`200:${'a'.repeat(64)}:${'a'.repeat(64)}`);
    });
});

describe('resolveCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns cacheId when all checks pass (historyLen matches expected +2)', async () => {
        const state = makeCacheState({ historyLen: 4 });
        const result = await resolveCache(API_KEY, state, MODEL, SYSTEM_PROMPT, 6);
        expect(result).toBe('cachedContents/abc123');
    });

    it('returns null on model mismatch (no delete — Gemini 403 on cross-model delete)', async () => {
        const state = makeCacheState();
        const result = await resolveCache(API_KEY, state, 'gemini-2.5-flash', SYSTEM_PROMPT, 6);
        expect(result).toBeNull();
        expect(mockCachesDelete).not.toHaveBeenCalled();
    });

    it('returns null on system prompt change (no delete — 403)', async () => {
        const state = makeCacheState();
        const result = await resolveCache(API_KEY, state, MODEL, 'A completely different prompt', 6);
        expect(result).toBeNull();
        expect(mockCachesDelete).not.toHaveBeenCalled();
    });

    it('returns null when history grew unexpectedly (cross-provider gap, no delete — 403)', async () => {
        const state = makeCacheState({ historyLen: 4 });
        // History grew by 4 (not 2) — means messages were added outside Gemini
        const result = await resolveCache(API_KEY, state, MODEL, SYSTEM_PROMPT, 8);
        expect(result).toBeNull();
        expect(mockCachesDelete).not.toHaveBeenCalled();
    });

    it('returns null when cache expired (beyond 60s buffer)', async () => {
        const state = makeCacheState({ expiry: Date.now() + 30_000 });
        const result = await resolveCache(API_KEY, state, MODEL, SYSTEM_PROMPT, 6);
        expect(result).toBeNull();
        expect(mockCachesDelete).not.toHaveBeenCalled();
    });

    it('returns null when cache already expired', async () => {
        const state = makeCacheState({ expiry: Date.now() - 1000 });
        const result = await resolveCache(API_KEY, state, MODEL, SYSTEM_PROMPT, 6);
        expect(result).toBeNull();
    });

    it('passes when systemPrompt is undefined (skips hash check)', async () => {
        const state = makeCacheState();
        const result = await resolveCache(API_KEY, state, MODEL, undefined, 6);
        expect(result).toBe('cachedContents/abc123');
    });

    it('passes when currentHistoryLen is undefined (skips history check)', async () => {
        const state = makeCacheState();
        const result = await resolveCache(API_KEY, state, MODEL, SYSTEM_PROMPT, undefined);
        expect(result).toBe('cachedContents/abc123');
    });

    it('passes when cacheState.historyLen is 0 (first cache — no history at creation)', async () => {
        const state = makeCacheState({ historyLen: 0 });
        const result = await resolveCache(API_KEY, state, MODEL, SYSTEM_PROMPT, 2);
        expect(result).toBe('cachedContents/abc123');
        expect(mockCachesDelete).not.toHaveBeenCalled();
    });
});

describe('createCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates cache and returns CacheState with correct fields', async () => {
        mockCachesCreate.mockResolvedValue({
            name: 'cachedContents/new123',
            expireTime: '2026-03-19T12:30:00Z',
        });

        const content = makeCacheableContent();
        const result = await createCache(API_KEY, MODEL, content);

        expect(result).not.toBeNull();
        expect(result!.cacheId).toBe('cachedContents/new123');
        expect(result!.model).toBe(MODEL);
        expect(result!.promptHash).toBe(hashPrompt(SYSTEM_PROMPT));
        expect(result!.expiry).toBe(new Date('2026-03-19T12:30:00Z').getTime());
        expect(mockCachesCreate).toHaveBeenCalledWith({
            model: MODEL,
            config: expect.objectContaining({
                ttl: CACHE_TTL,
                systemInstruction: SYSTEM_PROMPT,
            }),
        });
    });

    it('returns null when content below threshold (tiny prompt, no tools, no history)', async () => {
        const content = makeCacheableContent({
            systemPrompt: 'Hi',
            tools: [],
            history: [],
        });
        const result = await createCache(API_KEY, MODEL, content);
        expect(result).toBeNull();
        expect(mockCachesCreate).not.toHaveBeenCalled();
    });

    it('deletes old cache when existingCacheId provided', async () => {
        mockCachesCreate.mockResolvedValue({
            name: 'cachedContents/new456',
            expireTime: '2026-03-19T13:00:00Z',
        });

        const content = makeCacheableContent();
        await createCache(API_KEY, MODEL, content, 'cachedContents/old789');

        // Old cache deleted (fire-and-forget)
        await vi.waitFor(() => expect(mockCachesDelete).toHaveBeenCalledWith({ name: 'cachedContents/old789' }));
    });

    it('returns null on API error without throwing', async () => {
        mockCachesCreate.mockRejectedValue(new Error('API quota exceeded'));

        const content = makeCacheableContent();
        const result = await createCache(API_KEY, MODEL, content);
        expect(result).toBeNull();
    });

    it('parses expireTime with Z suffix correctly', async () => {
        mockCachesCreate.mockResolvedValue({
            name: 'cachedContents/tz1',
            expireTime: '2026-03-19T12:30:00Z',
        });

        const result = await createCache(API_KEY, MODEL, makeCacheableContent());
        expect(result!.expiry).toBe(new Date('2026-03-19T12:30:00Z').getTime());
    });

    it('parses expireTime without Z suffix (defensive)', async () => {
        mockCachesCreate.mockResolvedValue({
            name: 'cachedContents/tz2',
            expireTime: '2026-03-19T12:30:00',
        });

        const result = await createCache(API_KEY, MODEL, makeCacheableContent());
        // Should treat as UTC
        expect(result!.expiry).toBe(new Date('2026-03-19T12:30:00Z').getTime());
    });

    it('creates cache with history containing functionCall/functionResponse parts', async () => {
        mockCachesCreate.mockResolvedValue({
            name: 'cachedContents/fc1',
            expireTime: '2026-03-19T14:00:00Z',
        });

        // Use default makeCacheableContent (above threshold) + add tool call entries
        const baseContent = makeCacheableContent();
        const content: CacheableContent = {
            ...baseContent,
            history: [
                ...baseContent.history,
                { role: 'model', parts: [{ functionCall: { name: 'getChannelOverview', args: {} } }] },
                { role: 'user', parts: [{ functionResponse: { name: 'getChannelOverview', response: { stats: {} } } }] },
                { role: 'model', parts: [{ text: 'Here is your analysis...' }] },
            ],
        };

        const result = await createCache(API_KEY, MODEL, content);
        // Should NOT throw — functionCall/functionResponse are valid cache content
        expect(result).not.toBeNull();
    });

    it('includes correct promptHash from hashPrompt(systemPrompt)', async () => {
        mockCachesCreate.mockResolvedValue({
            name: 'cachedContents/ph1',
            expireTime: '2026-03-19T14:00:00Z',
        });

        const customPrompt = 'Custom system prompt for testing hash';
        const content = makeCacheableContent({ systemPrompt: customPrompt });
        const result = await createCache(API_KEY, MODEL, content);

        expect(result!.promptHash).toBe(hashPrompt(customPrompt));
    });
});

describe('invalidateCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls delete on provided cacheId', async () => {
        invalidateCache(API_KEY, 'cachedContents/del1');
        await vi.waitFor(() => expect(mockCachesDelete).toHaveBeenCalledWith({ name: 'cachedContents/del1' }));
    });

    it('does NOT throw on delete error — logs warning', async () => {
        mockCachesDelete.mockRejectedValue(new Error('NOT_FOUND'));
        // Should not throw
        invalidateCache(API_KEY, 'cachedContents/gone');
        // Wait for async to complete
        await vi.waitFor(() => expect(mockCachesDelete).toHaveBeenCalled());
    });
});

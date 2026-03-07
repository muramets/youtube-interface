// =============================================================================
// memory.ts — characterization tests
//
// Lock down existing behavior of formatContextLabel() and buildMemory()
// before refactoring. Pure functions tested directly; Gemini API calls mocked.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HistoryMessage } from '../ai/types.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock getClient — prevents real Gemini API calls from generateSummary
vi.mock('../gemini/index.js', () => ({
    getClient: vi.fn(),
}));

// Mock MODEL_CONTEXT_LIMITS + MODEL_HISTORY_RATIOS — deterministic budget for tests
vi.mock('../../config/models.js', () => ({
    MODEL_CONTEXT_LIMITS: {
        'test-model': 1_000,         // tiny: 1000 tokens total → 600 budget
        'test-model-large': 100_000, // large enough that short convos fit
        'claude-opus-4-6': 200_000,  // Claude context for Task B tests
        'gemini-2.5-pro': 1_000_000, // Gemini context for Task B tests
    } as Record<string, number>,
    MODEL_HISTORY_RATIOS: {
        'test-model': 0.6,
        'test-model-large': 0.6,
        'claude-opus-4-6': 0.75,
        'gemini-2.5-pro': 0.85,
    } as Record<string, number>,
    HISTORY_BUDGET_RATIO: 0.6,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { formatContextLabel, buildMemory } from '../memory.js';
import { getClient } from '../gemini/index.js';
const mockGetClient = vi.mocked(getClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(
    id: string,
    role: 'user' | 'model',
    text: string,
    extras?: Partial<HistoryMessage>,
): HistoryMessage {
    return { id, role, text, ...extras };
}

/** Create N alternating user/model messages of given char length. */
function makeConversation(count: number, charLength = 100): HistoryMessage[] {
    return Array.from({ length: count }, (_, i) =>
        makeMsg(
            `msg-${i}`,
            i % 2 === 0 ? 'user' : 'model',
            'x'.repeat(charLength),
        ),
    );
}

function setupMockGenerateContent(responseText: string) {
    mockGetClient.mockResolvedValue({
        models: {
            generateContent: vi.fn().mockResolvedValue({
                text: responseText,
                usageMetadata: {
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    totalTokenCount: 150,
                },
            }),
        },
    } as never);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
});

// =============================================================================
// formatContextLabel — PURE function, no mocks
// =============================================================================

describe('formatContextLabel', () => {
    it('formats a single video-card with own-published ownership', () => {
        const result = formatContextLabel([
            { type: 'video-card', title: 'My Video', ownership: 'own-published' },
        ]);
        expect(result).toContain('Video "My Video" (your published)');
        expect(result).toMatch(/^\[.+Attached to this message:/);
    });

    it('formats a single video-card with own-draft ownership', () => {
        const result = formatContextLabel([
            { type: 'video-card', title: 'Draft Video', ownership: 'own-draft' },
        ]);
        expect(result).toContain('Video "Draft Video" (your draft)');
    });

    it('formats a single video-card with competitor ownership', () => {
        const result = formatContextLabel([
            { type: 'video-card', title: 'Rival Video', ownership: 'competitor' },
        ]);
        expect(result).toContain('Video "Rival Video" (competitor)');
    });

    it('treats unknown ownership as competitor', () => {
        const result = formatContextLabel([
            { type: 'video-card', title: 'Unknown Owner', ownership: 'some-other' },
        ]);
        expect(result).toContain('Video "Unknown Owner" (competitor)');
    });

    it('formats suggested-traffic context with source video and count', () => {
        const result = formatContextLabel([
            {
                type: 'suggested-traffic',
                sourceVideo: { title: 'Source Title' },
                suggestedVideos: [{ id: '1' }, { id: '2' }, { id: '3' }],
            },
        ]);
        expect(result).toContain('Traffic: "Source Title"');
        expect(result).toContain('3 suggested');
    });

    it('handles suggested-traffic with missing suggestedVideos (defaults to 0)', () => {
        const result = formatContextLabel([
            {
                type: 'suggested-traffic',
                sourceVideo: { title: 'No Suggestions' },
            },
        ]);
        expect(result).toContain('0 suggested');
    });

    it('handles suggested-traffic with missing sourceVideo', () => {
        const result = formatContextLabel([
            {
                type: 'suggested-traffic',
                suggestedVideos: [{ id: '1' }],
            },
        ]);
        // sourceVideo?.title is undefined → "undefined" in string
        expect(result).toContain('Traffic:');
        expect(result).toContain('1 suggested');
    });

    it('formats canvas-selection with mixed node types', () => {
        const result = formatContextLabel([
            {
                type: 'canvas-selection',
                nodes: [
                    { nodeType: 'video', title: 'Canvas Video', ownership: 'own-published' },
                    { nodeType: 'video', title: 'Canvas Draft', ownership: 'own-draft' },
                    { nodeType: 'traffic-source' },
                    { nodeType: 'sticky-note', content: 'Remember this' },
                    { nodeType: 'image' },
                    { nodeType: 'image' },
                ],
            },
        ]);
        expect(result).toContain('Canvas:');
        expect(result).toContain('Video "Canvas Video" (your published)');
        expect(result).toContain('Video "Canvas Draft" (your draft)');
        expect(result).toContain('1 traffic source(s)');
        expect(result).toContain('Note: "Remember this"');
        expect(result).toContain('2 image(s)');
    });

    it('formats canvas-selection with only videos', () => {
        const result = formatContextLabel([
            {
                type: 'canvas-selection',
                nodes: [
                    { nodeType: 'video', title: 'Only Video', ownership: 'competitor' },
                ],
            },
        ]);
        expect(result).toContain('Canvas: Video "Only Video" (competitor)');
        expect(result).not.toContain('traffic');
        expect(result).not.toContain('image');
        expect(result).not.toContain('Note');
    });

    it('truncates long sticky-note content at 40 chars with ellipsis', () => {
        const longContent = 'A'.repeat(60);
        const result = formatContextLabel([
            {
                type: 'canvas-selection',
                nodes: [
                    { nodeType: 'sticky-note', content: longContent },
                ],
            },
        ]);
        // Should contain first 40 chars followed by ellipsis
        expect(result).toContain(`Note: "${'A'.repeat(40)}…"`);
    });

    it('does not add ellipsis for sticky-note content at exactly 40 chars', () => {
        const exactContent = 'B'.repeat(40);
        const result = formatContextLabel([
            {
                type: 'canvas-selection',
                nodes: [
                    { nodeType: 'sticky-note', content: exactContent },
                ],
            },
        ]);
        expect(result).toContain(`Note: "${'B'.repeat(40)}"`);
        expect(result).not.toContain('…');
    });

    it('handles sticky-note with empty content', () => {
        const result = formatContextLabel([
            {
                type: 'canvas-selection',
                nodes: [
                    { nodeType: 'sticky-note', content: '' },
                ],
            },
        ]);
        expect(result).toContain('Note: ""');
    });

    it('handles sticky-note with undefined content', () => {
        const result = formatContextLabel([
            {
                type: 'canvas-selection',
                nodes: [
                    { nodeType: 'sticky-note' },
                ],
            },
        ]);
        // (n.content || '') handles undefined → empty string
        expect(result).toContain('Note: ""');
    });

    it('handles canvas-selection with empty nodes array', () => {
        const result = formatContextLabel([
            { type: 'canvas-selection', nodes: [] },
        ]);
        expect(result).toContain('Canvas: ');
    });

    it('handles canvas-selection with undefined nodes (defaults to [])', () => {
        const result = formatContextLabel([
            { type: 'canvas-selection' },
        ]);
        expect(result).toContain('Canvas: ');
    });

    it('separates multiple context items with semicolons', () => {
        const result = formatContextLabel([
            { type: 'video-card', title: 'Video A', ownership: 'own-published' },
            { type: 'video-card', title: 'Video B', ownership: 'competitor' },
        ]);
        expect(result).toContain('; ');
        // Both items present
        expect(result).toContain('Video "Video A" (your published)');
        expect(result).toContain('Video "Video B" (competitor)');
    });

    it('produces wrapped label even for empty appContext array', () => {
        const result = formatContextLabel([]);
        // The outer template always wraps: "[📎 Attached to this message: ]"
        expect(result).toBe('[📎 Attached to this message: ]');
    });

    it('ignores unknown context types (no crash, no label)', () => {
        const result = formatContextLabel([
            { type: 'unknown-widget', data: 123 },
        ]);
        // No label produced for unknown type, just the empty wrapper
        expect(result).toBe('[📎 Attached to this message: ]');
    });

    it('formats mixed context types correctly', () => {
        const result = formatContextLabel([
            { type: 'video-card', title: 'My Vid', ownership: 'own-published' },
            {
                type: 'suggested-traffic',
                sourceVideo: { title: 'Traffic Source' },
                suggestedVideos: [{ id: '1' }],
            },
            {
                type: 'canvas-selection',
                nodes: [{ nodeType: 'image' }],
            },
        ]);
        // Check semicolon separation and all three types present
        const parts = result.split('; ');
        expect(parts.length).toBe(3);
        expect(result).toContain('Video "My Vid"');
        expect(result).toContain('Traffic: "Traffic Source"');
        expect(result).toContain('Canvas: 1 image(s)');
    });
});

// =============================================================================
// buildMemory — mocks Gemini API via getClient
// =============================================================================

describe('buildMemory', () => {
    it('returns full history when token budget is not exceeded', async () => {
        const messages = makeConversation(4, 50); // 4 msgs × 50 chars → ~50 tokens total

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model-large',
            summaryModel: 'test-summary-model', // 100K limit → 60K budget
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(false);
        expect(result.history).toEqual(messages);
        expect(result.newSummary).toBeUndefined();
        expect(result.summarizedUpTo).toBeUndefined();
        expect(result.summaryTokenUsage).toBeUndefined();
    });

    it('returns full history for very short conversation (1-2 messages)', async () => {
        const messages = [
            makeMsg('m1', 'user', 'Hello'),
            makeMsg('m2', 'model', 'Hi there'),
        ];

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model-large',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(false);
        expect(result.history).toHaveLength(2);
    });

    it('returns full history for single message', async () => {
        const messages = [makeMsg('m1', 'user', 'Hello')];

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model-large',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(false);
        expect(result.history).toHaveLength(1);
    });

    it('triggers summarization when token budget is exceeded', async () => {
        setupMockGenerateContent('Summary of old messages');

        // test-model: 1000 tokens limit → 600 budget
        // Each msg: 800 chars → 200 tokens. 20 messages → 4000 tokens >> 600 budget
        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(true);
        expect(result.newSummary).toBe('Summary of old messages');
        expect(result.summarizedUpTo).toBeDefined();
        expect(result.summaryTokenUsage).toBeDefined();
    });

    it('injects summary as synthetic model message with __summary__ id', async () => {
        setupMockGenerateContent('This is the summary');

        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        const summaryMsg = result.history[0];
        expect(summaryMsg.id).toBe('__summary__');
        expect(summaryMsg.role).toBe('model');
        expect(summaryMsg.text).toContain('[Conversation Summary');
        expect(summaryMsg.text).toContain('This is the summary');
    });

    it('keeps at least MIN_RECENT_MESSAGES (10) in the sliding window', async () => {
        setupMockGenerateContent('Summary text');

        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        // history = [summary] + recent messages
        // recent should be at least MIN_RECENT_MESSAGES = 10
        const recentCount = result.history.length - 1; // subtract summary msg
        expect(recentCount).toBeGreaterThanOrEqual(10);
    });

    it('uses existing summary for incremental summarization', async () => {
        const mockGenerateContent = vi.fn().mockResolvedValue({
            text: 'Updated summary with new info',
            usageMetadata: {
                promptTokenCount: 200,
                candidatesTokenCount: 100,
                totalTokenCount: 300,
            },
        });
        mockGetClient.mockResolvedValue({
            models: { generateContent: mockGenerateContent },
        } as never);

        // 20 messages, first 5 already summarized (up to msg-4)
        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
            existingSummary: 'Previous summary content',
            existingSummarizedUpTo: 'msg-4',
        });

        expect(result.usedSummary).toBe(true);

        // Verify that generateContent was called with the existing summary
        const callArgs = mockGenerateContent.mock.calls[0][0];
        const promptText = callArgs.contents[0].parts[0].text;
        expect(promptText).toContain('Previous summary content');
        expect(promptText).toContain('existing conversation summary');
    });

    it('does not regenerate summary when summarizedUpTo matches last pre-window message', async () => {
        const mockGenerateContent = vi.fn();
        mockGetClient.mockResolvedValue({
            models: { generateContent: mockGenerateContent },
        } as never);

        // Create 20 messages with 800 chars each
        const messages = makeConversation(20, 800);

        // First call to establish what the window boundary is
        setupMockGenerateContent('Initial summary');
        const firstResult = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        // Now call again with the same messages but with existing summary
        // matching the last pre-window message
        vi.clearAllMocks();
        mockGetClient.mockResolvedValue({
            models: { generateContent: mockGenerateContent },
        } as never);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
            existingSummary: 'Cached summary',
            existingSummarizedUpTo: firstResult.summarizedUpTo,
        });

        // Should still use summary mode but NOT call generateContent again
        expect(result.usedSummary).toBe(true);
        expect(mockGenerateContent).not.toHaveBeenCalled();
        expect(result.newSummary).toBeUndefined();
    });

    it('summary message text has the correct format', async () => {
        setupMockGenerateContent('Detailed summary here');

        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        const summaryMsg = result.history[0];
        expect(summaryMsg.text).toBe(
            '[Conversation Summary — Earlier Messages]\n\nDetailed summary here',
        );
    });

    it('accounts for attachments in token estimation (forces summarization)', async () => {
        setupMockGenerateContent('Summarized with attachments');

        // test-model-large: 100K limit → 60K budget
        // Create a message with many attachments to blow the budget
        // Each attachment = 1500 tokens. 50 attachments = 75000 tokens > 60K budget
        const messages: HistoryMessage[] = [
            ...makeConversation(4, 50),
            makeMsg('attach-msg', 'user', 'Check these files', {
                attachments: Array.from({ length: 50 }, (_, i) => ({
                    type: 'image' as const,
                    url: `https://example.com/img${i}.png`,
                    name: `img${i}.png`,
                    mimeType: 'image/png',
                })),
            }),
        ];

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model-large',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(true);
    });

    it('accounts for appContext in token estimation', async () => {
        setupMockGenerateContent('Summarized with context');

        // test-model: 1000 tokens → 600 budget
        // Each appContext item adds ~50 chars / 4 = ~12.5 tokens
        // 200 context items = ~2500 tokens from context alone > 600 budget
        const messages: HistoryMessage[] = [
            makeMsg('ctx-msg', 'user', 'short', {
                appContext: Array.from({ length: 200 }, (_, i) => ({
                    type: 'video-card',
                    title: `Video ${i}`,
                    ownership: 'own-published',
                })),
            }),
        ];

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(true);
    });

    it('returns token usage from summarization call', async () => {
        setupMockGenerateContent('Summary');

        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.summaryTokenUsage).toEqual({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
        });
    });

    it('falls back to 200_000 context limit for unknown model', async () => {
        // Unknown model → 200K limit → 120K budget
        // Small conversation should fit easily
        const messages = makeConversation(4, 50);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'unknown-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(false);
        expect(result.history).toEqual(messages);
    });

    it('history starts with summary message followed by recent window (order check)', async () => {
        setupMockGenerateContent('Order test summary');

        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        // First message must be the synthetic summary
        expect(result.history[0].id).toBe('__summary__');
        expect(result.history[0].role).toBe('model');

        // Remaining messages should be a contiguous tail slice of the original
        const recentIds = result.history.slice(1).map(m => m.id);
        const allIds = messages.map(m => m.id);
        const startIdx = allIds.indexOf(recentIds[0]);
        expect(startIdx).toBeGreaterThan(0);
        // Verify contiguous sequence
        for (let i = 0; i < recentIds.length; i++) {
            expect(recentIds[i]).toBe(allIds[startIdx + i]);
        }
        // Last message should be the last original message
        expect(recentIds[recentIds.length - 1]).toBe(allIds[allIds.length - 1]);
    });

    it('uses empty string as summary when existingSummary is undefined and generateSummary returns empty', async () => {
        mockGetClient.mockResolvedValue({
            models: {
                generateContent: vi.fn().mockResolvedValue({
                    text: '',
                    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
                }),
            },
        } as never);

        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        // Empty text from API → summary falls back to existingSummary || "" → ""
        const summaryMsg = result.history[0];
        expect(summaryMsg.text).toBe('[Conversation Summary — Earlier Messages]\n\n');
    });

    it('uses existingSummary as fallback when generateSummary API returns empty text', async () => {
        mockGetClient.mockResolvedValue({
            models: {
                generateContent: vi.fn().mockResolvedValue({
                    text: undefined,
                    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
                }),
            },
        } as never);

        const messages = makeConversation(20, 800);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
            existingSummary: 'Fallback summary',
        });

        // When API returns undefined text, generateSummary uses existingSummary as fallback
        const summaryMsg = result.history[0];
        expect(summaryMsg.text).toContain('Fallback summary');
    });

    it('handles conversation where all messages are in recent window (none to summarize)', async () => {
        // test-model: 1000 tokens → 600 budget → recentBudget = 480
        // 12 messages × 50 chars = 600 chars → ~150 tokens. Exceeds 600 budget? No.
        // We need total to exceed budget but all messages fit in recent window.
        // Use test-model (1000 limit → 600 budget) with 12 messages of 250 chars each
        // Total: 12 * 250 / 4 = 750 tokens > 600 budget → triggers summarization path
        // Recent budget: 600 * 0.8 = 480 tokens
        // Each msg: 250/4 = ~63 tokens. Walking back 12 messages = 756 tokens > 480
        // But MIN_RECENT_MESSAGES = 10, so at least 10 kept
        // windowStart = min(calculated, max(0, 12-10)) = min(calculated, 2)
        // So windowStart = 2, messagesToSummarize = messages[0..1]
        setupMockGenerateContent('Summary of first 2');

        const messages = makeConversation(12, 250);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });

        expect(result.usedSummary).toBe(true);
        // Recent window should have at least 10 messages
        const recentCount = result.history.length - 1;
        expect(recentCount).toBeGreaterThanOrEqual(10);
    });

    it("uses chatModel's context limit for budget, summaryModel for API call", async () => {
        const mockGenerateContent = vi.fn().mockResolvedValue({
            text: 'Budget test summary',
            usageMetadata: {
                promptTokenCount: 100,
                candidatesTokenCount: 50,
                totalTokenCount: 150,
            },
        });
        mockGetClient.mockResolvedValue({
            models: { generateContent: mockGenerateContent },
        } as never);

        // 15 messages × 200 chars = 3000 chars → ~750 tokens
        // test-model: 1000 limit → 600 budget → 750 > 600 → SUMMARIZES
        // test-model-large: 100K limit → 60K budget → 750 < 60K → would NOT summarize
        const messages = makeConversation(15, 200);

        // With test-model (small chatModel): triggers summarization
        const smallResult = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });
        expect(smallResult.usedSummary).toBe(true);

        // Verify summaryModel is passed to generateSummary (not chatModel)
        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.model).toBe('test-summary-model');

        // With test-model-large (large chatModel): no summarization needed
        vi.clearAllMocks();
        const largeResult = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'test-model-large',
            summaryModel: 'test-summary-model',
            allMessages: messages,
        });
        expect(largeResult.usedSummary).toBe(false);
    });

    it('Claude budget = 200K × 0.75 = 150K, Gemini budget = 1M × 0.85 = 850K', async () => {
        setupMockGenerateContent('Claude budget test');

        // 620K chars → ~155K tokens > Claude budget 150K → summarizes
        // But 155K < Gemini budget 850K → fits
        const longMessages = makeConversation(20, 31_000); // 20 × 31K = 620K chars → ~155K tokens

        const claudeResult = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'claude-opus-4-6',
            summaryModel: 'test-summary-model',
            allMessages: longMessages,
        });
        expect(claudeResult.usedSummary).toBe(true);

        // Same messages with Gemini: 155K < 850K → fits
        const geminiResult = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'gemini-2.5-pro',
            summaryModel: 'test-summary-model',
            allMessages: longMessages,
        });
        expect(geminiResult.usedSummary).toBe(false);
    });

    it('unknown model falls back to 200K context (conservative default)', async () => {
        setupMockGenerateContent('Unknown model summary');

        // 125K tokens (500K chars) > 200K × 0.6 = 120K → should summarize
        const longMessages = makeConversation(20, 25_000);

        const result = await buildMemory({
            apiKey: 'test-key',
            chatModel: 'unknown-model',
            summaryModel: 'test-summary-model',
            allMessages: longMessages,
        });
        expect(result.usedSummary).toBe(true);
    });
});

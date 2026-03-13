import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

const mockCollectionDoc = vi.fn().mockReturnValue({ id: 'new-ki-id' });
const mockCollectionWhere = vi.fn();
const mockQueryGet = vi.fn();
const mockDocSet = vi.fn().mockResolvedValue(undefined);

const createChainedQuery = () => {
    const q: Record<string, unknown> = {
        where: (...args: unknown[]) => {
            mockCollectionWhere(...args);
            return createChainedQuery();
        },
        orderBy: () => createChainedQuery(),
        get: () => mockQueryGet(),
    };
    return q;
};

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        collection: (path: string) => ({
            doc: () => mockCollectionDoc(path),
            where: (...args: unknown[]) => {
                mockCollectionWhere(...args);
                return createChainedQuery();
            },
        }),
        doc: (path: string) => ({
            path,
            id: path.split('/').pop(),
            set: (...args: unknown[]) => mockDocSet(...args),
        }),
        batch: () => ({
            set: mockBatchSet,
            update: mockBatchUpdate,
            commit: mockBatchCommit,
        }),
    },
}));

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
        increment: (n: number) => ({ _increment: n }),
        arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
    },
}));

// Import after mocks
import { handleSaveKnowledge } from '../saveKnowledge.js';

const CTX: ToolContext = {
    userId: 'user1',
    channelId: 'ch1',
    conversationId: 'conv-123',
    model: 'claude-sonnet-4-6',
};

const VALID_ARGS = {
    category: 'traffic-analysis',
    title: 'Traffic Analysis — March 2026',
    content: '## Traffic\nBrowse 45%, Suggested 35%...',
    summary: 'Browse 45%, Suggested 35%, Search 20%',
    videoId: 'vid-abc',
    toolsUsed: ['analyzeTrafficSources'],
};

beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing KI (idempotency check)
    mockQueryGet.mockResolvedValue({ empty: true, docs: [] });
    // Reset doc mock to return fresh ref
    mockCollectionDoc.mockReturnValue({ id: 'new-ki-id' });
    mockDocSet.mockResolvedValue(undefined);
});

describe('handleSaveKnowledge', () => {
    it('creates KI doc + updates discovery flags in batch', async () => {
        const result = await handleSaveKnowledge(VALID_ARGS, CTX);

        expect(result.id).toBe('new-ki-id');
        expect(result.content).toContain('Traffic Analysis — March 2026');

        // Batch should have been called
        expect(mockBatchSet).toHaveBeenCalledOnce();
        expect(mockBatchUpdate).toHaveBeenCalledOnce();
        expect(mockBatchCommit).toHaveBeenCalledOnce();

        // Check KI data
        const kiData = mockBatchSet.mock.calls[0][1];
        expect(kiData.category).toBe('traffic-analysis');
        expect(kiData.title).toBe('Traffic Analysis — March 2026');
        expect(kiData.scope).toBe('video');
        expect(kiData.videoId).toBe('vid-abc');
        expect(kiData.conversationId).toBe('conv-123');
        expect(kiData.model).toBe('claude-sonnet-4-6');
        expect(kiData.source).toBe('chat-tool');
        expect(kiData.createdAt).toBe('SERVER_TIMESTAMP');

        // Check discovery flags update
        const flagsData = mockBatchUpdate.mock.calls[0][1];
        expect(flagsData.knowledgeItemCount).toEqual({ _increment: 1 });
        expect(flagsData.knowledgeCategories).toEqual({ _arrayUnion: ['traffic-analysis'] });
        expect(flagsData.lastAnalyzedAt).toBe('SERVER_TIMESTAMP');
    });

    it('rejects invalid slug (with dots)', async () => {
        const result = await handleSaveKnowledge(
            { ...VALID_ARGS, category: 'traffic.analysis' },
            CTX,
        );

        expect(result.error).toContain('Invalid category slug');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('rejects invalid slug (with spaces)', async () => {
        const result = await handleSaveKnowledge(
            { ...VALID_ARGS, category: 'traffic analysis' },
            CTX,
        );

        expect(result.error).toContain('Invalid category slug');
    });

    it('rejects invalid slug (uppercase)', async () => {
        const result = await handleSaveKnowledge(
            { ...VALID_ARGS, category: 'Traffic-Analysis' },
            CTX,
        );

        expect(result.error).toContain('Invalid category slug');
    });

    it('returns existing ID when duplicate (idempotency)', async () => {
        mockQueryGet.mockResolvedValue({
            empty: false,
            docs: [{ id: 'existing-ki-id' }],
        });

        const result = await handleSaveKnowledge(VALID_ARGS, CTX);

        expect(result.id).toBe('existing-ki-id');
        expect(result.skipped).toBe(true);
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('creates channel-level KI when no videoId', async () => {
        const channelArgs = {
            category: 'channel-journey',
            title: 'Channel Journey: Oct-Dec 2025',
            content: '## Journey\n...',
            summary: '3 hits in 8 days...',
        };

        const result = await handleSaveKnowledge(channelArgs, CTX);

        expect(result.id).toBe('new-ki-id');

        const kiData = mockBatchSet.mock.calls[0][1];
        expect(kiData.scope).toBe('channel');
        expect(kiData).not.toHaveProperty('videoId');
    });

    it('sets source to "conclude" when isConclude is true', async () => {
        const concludeCtx = { ...CTX, isConclude: true };

        await handleSaveKnowledge(VALID_ARGS, concludeCtx);

        const kiData = mockBatchSet.mock.calls[0][1];
        expect(kiData.source).toBe('conclude');
    });

    it('strips undefined fields before Firestore write', async () => {
        const argsWithUndefined = {
            ...VALID_ARGS,
            videoRefs: undefined,
        };

        await handleSaveKnowledge(argsWithUndefined, CTX);

        const kiData = mockBatchSet.mock.calls[0][1];
        expect(kiData).not.toHaveProperty('videoRefs');
    });

    it('returns error when required fields missing', async () => {
        const result = await handleSaveKnowledge(
            { category: 'test' },
            CTX,
        );

        expect(result.error).toContain('Required fields');
    });

    it('returns error when conversationId missing from context', async () => {
        const noConvCtx: ToolContext = { userId: 'user1', channelId: 'ch1' };

        const result = await handleSaveKnowledge(VALID_ARGS, noConvCtx);

        expect(result.error).toContain('conversationId');
    });
});

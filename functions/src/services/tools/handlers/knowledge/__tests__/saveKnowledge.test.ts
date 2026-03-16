import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

const mockKiRefUpdate = vi.fn().mockResolvedValue(undefined);
const mockCollectionDoc = vi.fn().mockReturnValue({ id: 'new-ki-id', update: mockKiRefUpdate });
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
            delete: mockBatchDelete,
            commit: mockBatchCommit,
        }),
    },
}));

vi.mock('../../../utils/resolveVideos.js', () => ({
    resolveVideosByIds: vi.fn().mockImplementation((_basePath: string, ids: string[]) => {
        const resolved = new Map(ids.map(id => [id, { requestedId: id, docId: id, data: {}, source: 'video_grid' }]));
        return Promise.resolve({ resolved, missingIds: [] });
    }),
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
import { resolveVideosByIds } from '../../../utils/resolveVideos.js';

const mockResolveVideos = vi.mocked(resolveVideosByIds);

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
    mockKiRefUpdate.mockClear();
    mockCollectionDoc.mockReturnValue({ id: 'new-ki-id', update: mockKiRefUpdate });
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

    // --- resolvedVideoRefs extraction (Gap 8) ---

    describe('resolvedVideoRefs extraction', () => {
        // Helper: 1st call = video doc resolution (default), 2nd call = content ref extraction (custom)
        const mockContentRefs = (entries: [string, Record<string, unknown>][]) => {
            // 1st call: video doc resolution — default behavior (resolve all IDs)
            mockResolveVideos.mockImplementationOnce((_bp: string, ids: string[]) =>
                Promise.resolve({ resolved: new Map(ids.map(id => [id, { requestedId: id, docId: id, data: {}, source: 'video_grid' }])), missingIds: [] })
            );
            // 2nd call: content ref extraction — custom data
            mockResolveVideos.mockResolvedValueOnce({
                resolved: new Map(entries.map(([id, data]) => [id, { requestedId: id, docId: id, data, source: (data.source as string) ?? 'video_grid' }])),
                missingIds: [],
            });
        };

        it('extracts vid:// links from content and stores resolvedVideoRefs', async () => {
            mockContentRefs([['A4SkhlJ2mK8', { title: 'My Video', thumbnail: 'thumb.jpg' }]]);

            await handleSaveKnowledge({
                ...VALID_ARGS,
                content: 'Check [My Video](vid://A4SkhlJ2mK8) for details',
            }, CTX);

            expect(mockKiRefUpdate).toHaveBeenCalledOnce();
            const refs = mockKiRefUpdate.mock.calls[0][0].resolvedVideoRefs;
            expect(refs).toHaveLength(1);
            expect(refs[0].videoId).toBe('A4SkhlJ2mK8');
            expect(refs[0].title).toBe('My Video');
            expect(refs[0].ownership).toBe('own-published');
        });

        it('extracts raw YouTube IDs (11-char) from content', async () => {
            mockContentRefs([['B5TklM3nL9x', { title: 'Raw ID Video', thumbnail: '' }]]);

            await handleSaveKnowledge({
                ...VALID_ARGS,
                content: 'Raw ID: B5TklM3nL9x in text',
            }, CTX);

            expect(mockKiRefUpdate).toHaveBeenCalledOnce();
            const refs = mockKiRefUpdate.mock.calls[0][0].resolvedVideoRefs;
            expect(refs[0].videoId).toBe('B5TklM3nL9x');
        });

        it('deduplicates vid:// + raw ID for same video', async () => {
            mockContentRefs([['A4SkhlJ2mK8', { title: 'Dup Video', thumbnail: '' }]]);

            await handleSaveKnowledge({
                ...VALID_ARGS,
                content: '[Dup Video](vid://A4SkhlJ2mK8) and also A4SkhlJ2mK8',
            }, CTX);

            // 2nd resolveVideosByIds call (content refs) should receive deduplicated IDs
            const contentRefCall = mockResolveVideos.mock.calls[mockResolveVideos.mock.calls.length - 1];
            expect(contentRefCall[1]).toHaveLength(1);
            expect(contentRefCall[1][0]).toBe('A4SkhlJ2mK8');
        });

        it('strips fake viewCount for custom video without successful fetch', async () => {
            mockContentRefs([['custom-123', {
                title: 'Draft', thumbnail: '', isCustom: true, fetchStatus: 'failed', viewCount: '1000000', publishedAt: '2025-01-01',
            }]]);

            await handleSaveKnowledge({
                ...VALID_ARGS,
                content: 'See custom-123 video',
            }, CTX);

            const refs = mockKiRefUpdate.mock.calls[0][0].resolvedVideoRefs;
            expect(refs[0].viewCount).toBeUndefined();
            expect(refs[0].publishedAt).toBeUndefined();
        });

        it('includes viewCount for custom video with successful fetch', async () => {
            mockContentRefs([['custom-456', {
                title: 'Published', thumbnail: '', isCustom: true, fetchStatus: 'success', viewCount: '5000', publishedAt: '2025-06-01',
            }]]);

            await handleSaveKnowledge({
                ...VALID_ARGS,
                content: 'See custom-456 video',
            }, CTX);

            const refs = mockKiRefUpdate.mock.calls[0][0].resolvedVideoRefs;
            expect(refs[0].viewCount).toBe(5000);
            expect(refs[0].publishedAt).toBe('2025-06-01');
        });

        it('does not write resolvedVideoRefs when no IDs found in content', async () => {
            await handleSaveKnowledge({
                ...VALID_ARGS,
                content: 'No video references here',
            }, CTX);

            expect(mockKiRefUpdate).not.toHaveBeenCalled();
        });

        it('survives resolveVideosByIds failure gracefully', async () => {
            // 1st call: video doc resolution — succeeds
            mockResolveVideos.mockImplementationOnce((_bp: string, ids: string[]) =>
                Promise.resolve({ resolved: new Map(ids.map(id => [id, { requestedId: id, docId: id, data: {}, source: 'video_grid' }])), missingIds: [] })
            );
            // 2nd call: content refs — fails
            mockResolveVideos.mockRejectedValueOnce(new Error('Firestore timeout'));

            const result = await handleSaveKnowledge({
                ...VALID_ARGS,
                content: 'Check [Video](vid://A4SkhlJ2mK8)',
            }, CTX);

            // KI should still be saved
            expect(result.id).toBe('new-ki-id');
            expect(mockBatchCommit).toHaveBeenCalledOnce();
        });
    });

});

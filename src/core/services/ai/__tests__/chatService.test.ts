// =============================================================================
// chatService — createMemory unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — intercept Firestore writes and deterministic IDs
// ---------------------------------------------------------------------------

const mockSetDocument = vi.fn();
vi.mock('../../firestore', () => ({
    setDocument: (...args: unknown[]) => mockSetDocument(...args),
    // Stubs for other imports used by chatService (not under test)
    fetchCollection: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    subscribeToCollection: vi.fn(),
    fetchDoc: vi.fn(),
    subscribeToDoc: vi.fn(),
    batchDeleteDocuments: vi.fn(),
}));

vi.mock('uuid', () => ({
    v4: () => 'test-uuid-1234',
}));

const mockBatchDelete = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', async () => {
    const actual = await vi.importActual('firebase/firestore');
    return {
        ...actual,
        writeBatch: () => ({
            delete: mockBatchDelete,
            set: mockBatchSet,
            commit: mockBatchCommit,
        }),
        doc: vi.fn((_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` })),
    };
});

vi.mock('../../../../config/firebase', () => ({
    db: {},
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { ChatService } from '../chatService';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatService.createMemory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('saves memory with correct fields and path', async () => {
        mockSetDocument.mockResolvedValue(undefined);

        const id = await ChatService.createMemory('user-1', 'chan-1', '## Decisions\n- chose X');

        expect(id).toBe('test-uuid-1234');
        expect(mockSetDocument).toHaveBeenCalledOnce();

        const [path, docId, data] = mockSetDocument.mock.calls[0];
        expect(path).toBe('users/user-1/channels/chan-1/conversationMemories');
        expect(docId).toBe('test-uuid-1234');
        expect(data.conversationTitle).toBe('Manual note');
        expect(data.content).toBe('## Decisions\n- chose X');
        expect(data.source).toBe('manual');
        expect(data.videoRefs).toBeUndefined();
        expect(data.createdAt).toBeDefined();
        expect(data.updatedAt).toBeDefined();
    });

    it('throws on empty content', async () => {
        await expect(ChatService.createMemory('user-1', 'chan-1', '')).rejects.toThrow(
            'Memory content cannot be empty',
        );
        expect(mockSetDocument).not.toHaveBeenCalled();
    });

    it('throws on whitespace-only content', async () => {
        await expect(ChatService.createMemory('user-1', 'chan-1', '   \n\t  ')).rejects.toThrow(
            'Memory content cannot be empty',
        );
        expect(mockSetDocument).not.toHaveBeenCalled();
    });

    it('preserves markdown special characters and unicode as-is', async () => {
        mockSetDocument.mockResolvedValue(undefined);

        const content = '## Decisions **bold** _italic_ `code`\n> quote\n| col |\n- [link](url)\n🎬 Кириллица';

        await ChatService.createMemory('user-1', 'chan-1', content);

        const [, , data] = mockSetDocument.mock.calls[0];
        expect(data.content).toBe(content);
    });

    it('uses custom title when provided', async () => {
        mockSetDocument.mockResolvedValue(undefined);

        await ChatService.createMemory('user-1', 'chan-1', 'some content', 'CTR insights');

        const [, , data] = mockSetDocument.mock.calls[0];
        expect(data.conversationTitle).toBe('CTR insights');
    });

    it('falls back to "Manual note" when title is empty or omitted', async () => {
        mockSetDocument.mockResolvedValue(undefined);

        await ChatService.createMemory('user-1', 'chan-1', 'content', '  ');

        const [, , data] = mockSetDocument.mock.calls[0];
        expect(data.conversationTitle).toBe('Manual note');
    });
});

describe('ChatService.applyConsolidation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates batch with correct deletes and creates', async () => {
        await ChatService.applyConsolidation(
            'user-1',
            'chan-1',
            ['mem-old-1', 'mem-old-2'],
            [{ title: 'Merged', content: 'Combined content' }],
        );

        // Verify deletes
        expect(mockBatchDelete).toHaveBeenCalledTimes(2);
        // Verify creates
        expect(mockBatchSet).toHaveBeenCalledOnce();
        const setArgs = mockBatchSet.mock.calls[0];
        expect(setArgs[1]).toMatchObject({
            conversationTitle: 'Merged',
            content: 'Combined content',
            source: 'consolidated',
        });
        // Verify commit
        expect(mockBatchCommit).toHaveBeenCalledOnce();
    });

    it('sets source: consolidated on created docs', async () => {
        await ChatService.applyConsolidation(
            'user-1', 'chan-1',
            ['mem-1'],
            [{ title: 'T1', content: 'C1' }, { title: 'T2', content: 'C2' }],
        );

        expect(mockBatchSet).toHaveBeenCalledTimes(2);
        for (const call of mockBatchSet.mock.calls) {
            expect(call[1].source).toBe('consolidated');
            expect(call[1].createdAt).toBeDefined();
            expect(call[1].updatedAt).toBeDefined();
        }
    });

    it('calls batch.commit() for atomic operation', async () => {
        await ChatService.applyConsolidation('user-1', 'chan-1', ['m1'], [{ title: 'T', content: 'C' }]);
        expect(mockBatchCommit).toHaveBeenCalledOnce();
    });
});

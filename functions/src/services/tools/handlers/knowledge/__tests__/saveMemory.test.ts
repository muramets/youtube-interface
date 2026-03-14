import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

const mockCollectionAdd = vi.fn();
const mockCollectionWhere = vi.fn();
const mockGet = vi.fn();
const mockDocGet = vi.fn();
const mockGetAll = vi.fn();
const mockDocPaths = new Map<string, string>();

const createChainedQuery = () => ({
    where: (...args: unknown[]) => {
        mockCollectionWhere(...args);
        return createChainedQuery();
    },
    limit: () => createChainedQuery(),
    get: () => mockGet(),
});

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        collection: () => ({
            where: (...args: unknown[]) => {
                mockCollectionWhere(...args);
                return createChainedQuery();
            },
            add: (data: unknown) => mockCollectionAdd(data),
        }),
        doc: (path: string) => {
            const id = path.split('/').pop() || path;
            mockDocPaths.set(id, path);
            return {
                get: () => mockDocGet(),
                id,
                path,
            };
        },
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
    },
}));

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
    },
}));

import { handleSaveMemory } from '../saveMemory.js';

const CTX: ToolContext = {
    userId: 'user1',
    channelId: 'ch1',
    conversationId: 'conv-123',
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDocPaths.clear();
    // Default: no duplicate, conversation exists
    mockGet.mockResolvedValue({ empty: true, docs: [] });
    mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ title: 'Test Conversation' }),
    });
    mockCollectionAdd.mockResolvedValue({ id: 'mem-new-id' });
    // Default: all KI refs exist
    mockGetAll.mockResolvedValue([
        { exists: true, id: 'ki-1' },
        { exists: true, id: 'ki-2' },
    ]);
});

describe('handleSaveMemory', () => {
    it('creates Memory doc with validated kiRefs', async () => {
        const result = await handleSaveMemory(
            { content: '## Decisions\n- chose X', kiRefs: ['ki-1', 'ki-2'] },
            CTX,
        );

        expect(result.memoryId).toBe('mem-new-id');
        expect(result.content).toContain('2 Knowledge Item references');

        const savedData = mockCollectionAdd.mock.calls[0][0];
        expect(savedData.conversationId).toBe('conv-123');
        expect(savedData.conversationTitle).toBe('Test Conversation');
        expect(savedData.content).toBe('## Decisions\n- chose X');
        expect(savedData.kiRefs).toEqual(['ki-1', 'ki-2']);
        expect(savedData.createdAt).toBe('SERVER_TIMESTAMP');
    });

    it('creates Memory without kiRefs when empty', async () => {
        const result = await handleSaveMemory(
            { content: '## Quick notes' },
            CTX,
        );

        expect(result.memoryId).toBe('mem-new-id');

        const savedData = mockCollectionAdd.mock.calls[0][0];
        expect(savedData).not.toHaveProperty('kiRefs');
        expect(mockGetAll).not.toHaveBeenCalled();
    });

    it('filters out non-existent kiRefs', async () => {
        mockGetAll.mockResolvedValue([
            { exists: true, id: 'ki-1' },
            { exists: false, id: 'ki-bad' },
            { exists: true, id: 'ki-3' },
        ]);

        const result = await handleSaveMemory(
            { content: '## Notes', kiRefs: ['ki-1', 'ki-bad', 'ki-3'] },
            CTX,
        );

        expect(result.memoryId).toBe('mem-new-id');

        const savedData = mockCollectionAdd.mock.calls[0][0];
        expect(savedData.kiRefs).toEqual(['ki-1', 'ki-3']);
    });

    it('omits kiRefs entirely when all are invalid', async () => {
        mockGetAll.mockResolvedValue([
            { exists: false, id: 'ki-bad-1' },
            { exists: false, id: 'ki-bad-2' },
        ]);

        const result = await handleSaveMemory(
            { content: '## Notes', kiRefs: ['ki-bad-1', 'ki-bad-2'] },
            CTX,
        );

        expect(result.memoryId).toBe('mem-new-id');

        const savedData = mockCollectionAdd.mock.calls[0][0];
        expect(savedData).not.toHaveProperty('kiRefs');
    });

    it('returns existing Memory if duplicate within 60s (idempotency)', async () => {
        mockGet.mockResolvedValue({
            empty: false,
            docs: [{ id: 'mem-existing' }],
        });

        const result = await handleSaveMemory(
            { content: '## Notes' },
            CTX,
        );

        expect(result.memoryId).toBe('mem-existing');
        expect(result.skipped).toBe(true);
        expect(mockCollectionAdd).not.toHaveBeenCalled();
    });

    it('fails if conversation was deleted (orphan prevention)', async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        const result = await handleSaveMemory(
            { content: '## Notes' },
            CTX,
        );

        expect(result.error).toContain('deleted during memorization');
        expect(mockCollectionAdd).not.toHaveBeenCalled();
    });

    it('returns error when content missing', async () => {
        const result = await handleSaveMemory({}, CTX);

        expect(result.error).toContain('content is required');
    });

    it('returns error when conversationId missing', async () => {
        const noConvCtx: ToolContext = { userId: 'user1', channelId: 'ch1' };

        const result = await handleSaveMemory(
            { content: '## Notes' },
            noConvCtx,
        );

        expect(result.error).toContain('conversationId');
    });
});

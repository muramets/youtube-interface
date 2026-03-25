import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({
            path,
            id: path.split('/').pop(),
            get: mockDocGet,
            update: mockDocUpdate,
        }),
    },
}));

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP',
    },
}));

vi.mock('firebase-functions/v2', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Import after mocks
import { handleEditMemory } from '../editMemory.js';

const CTX: ToolContext = {
    userId: 'user1',
    channelId: 'ch1',
    conversationId: 'conv-current',
    model: 'claude-sonnet-4-6',
};

const EXISTING_MEMORY = {
    content: '## Channel State\n\n### Phase 2\nOct 30 — hit 121K views\n\n### Phase 3\n| # | Video | Views |\n|---|---|---|\n| 1 | soft playlist | 15K |',
    conversationTitle: 'Channel State: slow life mode',
    protected: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...EXISTING_MEMORY }),
    });
});

describe('handleEditMemory', () => {
    // =========================================================================
    // Validation
    // =========================================================================

    it('rejects missing memoryId', async () => {
        const result = await handleEditMemory({ operations: [] }, CTX);
        expect(result.error).toContain('memoryId');
    });

    it('rejects missing operations', async () => {
        const result = await handleEditMemory({ memoryId: 'mem-1' }, CTX);
        expect(result.error).toContain('operations');
    });

    it('rejects empty operations array', async () => {
        const result = await handleEditMemory({ memoryId: 'mem-1', operations: [] }, CTX);
        expect(result.error).toContain('operations');
    });

    it('rejects missing userId/channelId', async () => {
        const result = await handleEditMemory(
            { memoryId: 'mem-1', operations: [{ type: 'replace', old_string: 'a', new_string: 'b' }] },
            { conversationId: 'conv-1' } as ToolContext,
        );
        expect(result.error).toContain('userId');
    });

    // =========================================================================
    // Not found
    // =========================================================================

    it('returns error when memory does not exist', async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        const result = await handleEditMemory({
            memoryId: 'nonexistent',
            operations: [{ type: 'replace', old_string: 'a', new_string: 'b' }],
        }, CTX);

        expect(result.error).toContain('not found');
        expect(result.error).toContain('saveMemory');
    });

    // =========================================================================
    // Protected guard
    // =========================================================================

    it('rejects editing protected memory', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({ ...EXISTING_MEMORY, protected: true }),
        });

        const result = await handleEditMemory({
            memoryId: 'mem-protected',
            operations: [{ type: 'replace', old_string: 'Phase 2', new_string: 'Phase 2 DONE' }],
        }, CTX);

        expect(result.error).toContain('protected');
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    it('allows editing when protected is undefined (legacy docs)', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { protected: _omit, ...rest } = EXISTING_MEMORY;
                return rest;
            },
        });

        const result = await handleEditMemory({
            memoryId: 'mem-legacy',
            operations: [{ type: 'replace', old_string: 'Phase 2', new_string: 'Phase 2 (Done)' }],
        }, CTX);

        expect(result.error).toBeUndefined();
        expect(mockDocUpdate).toHaveBeenCalled();
    });

    // =========================================================================
    // Successful operations
    // =========================================================================

    it('applies replace operation and returns stats', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [{ type: 'replace', old_string: '15K', new_string: '22K' }],
        }, CTX);

        expect(result.error).toBeUndefined();
        expect(result.memoryId).toBe('mem-1');
        expect(result.memoryTitle).toBe('Channel State: slow life mode');
        expect(result.charsAdded).toBe(3);
        expect(result.charsRemoved).toBe(3);
        expect(mockDocUpdate).toHaveBeenCalledWith({
            content: expect.stringContaining('22K'),
            updatedAt: 'SERVER_TIMESTAMP',
        });
    });

    it('applies insert_after operation', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [{
                type: 'insert_after',
                anchor: '| 1 | soft playlist | 15K |',
                content: '\n| 2 | calm weekends | 20K |',
            }],
        }, CTX);

        expect(result.error).toBeUndefined();
        expect(result.charsAdded).toBe('\n| 2 | calm weekends | 20K |'.length);
        expect(result.charsRemoved).toBe(0);

        const writtenContent = mockDocUpdate.mock.calls[0][0].content as string;
        expect(writtenContent).toContain('| 2 | calm weekends | 20K |');
        expect(writtenContent.indexOf('soft playlist')).toBeLessThan(writtenContent.indexOf('calm weekends'));
    });

    it('applies insert_before operation', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [{
                type: 'insert_before',
                anchor: '### Phase 3',
                content: '### Phase 2.5\nTransition period\n\n',
            }],
        }, CTX);

        expect(result.error).toBeUndefined();
        const writtenContent = mockDocUpdate.mock.calls[0][0].content as string;
        expect(writtenContent.indexOf('Phase 2.5')).toBeLessThan(writtenContent.indexOf('Phase 3'));
    });

    it('applies multiple operations sequentially', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [
                { type: 'replace', old_string: '15K', new_string: '22K' },
                { type: 'insert_after', anchor: '22K |', content: '\n| 2 | weekends | 20K |' },
            ],
        }, CTX);

        expect(result.error).toBeUndefined();
        const writtenContent = mockDocUpdate.mock.calls[0][0].content as string;
        expect(writtenContent).toContain('22K');
        expect(writtenContent).toContain('weekends');
    });

    // =========================================================================
    // No-op detection
    // =========================================================================

    it('skips update when content unchanged after operations', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [{ type: 'replace', old_string: '15K', new_string: '15K' }],
        }, CTX);

        expect(result.error).toBeUndefined();
        expect(result.content).toContain('unchanged');
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Operation errors (anchor not found, multiple matches)
    // =========================================================================

    it('returns error when anchor not found', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [{ type: 'insert_after', anchor: 'NONEXISTENT TEXT', content: 'new stuff' }],
        }, CTX);

        expect(result.error).toContain('not found');
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    it('returns error when old_string appears multiple times', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({ ...EXISTING_MEMORY, content: 'hello hello world' }),
        });

        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [{ type: 'replace', old_string: 'hello', new_string: 'hi' }],
        }, CTX);

        expect(result.error).toContain('2 times');
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    // =========================================================================
    // All-or-nothing: second operation fails → nothing written
    // =========================================================================

    it('rolls back all operations when later one fails', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [
                { type: 'replace', old_string: '15K', new_string: '22K' },
                { type: 'insert_after', anchor: 'DOES NOT EXIST', content: 'nope' },
            ],
        }, CTX);

        expect(result.error).toContain('not found');
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    // =========================================================================
    // contentPreview
    // =========================================================================

    it('returns contentPreview in response', async () => {
        const result = await handleEditMemory({
            memoryId: 'mem-1',
            operations: [{ type: 'replace', old_string: '15K', new_string: '22K' }],
        }, CTX);

        expect(result.contentPreview).toBeDefined();
        expect(typeof result.contentPreview).toBe('string');
        expect((result.contentPreview as string).length).toBeLessThanOrEqual(500);
    });

    // =========================================================================
    // Firestore path
    // =========================================================================

    it('writes to Firestore on successful edit', async () => {
        const result = await handleEditMemory({
            memoryId: 'target-mem-id',
            operations: [{ type: 'replace', old_string: '15K', new_string: '22K' }],
        }, CTX);

        expect(result.error).toBeUndefined();
        expect(mockDocUpdate).toHaveBeenCalledTimes(1);
        expect(mockDocUpdate).toHaveBeenCalledWith({
            content: expect.stringContaining('22K'),
            updatedAt: 'SERVER_TIMESTAMP',
        });
    });
});

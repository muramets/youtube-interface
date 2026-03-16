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

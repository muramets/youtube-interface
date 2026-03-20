import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore (deterministic ID pattern) ---

const mockDocGet = vi.fn();
const mockDocSet = vi.fn();
const mockDocUpdate = vi.fn();

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({
            get: () => mockDocGet(path),
            set: (data: unknown) => mockDocSet(path, data),
            update: (data: unknown) => mockDocUpdate(path, data),
            id: path.split('/').pop() || path,
            path,
        }),
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

const CONV_PATH = 'users/user1/channels/ch1/chatConversations/conv-123';
const MEMORY_PATH = 'users/user1/channels/ch1/conversationMemories/conv-123';

beforeEach(() => {
    vi.clearAllMocks();
    // Default: conversation exists, memory does not exist
    mockDocGet.mockImplementation((path: string) => {
        if (path === CONV_PATH) {
            return Promise.resolve({
                exists: true,
                data: () => ({ title: 'Test Conversation' }),
            });
        }
        // Memory doc does not exist by default
        return Promise.resolve({ exists: false });
    });
    mockDocSet.mockResolvedValue(undefined);
    mockDocUpdate.mockResolvedValue(undefined);
});

describe('handleSaveMemory', () => {
    // --- Create path ---

    it('creates new Memory doc with deterministic ID', async () => {
        const result = await handleSaveMemory(
            { content: '## Decisions\n- chose X' },
            CTX,
        );

        expect(result.memoryId).toBe('conv-123');
        expect(result).not.toHaveProperty('updated');

        expect(mockDocSet).toHaveBeenCalledWith(MEMORY_PATH, {
            conversationId: 'conv-123',
            conversationTitle: 'Test Conversation',
            content: '## Decisions\n- chose X',
            createdAt: 'SERVER_TIMESTAMP',
            updatedAt: 'SERVER_TIMESTAMP',
        });
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    // --- Update path (deterministic ID upsert) ---

    it('updates existing memory when doc exists', async () => {
        mockDocGet.mockImplementation((path: string) => {
            if (path === CONV_PATH) {
                return Promise.resolve({
                    exists: true,
                    data: () => ({ title: 'Updated Title' }),
                });
            }
            return Promise.resolve({ exists: true });
        });

        const result = await handleSaveMemory(
            { content: '## Updated summary' },
            CTX,
        );

        expect(result.memoryId).toBe('conv-123');
        expect(result.updated).toBe(true);

        expect(mockDocUpdate).toHaveBeenCalledWith(MEMORY_PATH, {
            content: '## Updated summary',
            conversationTitle: 'Updated Title',
            updatedAt: 'SERVER_TIMESTAMP',
        });
        expect(mockDocSet).not.toHaveBeenCalled();
    });

    it('update preserves original createdAt', async () => {
        mockDocGet.mockImplementation((path: string) => {
            if (path === CONV_PATH) {
                return Promise.resolve({
                    exists: true,
                    data: () => ({ title: 'Title' }),
                });
            }
            return Promise.resolve({ exists: true });
        });

        await handleSaveMemory({ content: '## Notes' }, CTX);

        const updateData = mockDocUpdate.mock.calls[0][1] as Record<string, unknown>;
        expect(updateData).not.toHaveProperty('createdAt');
        expect(updateData).toHaveProperty('updatedAt');
    });

    it('update refreshes conversationTitle from conv doc', async () => {
        mockDocGet.mockImplementation((path: string) => {
            if (path === CONV_PATH) {
                return Promise.resolve({
                    exists: true,
                    data: () => ({ title: 'Renamed Conversation' }),
                });
            }
            return Promise.resolve({ exists: true });
        });

        await handleSaveMemory({ content: '## Notes' }, CTX);

        const updateData = mockDocUpdate.mock.calls[0][1] as Record<string, unknown>;
        expect(updateData.conversationTitle).toBe('Renamed Conversation');
    });

    // --- Guard paths ---

    it('fails if conversation was deleted (orphan prevention)', async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        const result = await handleSaveMemory(
            { content: '## Notes' },
            CTX,
        );

        expect(result.error).toContain('deleted during memorization');
        expect(mockDocSet).not.toHaveBeenCalled();
        expect(mockDocUpdate).not.toHaveBeenCalled();
    });

    it('returns error when content missing', async () => {
        const result = await handleSaveMemory({}, CTX);
        expect(result.error).toContain('content is required');
    });

    it('returns error when conversationId missing', async () => {
        const noConvCtx: ToolContext = { userId: 'user1', channelId: 'ch1' };
        const result = await handleSaveMemory({ content: '## Notes' }, noConvCtx);
        expect(result.error).toContain('conversationId');
    });
});

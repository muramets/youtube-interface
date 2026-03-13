// =============================================================================
// knowledgeService — unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockFetchCollection = vi.fn();
const mockSubscribeToCollection = vi.fn();
const mockUpdateDocument = vi.fn();
const mockDeleteDocument = vi.fn();
const mockSetDocument = vi.fn();

vi.mock('../../firestore', () => ({
    fetchCollection: (...args: unknown[]) => mockFetchCollection(...args),
    subscribeToCollection: (...args: unknown[]) => mockSubscribeToCollection(...args),
    updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
    deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
    setDocument: (...args: unknown[]) => mockSetDocument(...args),
}));

vi.mock('firebase/firestore', () => ({
    where: (...args: unknown[]) => ({ type: 'where', args }),
    orderBy: (...args: unknown[]) => ({ type: 'orderBy', args }),
    serverTimestamp: () => 'SERVER_TIMESTAMP',
}));

vi.mock('../../../../config/firebase', () => ({
    db: {},
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { KnowledgeService } from '../knowledgeService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const CHANNEL_ID = 'chan-1';
const VIDEO_ID = 'vid-abc';
const ITEMS_PATH = `users/${USER_ID}/channels/${CHANNEL_ID}/knowledgeItems`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getVideoKnowledgeItems', () => {
        it('queries with videoId filter and createdAt desc', async () => {
            mockFetchCollection.mockResolvedValue([]);

            const result = await KnowledgeService.getVideoKnowledgeItems(USER_ID, CHANNEL_ID, VIDEO_ID);

            expect(result).toEqual([]);
            expect(mockFetchCollection).toHaveBeenCalledWith(
                ITEMS_PATH,
                [
                    { type: 'where', args: ['videoId', '==', VIDEO_ID] },
                    { type: 'orderBy', args: ['createdAt', 'desc'] },
                ]
            );
        });

        it('returns items when found', async () => {
            const items = [{ id: 'ki-1', title: 'Traffic Analysis' }];
            mockFetchCollection.mockResolvedValue(items);

            const result = await KnowledgeService.getVideoKnowledgeItems(USER_ID, CHANNEL_ID, VIDEO_ID);

            expect(result).toEqual(items);
        });
    });

    describe('getChannelKnowledgeItems', () => {
        it('queries with scope=channel filter', async () => {
            mockFetchCollection.mockResolvedValue([]);

            await KnowledgeService.getChannelKnowledgeItems(USER_ID, CHANNEL_ID);

            expect(mockFetchCollection).toHaveBeenCalledWith(
                ITEMS_PATH,
                [
                    { type: 'where', args: ['scope', '==', 'channel'] },
                    { type: 'orderBy', args: ['createdAt', 'desc'] },
                ]
            );
        });
    });

    describe('getAllKnowledgeItems', () => {
        it('queries without scope filter', async () => {
            mockFetchCollection.mockResolvedValue([]);

            await KnowledgeService.getAllKnowledgeItems(USER_ID, CHANNEL_ID);

            expect(mockFetchCollection).toHaveBeenCalledWith(
                ITEMS_PATH,
                [{ type: 'orderBy', args: ['createdAt', 'desc'] }]
            );
        });
    });

    describe('updateKnowledgeItem', () => {
        it('updates item with updatedAt timestamp', async () => {
            mockUpdateDocument.mockResolvedValue(undefined);

            await KnowledgeService.updateKnowledgeItem(USER_ID, CHANNEL_ID, 'ki-1', {
                title: 'Updated Title',
                content: 'New content',
            });

            expect(mockUpdateDocument).toHaveBeenCalledWith(
                ITEMS_PATH,
                'ki-1',
                {
                    title: 'Updated Title',
                    content: 'New content',
                    updatedAt: 'SERVER_TIMESTAMP',
                }
            );
        });

        it('strips undefined values before write', async () => {
            mockUpdateDocument.mockResolvedValue(undefined);

            await KnowledgeService.updateKnowledgeItem(USER_ID, CHANNEL_ID, 'ki-1', {
                title: 'Title',
                content: undefined as unknown as string,
            });

            const passedData = mockUpdateDocument.mock.calls[0][2];
            expect(passedData).not.toHaveProperty('content');
            expect(passedData).toHaveProperty('title', 'Title');
            expect(passedData).toHaveProperty('updatedAt');
        });
    });

    describe('deleteKnowledgeItem', () => {
        it('deletes from correct path', async () => {
            mockDeleteDocument.mockResolvedValue(undefined);

            await KnowledgeService.deleteKnowledgeItem(USER_ID, CHANNEL_ID, 'ki-1');

            expect(mockDeleteDocument).toHaveBeenCalledWith(ITEMS_PATH, 'ki-1');
        });
    });

    describe('createManualKnowledgeItem', () => {
        it('creates item with source=manual and empty provenance', async () => {
            mockSetDocument.mockResolvedValue(undefined);

            const id = await KnowledgeService.createManualKnowledgeItem(USER_ID, CHANNEL_ID, {
                category: 'channel-journey',
                title: 'My Manual Note',
                content: '## Journey\nNotes here...',
                summary: 'Manual notes about channel journey',
                scope: 'channel',
            });

            expect(id).toMatch(/^ki-\d+$/);
            expect(mockSetDocument).toHaveBeenCalledOnce();

            const [path, , data] = mockSetDocument.mock.calls[0];
            expect(path).toBe(ITEMS_PATH);
            expect(data.source).toBe('manual');
            expect(data.conversationId).toBe('');
            expect(data.model).toBe('');
            expect(data.toolsUsed).toEqual([]);
            expect(data.category).toBe('channel-journey');
            expect(data.scope).toBe('channel');
            expect(data.createdAt).toBe('SERVER_TIMESTAMP');
        });

        it('strips undefined videoId for channel-level KI', async () => {
            mockSetDocument.mockResolvedValue(undefined);

            await KnowledgeService.createManualKnowledgeItem(USER_ID, CHANNEL_ID, {
                category: 'niche-analysis',
                title: 'Niche Note',
                content: 'Content',
                summary: 'Summary',
                scope: 'channel',
                videoId: undefined,
            });

            const data = mockSetDocument.mock.calls[0][2];
            expect(data).not.toHaveProperty('videoId');
        });
    });

    describe('subscribeToVideoKnowledgeItems', () => {
        it('subscribes with correct path and constraints', () => {
            const callback = vi.fn();
            const unsubscribe = vi.fn();
            mockSubscribeToCollection.mockReturnValue(unsubscribe);

            const result = KnowledgeService.subscribeToVideoKnowledgeItems(
                USER_ID, CHANNEL_ID, VIDEO_ID, callback
            );

            expect(result).toBe(unsubscribe);
            expect(mockSubscribeToCollection).toHaveBeenCalledWith(
                ITEMS_PATH,
                callback,
                [
                    { type: 'where', args: ['videoId', '==', VIDEO_ID] },
                    { type: 'orderBy', args: ['createdAt', 'desc'] },
                ]
            );
        });
    });

    describe('subscribeToChannelKnowledgeItems', () => {
        it('subscribes with scope=channel filter', () => {
            const callback = vi.fn();
            mockSubscribeToCollection.mockReturnValue(vi.fn());

            KnowledgeService.subscribeToChannelKnowledgeItems(USER_ID, CHANNEL_ID, callback);

            expect(mockSubscribeToCollection).toHaveBeenCalledWith(
                ITEMS_PATH,
                callback,
                [
                    { type: 'where', args: ['scope', '==', 'channel'] },
                    { type: 'orderBy', args: ['createdAt', 'desc'] },
                ]
            );
        });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockCollectionDoc = vi.fn().mockReturnValue({ id: 'version-id-1' });

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({
            path,
            id: path.split('/').pop(),
            get: mockDocGet,
            update: mockDocUpdate,
        }),
        collection: (path: string) => ({
            doc: () => mockCollectionDoc(path),
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
    },
}));

vi.mock('firebase-functions/v2', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const mockResolveContentVideoRefs = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../utils/resolveContentVideoRefs.js', () => ({
    resolveContentVideoRefs: (...args: unknown[]) => mockResolveContentVideoRefs(...args),
}));

// Import after mocks
import { handleEditKnowledge } from '../editKnowledge.js';

const CTX: ToolContext = {
    userId: 'user1',
    channelId: 'ch1',
    conversationId: 'conv-123',
    model: 'claude-sonnet-4-6',
};

const EXISTING_KI = {
    content: '## Old Traffic Analysis\nBrowse 45%...',
    title: 'Traffic Analysis — March 2026',
    source: 'chat-tool',
    model: 'claude-sonnet-4-6',
    scope: 'video',
    videoId: 'vid-abc',
};

beforeEach(() => {
    vi.clearAllMocks();
    // Default: KI exists
    mockDocGet.mockResolvedValue({
        exists: true,
        data: () => EXISTING_KI,
    });
});

describe('handleEditKnowledge', () => {
    it('creates version snapshot + updates main doc in atomic batch', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', content: '## Updated Analysis\nBrowse 50%...' },
            CTX,
        );

        expect(result.id).toBe('ki-123');
        expect(result.videoId).toBe('vid-abc');
        expect(result.content).toContain('Traffic Analysis — March 2026');
        expect(result.content).toContain('updated');

        // Batch should have been called
        expect(mockBatchSet).toHaveBeenCalledOnce();
        expect(mockBatchUpdate).toHaveBeenCalledOnce();
        expect(mockBatchCommit).toHaveBeenCalledOnce();

        // Version snapshot contains OLD content
        const versionData = mockBatchSet.mock.calls[0][1];
        expect(versionData.content).toBe('## Old Traffic Analysis\nBrowse 45%...');
        expect(versionData.title).toBe('Traffic Analysis — March 2026');
        expect(versionData.source).toBe('chat-tool');
        expect(versionData.model).toBe('claude-sonnet-4-6');
        expect(typeof versionData.createdAt).toBe('number');
        // createdAt should be Date.now(), not serverTimestamp
        expect(versionData.createdAt).toBeGreaterThan(1700000000000);

        // Main doc update has new content
        const updateData = mockBatchUpdate.mock.calls[0][1];
        expect(updateData.content).toBe('## Updated Analysis\nBrowse 50%...');
        expect(updateData.updatedAt).toBe('SERVER_TIMESTAMP');
        expect(updateData.lastEditedBy).toBe('claude-sonnet-4-6');
        expect(updateData.lastEditSource).toBe('chat-edit');
    });

    it('returns error when kiId is missing', async () => {
        const result = await handleEditKnowledge(
            { content: 'some content' },
            CTX,
        );

        expect(result.error).toContain('Required fields');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('returns error when content is missing', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123' },
            CTX,
        );

        expect(result.error).toContain('Required fields');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('returns error when KI not found', async () => {
        mockDocGet.mockResolvedValue({ exists: false });

        const result = await handleEditKnowledge(
            { kiId: 'ki-nonexistent', content: 'new content' },
            CTX,
        );

        expect(result.error).toContain('Knowledge Item not found');
        expect(result.error).toContain('ki-nonexistent');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('calls resolveContentVideoRefs on new content', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'Check [Video](vid://A4SkhlJ2mK8)' },
            CTX,
        );

        expect(mockResolveContentVideoRefs).toHaveBeenCalledOnce();
        // First arg is the new content
        expect(mockResolveContentVideoRefs.mock.calls[0][0]).toBe('Check [Video](vid://A4SkhlJ2mK8)');
        // Second arg is basePath
        expect(mockResolveContentVideoRefs.mock.calls[0][1]).toBe('users/user1/channels/ch1');
        // Fourth arg is log tag
        expect(mockResolveContentVideoRefs.mock.calls[0][3]).toBe('editKnowledge');
    });

    it('survives video ref resolution failure gracefully', async () => {
        mockResolveContentVideoRefs.mockRejectedValueOnce(new Error('Firestore timeout'));

        const result = await handleEditKnowledge(
            { kiId: 'ki-123', content: 'Check [Video](vid://A4SkhlJ2mK8)' },
            CTX,
        );

        // KI should still be updated
        expect(result.id).toBe('ki-123');
        expect(mockBatchCommit).toHaveBeenCalledOnce();
    });

    it('version snapshot contains old source and model', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                content: 'Old content',
                title: 'Old Title',
                source: 'conclude',
                model: 'gemini-2.5-pro',
            }),
        });

        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        const versionData = mockBatchSet.mock.calls[0][1];
        expect(versionData.source).toBe('conclude');
        expect(versionData.model).toBe('gemini-2.5-pro');
    });

    it('version snapshot preserves origin and edit provenance separately', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                content: 'Edited content',
                title: 'Title',
                source: 'chat-tool',
                model: 'claude-sonnet-4-6',
                lastEditSource: 'chat-edit',
                lastEditedBy: 'claude-haiku-4-5',
            }),
        });

        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        const versionData = mockBatchSet.mock.calls[0][1];
        // Origin provenance — from KI.source / KI.model
        expect(versionData.source).toBe('chat-tool');
        expect(versionData.model).toBe('claude-sonnet-4-6');
        // Edit provenance — from KI.lastEditSource / KI.lastEditedBy
        expect(versionData.lastEditSource).toBe('chat-edit');
        expect(versionData.lastEditedBy).toBe('claude-haiku-4-5');
    });

    it('sets source to "conclude" when ctx.isConclude is true', async () => {
        const concludeCtx = { ...CTX, isConclude: true };

        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'Updated via memorize' },
            concludeCtx,
        );

        const updateData = mockBatchUpdate.mock.calls[0][1];
        expect(updateData.lastEditSource).toBe('conclude');
    });

    it('uses Date.now() for version createdAt, not serverTimestamp', async () => {
        const before = Date.now();

        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        const after = Date.now();
        const versionData = mockBatchSet.mock.calls[0][1];
        expect(versionData.createdAt).toBeGreaterThanOrEqual(before);
        expect(versionData.createdAt).toBeLessThanOrEqual(after);
    });

    it('sets updatedAt via FieldValue.serverTimestamp()', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        const updateData = mockBatchUpdate.mock.calls[0][1];
        expect(updateData.updatedAt).toBe('SERVER_TIMESTAMP');
    });

    it('skips version snapshot when content is unchanged (trimmed comparison)', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', content: '## Old Traffic Analysis\nBrowse 45%...  ' }, // trailing spaces
            CTX,
        );

        expect(result.content).toContain('unchanged');
        expect(result.id).toBe('ki-123');
        expect(result.videoId).toBe('vid-abc');
        // No batch operations — early return
        expect(mockBatchSet).not.toHaveBeenCalled();
        expect(mockBatchUpdate).not.toHaveBeenCalled();
        expect(mockBatchCommit).not.toHaveBeenCalled();
        // No video ref resolution either
        expect(mockResolveContentVideoRefs).not.toHaveBeenCalled();
    });

    it('creates version when content differs only in non-whitespace', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', content: '## Old Traffic Analysis\nBrowse 50%...' }, // 50% instead of 45%
            CTX,
        );

        expect(result.content).toContain('updated');
        expect(mockBatchSet).toHaveBeenCalledOnce();
        expect(mockBatchCommit).toHaveBeenCalledOnce();
    });

    it('returns undefined videoId when KI has no videoId', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                content: 'Channel-level content',
                title: 'Channel KI',
                source: 'chat-tool',
                model: 'claude-sonnet-4-6',
                scope: 'channel',
            }),
        });

        const result = await handleEditKnowledge(
            { kiId: 'ki-channel', content: 'Updated channel content' },
            CTX,
        );

        expect(result.videoId).toBeUndefined();
    });

    it('strips undefined from version data (model empty string)', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                content: 'Old content',
                title: '',
                source: 'manual',
                model: '',
            }),
        });

        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        const versionData = mockBatchSet.mock.calls[0][1];
        // Empty model → undefined → stripped
        expect(versionData).not.toHaveProperty('model');
        // Empty title → undefined → stripped
        expect(versionData).not.toHaveProperty('title');
    });
});

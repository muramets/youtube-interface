import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

const mockDocGet = vi.fn();
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockCollectionDoc = vi.fn().mockReturnValue({ id: 'version-id-1' });

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({
            path,
            id: path.split('/').pop(),
            get: mockDocGet,
            update: mockDocUpdate,
            set: mockDocSet,
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
        increment: (n: number) => `INCREMENT(${n})`,
        arrayUnion: (...vals: unknown[]) => `ARRAY_UNION(${vals.join(',')})`,
        delete: () => 'DELETE_FIELD',
    },
}));

vi.mock('firebase-functions/v2', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../../../../shared/knowledge.js', () => ({
    SLUG_PATTERN: /^[a-z0-9]+(-[a-z0-9]+)*$/,
}));

const mockResolveContentVideoRefs = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../utils/resolveContentVideoRefs.js', () => ({
    resolveContentVideoRefs: (...args: unknown[]) => mockResolveContentVideoRefs(...args),
}));

const mockResolveVideosByIds = vi.fn().mockResolvedValue({
    resolved: new Map(),
    missing: [],
});
vi.mock('../../../utils/resolveVideos.js', () => ({
    resolveVideosByIds: (...args: unknown[]) => mockResolveVideosByIds(...args),
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
    summary: 'Original summary of traffic patterns.',
    category: 'traffic-analysis',
    source: 'chat-tool',
    model: 'claude-sonnet-4-6',
    scope: 'video',
    videoId: 'vid-abc',
};

beforeEach(() => {
    vi.clearAllMocks();
    // Default: KI exists with video scope
    mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({ ...EXISTING_KI }),
    });
});

describe('handleEditKnowledge', () => {
    // =========================================================================
    // Content editing (existing behavior, preserved)
    // =========================================================================

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
                ...EXISTING_KI,
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
                ...EXISTING_KI,
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

    it('creates version when content differs only in non-whitespace', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', content: '## Old Traffic Analysis\nBrowse 50%...' }, // 50% instead of 45%
            CTX,
        );

        expect(result.content).toContain('updated');
        expect(mockBatchSet).toHaveBeenCalledOnce();
        expect(mockBatchCommit).toHaveBeenCalledOnce();
    });

    it('strips undefined from version data (model empty string)', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                ...EXISTING_KI,
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

    it('does not call resolveContentVideoRefs when only metadata changes', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', title: 'New Title' },
            CTX,
        );

        expect(mockResolveContentVideoRefs).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Validation
    // =========================================================================

    it('returns error when kiId is missing', async () => {
        const result = await handleEditKnowledge(
            { content: 'some content' },
            CTX,
        );

        expect(result.error).toContain('kiId');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('returns error when no update fields are provided', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123' },
            CTX,
        );

        expect(result.error).toContain('At least one field');
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

    it('returns error for invalid category slug', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', category: 'Invalid Category!' },
            CTX,
        );

        expect(result.error).toContain('Invalid category slug');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('returns error when context is missing userId or channelId', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', title: 'New Title' },
            { ...CTX, userId: '', channelId: 'ch1' },
        );

        expect(result.error).toContain('userId and channelId');
    });

    // =========================================================================
    // Early return: nothing changed
    // =========================================================================

    it('skips update when content is unchanged (trimmed comparison)', async () => {
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
        expect(mockResolveContentVideoRefs).not.toHaveBeenCalled();
    });

    it('skips update when title is same as current', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', title: 'Traffic Analysis — March 2026' }, // same as EXISTING_KI
            CTX,
        );

        expect(result.content).toContain('unchanged');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    it('skips update when all provided fields match current values', async () => {
        const result = await handleEditKnowledge(
            {
                kiId: 'ki-123',
                title: EXISTING_KI.title,
                summary: EXISTING_KI.summary,
                category: EXISTING_KI.category,
            },
            CTX,
        );

        expect(result.content).toContain('unchanged');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Title editing
    // =========================================================================

    it('updates title without creating version snapshot', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', title: 'Packaging Hypotheses Home' },
            CTX,
        );

        expect(result.title).toBe('Packaging Hypotheses Home');
        expect(result.content).toContain('updated');

        // No version snapshot (content didn't change)
        expect(mockBatchSet).not.toHaveBeenCalled();

        // Main doc update contains title
        expect(mockBatchUpdate).toHaveBeenCalledOnce();
        const updateData = mockBatchUpdate.mock.calls[0][1];
        expect(updateData.title).toBe('Packaging Hypotheses Home');
        expect(updateData).not.toHaveProperty('content');
        expect(updateData.updatedAt).toBe('SERVER_TIMESTAMP');
    });

    // =========================================================================
    // Summary editing
    // =========================================================================

    it('updates summary without creating version snapshot', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', summary: 'Updated summary of the analysis.' },
            CTX,
        );

        expect(result.summary).toBe('Updated summary of the analysis.');
        expect(mockBatchSet).not.toHaveBeenCalled();

        const updateData = mockBatchUpdate.mock.calls[0][1];
        expect(updateData.summary).toBe('Updated summary of the analysis.');
        expect(updateData).not.toHaveProperty('content');
    });

    // =========================================================================
    // Title + summary together
    // =========================================================================

    it('updates title and summary together', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', title: 'New Title', summary: 'New summary.' },
            CTX,
        );

        expect(result.title).toBe('New Title');
        expect(result.summary).toBe('New summary.');
        expect(mockBatchSet).not.toHaveBeenCalled(); // no version snapshot

        const updateData = mockBatchUpdate.mock.calls[0][1];
        expect(updateData.title).toBe('New Title');
        expect(updateData.summary).toBe('New summary.');
    });

    // =========================================================================
    // VideoId: unlink (null → channel scope)
    // =========================================================================

    it('unlinks video when videoId is null — scope becomes channel', async () => {
        // First get(): KI doc. Second get(): old entity existence check.
        mockDocGet
            .mockResolvedValueOnce({ exists: true, data: () => ({ ...EXISTING_KI }) })
            .mockResolvedValueOnce({ exists: true }); // old entity exists

        const result = await handleEditKnowledge(
            { kiId: 'ki-123', videoId: null },
            CTX,
        );

        expect(result.scope).toBe('channel');
        expect(result.videoId).toBeUndefined();
        expect(result.content).toContain('updated');

        // batch.update calls: main doc + old entity (decrement) + new entity (increment)
        expect(mockBatchUpdate).toHaveBeenCalledTimes(3);

        // Main doc: scope + videoId deleted
        const mainUpdate = mockBatchUpdate.mock.calls[0][1];
        expect(mainUpdate.scope).toBe('channel');
        expect(mainUpdate.videoId).toBe('DELETE_FIELD');

        // Old entity (video doc): decrement
        const oldEntityRef = mockBatchUpdate.mock.calls[1][0];
        expect(oldEntityRef.path).toBe('users/user1/channels/ch1/videos/vid-abc');
        expect(mockBatchUpdate.mock.calls[1][1].knowledgeItemCount).toBe('INCREMENT(-1)');

        // New entity (channel doc): increment
        const newEntityRef = mockBatchUpdate.mock.calls[2][0];
        expect(newEntityRef.path).toBe('users/user1/channels/ch1');
        expect(mockBatchUpdate.mock.calls[2][1].knowledgeItemCount).toBe('INCREMENT(1)');
        expect(mockBatchUpdate.mock.calls[2][1].knowledgeCategories).toBe('ARRAY_UNION(traffic-analysis)');
        expect(mockBatchUpdate.mock.calls[2][1].lastAnalyzedAt).toBe('SERVER_TIMESTAMP');
    });

    it('skips discovery flags when unlinking a channel-scoped KI (already channel)', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                ...EXISTING_KI,
                scope: 'channel',
                videoId: undefined,
                title: 'Channel KI',
            }),
        });

        const result = await handleEditKnowledge(
            { kiId: 'ki-123', videoId: null, title: 'Renamed Channel KI' },
            CTX,
        );

        expect(result.title).toBe('Renamed Channel KI');
        // Only 1 batch.update: main doc (no scope change → no discovery flags)
        expect(mockBatchUpdate).toHaveBeenCalledOnce();
    });

    // =========================================================================
    // VideoId: link (string → video scope)
    // =========================================================================

    it('links to a video — normalizes YouTube ID and updates discovery flags', async () => {
        const channelKi = { ...EXISTING_KI, scope: 'channel', videoId: undefined };
        // First get(): KI doc. Second get(): old entity (channel) existence check.
        mockDocGet
            .mockResolvedValueOnce({ exists: true, data: () => channelKi })
            .mockResolvedValueOnce({ exists: true }); // old entity (channel doc) exists

        // resolveVideosByIds returns normalized doc ID
        mockResolveVideosByIds.mockResolvedValueOnce({
            resolved: new Map([['youtube-xyz', { docId: 'custom-resolved-789' }]]),
            missing: [],
        });

        const result = await handleEditKnowledge(
            { kiId: 'ki-123', videoId: 'youtube-xyz' },
            CTX,
        );

        expect(result.scope).toBe('video');
        expect(result.videoId).toBe('custom-resolved-789');

        // resolveVideosByIds was called with correct args
        expect(mockResolveVideosByIds).toHaveBeenCalledWith(
            'users/user1/channels/ch1',
            ['youtube-xyz'],
            { skipExternal: true },
        );

        // batch.update: main doc + old entity (channel) + new entity (video)
        expect(mockBatchUpdate).toHaveBeenCalledTimes(3);

        const mainUpdate = mockBatchUpdate.mock.calls[0][1];
        expect(mainUpdate.scope).toBe('video');
        expect(mainUpdate.videoId).toBe('custom-resolved-789');

        // Old entity (channel): decrement
        expect(mockBatchUpdate.mock.calls[1][0].path).toBe('users/user1/channels/ch1');
        expect(mockBatchUpdate.mock.calls[1][1].knowledgeItemCount).toBe('INCREMENT(-1)');

        // New entity (video): increment
        expect(mockBatchUpdate.mock.calls[2][0].path).toBe('users/user1/channels/ch1/videos/custom-resolved-789');
        expect(mockBatchUpdate.mock.calls[2][1].knowledgeItemCount).toBe('INCREMENT(1)');
    });

    it('returns error when video not found during link', async () => {
        mockResolveVideosByIds.mockResolvedValueOnce({
            resolved: new Map(), // empty — video not found
            missing: ['nonexistent-vid'],
        });

        const result = await handleEditKnowledge(
            { kiId: 'ki-123', videoId: 'nonexistent-vid' },
            CTX,
        );

        expect(result.error).toContain('Video not found');
        expect(result.error).toContain('nonexistent-vid');
        expect(mockBatchCommit).not.toHaveBeenCalled();
    });

    // =========================================================================
    // VideoId + content together
    // =========================================================================

    it('handles videoId unlink + content change together', async () => {
        mockDocGet
            .mockResolvedValueOnce({ exists: true, data: () => ({ ...EXISTING_KI }) })
            .mockResolvedValueOnce({ exists: true }); // old entity exists

        const result = await handleEditKnowledge(
            { kiId: 'ki-123', videoId: null, content: 'New channel-level content' },
            CTX,
        );

        expect(result.scope).toBe('channel');
        expect(result.videoId).toBeUndefined();
        expect(result.contentLength).toBe('New channel-level content'.length);

        // Version snapshot (content changed)
        expect(mockBatchSet).toHaveBeenCalledOnce();
        const versionData = mockBatchSet.mock.calls[0][1];
        expect(versionData.content).toBe(EXISTING_KI.content);

        // batch.update: main doc + old entity + new entity = 3
        expect(mockBatchUpdate).toHaveBeenCalledTimes(3);

        // Main doc has both content and scope changes
        const mainUpdate = mockBatchUpdate.mock.calls[0][1];
        expect(mainUpdate.content).toBe('New channel-level content');
        expect(mainUpdate.scope).toBe('channel');
        expect(mainUpdate.videoId).toBe('DELETE_FIELD');
    });

    // =========================================================================
    // Category editing
    // =========================================================================

    it('updates category and adds to entity knowledgeCategories', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', category: 'packaging-audit' },
            CTX,
        );

        expect(result.category).toBe('packaging-audit');

        // batch.update: main doc + entity category flag = 2
        expect(mockBatchUpdate).toHaveBeenCalledTimes(2);

        const mainUpdate = mockBatchUpdate.mock.calls[0][1];
        expect(mainUpdate.category).toBe('packaging-audit');

        // Category flag on entity (same entity — video, since scope didn't change)
        const entityRef = mockBatchUpdate.mock.calls[1][0];
        expect(entityRef.path).toBe('users/user1/channels/ch1/videos/vid-abc');
        expect(mockBatchUpdate.mock.calls[1][1].knowledgeCategories).toBe('ARRAY_UNION(packaging-audit)');
    });

    it('updates category registry when category changes', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', category: 'packaging-audit' },
            CTX,
        );

        // Registry update via db.doc().set() (non-blocking, after batch)
        expect(mockDocSet).toHaveBeenCalledOnce();
        const registryData = mockDocSet.mock.calls[0][0];
        expect(registryData).toHaveProperty('categories.packaging-audit');
        expect(registryData['categories.packaging-audit'].label).toBe('Packaging Audit');
    });

    it('skips category flag update on entity when scope also changes (discovery handles it)', async () => {
        mockDocGet
            .mockResolvedValueOnce({ exists: true, data: () => ({ ...EXISTING_KI }) })
            .mockResolvedValueOnce({ exists: true }); // old entity exists

        // Unlink + change category simultaneously
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', videoId: null, category: 'niche-analysis' },
            CTX,
        );

        expect(result.scope).toBe('channel');
        expect(result.category).toBe('niche-analysis');

        // batch.update: main doc + old entity (decrement) + new entity (increment) = 3
        // NOT 4 — category flag is folded into scope change discovery update
        expect(mockBatchUpdate).toHaveBeenCalledTimes(3);

        // New entity uses the new category for arrayUnion
        expect(mockBatchUpdate.mock.calls[2][1].knowledgeCategories).toBe('ARRAY_UNION(niche-analysis)');
    });

    it('does not update registry when category is unchanged', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', title: 'New Title' },
            CTX,
        );

        expect(mockDocSet).not.toHaveBeenCalled();
    });

    // =========================================================================
    // Returns: videoId for channel-scoped KI
    // =========================================================================

    it('returns undefined videoId when KI has no videoId', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                ...EXISTING_KI,
                content: 'Channel-level content',
                title: 'Channel KI',
                source: 'chat-tool',
                model: 'claude-sonnet-4-6',
                scope: 'channel',
                videoId: undefined,
            }),
        });

        const result = await handleEditKnowledge(
            { kiId: 'ki-channel', content: 'Updated channel content' },
            CTX,
        );

        expect(result.videoId).toBeUndefined();
    });

    // =========================================================================
    // Return payload completeness
    // =========================================================================

    it('returns all current field values after update', async () => {
        const result = await handleEditKnowledge(
            { kiId: 'ki-123', title: 'New Title', summary: 'New summary.' },
            CTX,
        );

        expect(result.id).toBe('ki-123');
        expect(result.title).toBe('New Title');
        expect(result.summary).toBe('New summary.');
        expect(result.category).toBe('traffic-analysis'); // unchanged
        expect(result.scope).toBe('video'); // unchanged
        expect(result.videoId).toBe('vid-abc'); // unchanged
        expect(result.contentLength).toBe(EXISTING_KI.content.length); // content unchanged
    });

    // =========================================================================
    // Main doc update: only changed fields present
    // =========================================================================

    it('only includes changed fields in main doc update', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', title: 'New Title' },
            CTX,
        );

        const updateData = mockBatchUpdate.mock.calls[0][1];
        expect(updateData.title).toBe('New Title');
        // These should NOT be in the update
        expect(updateData).not.toHaveProperty('content');
        expect(updateData).not.toHaveProperty('summary');
        expect(updateData).not.toHaveProperty('category');
        expect(updateData).not.toHaveProperty('scope');
        expect(updateData).not.toHaveProperty('videoId');
        // Provenance is always present
        expect(updateData.updatedAt).toBe('SERVER_TIMESTAMP');
        expect(updateData.lastEditedBy).toBe('claude-sonnet-4-6');
        expect(updateData.lastEditSource).toBe('chat-edit');
    });

    // =========================================================================
    // W1: Version createdAt uses toMillis when timestamp exists
    // =========================================================================

    it('uses updatedAt.toMillis() for version createdAt when available', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                ...EXISTING_KI,
                updatedAt: { toMillis: () => 1700000000000 },
                createdAt: { toMillis: () => 1690000000000 },
            }),
        });

        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        const versionData = mockBatchSet.mock.calls[0][1];
        // Should use updatedAt (more recent), not createdAt or Date.now()
        expect(versionData.createdAt).toBe(1700000000000);
    });

    it('falls back to createdAt.toMillis() when updatedAt is absent', async () => {
        mockDocGet.mockResolvedValue({
            exists: true,
            data: () => ({
                ...EXISTING_KI,
                createdAt: { toMillis: () => 1690000000000 },
                // no updatedAt
            }),
        });

        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        const versionData = mockBatchSet.mock.calls[0][1];
        expect(versionData.createdAt).toBe(1690000000000);
    });

    // =========================================================================
    // W4: Batch failure propagation
    // =========================================================================

    it('propagates batch.commit() failure as uncaught error', async () => {
        mockBatchCommit.mockRejectedValueOnce(new Error('Firestore batch failed'));

        await expect(
            handleEditKnowledge({ kiId: 'ki-123', content: 'New content' }, CTX),
        ).rejects.toThrow('Firestore batch failed');
    });

    // =========================================================================
    // W5: Version snapshot uses correct subcollection path
    // =========================================================================

    it('creates version snapshot in the correct subcollection path', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', content: 'New content' },
            CTX,
        );

        // mockCollectionDoc is called with the collection path
        expect(mockCollectionDoc).toHaveBeenCalledWith(
            'users/user1/channels/ch1/knowledgeItems/ki-123/versions',
        );
    });

    // =========================================================================
    // F2: Old entity doc missing — skip decrement gracefully
    // =========================================================================

    it('skips decrement when old entity doc does not exist (deleted video)', async () => {
        // First get(): KI doc exists. Second get(): old entity doc does NOT exist.
        mockDocGet
            .mockResolvedValueOnce({ exists: true, data: () => ({ ...EXISTING_KI }) })
            .mockResolvedValueOnce({ exists: false }); // old video doc was deleted

        const result = await handleEditKnowledge(
            { kiId: 'ki-123', videoId: null },
            CTX,
        );

        expect(result.scope).toBe('channel');
        expect(result.content).toContain('updated');

        // batch.update: main doc + new entity (increment) only — NO old entity decrement
        expect(mockBatchUpdate).toHaveBeenCalledTimes(2);

        // Main doc
        expect(mockBatchUpdate.mock.calls[0][0].path).toContain('knowledgeItems/ki-123');

        // New entity (channel): increment
        expect(mockBatchUpdate.mock.calls[1][0].path).toBe('users/user1/channels/ch1');
        expect(mockBatchUpdate.mock.calls[1][1].knowledgeItemCount).toBe('INCREMENT(1)');

        // Batch should still commit successfully
        expect(mockBatchCommit).toHaveBeenCalledOnce();
    });

    // =========================================================================
    // Registry: no description field (W2 fix)
    // =========================================================================

    it('registry update contains label and level but no description', async () => {
        await handleEditKnowledge(
            { kiId: 'ki-123', category: 'packaging-audit' },
            CTX,
        );

        const registryData = mockDocSet.mock.calls[0][0];
        const entry = registryData['categories.packaging-audit'];
        expect(entry.label).toBe('Packaging Audit');
        expect(entry.level).toBe('video'); // scope unchanged, still video
        expect(entry).not.toHaveProperty('description');
    });

    // =========================================================================
    // Operations-based editing (patch mode)
    // =========================================================================

    describe('operations-based editing', () => {
        // --- Mutual exclusion ---

        it('rejects when both content and operations are provided', async () => {
            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    content: 'full rewrite',
                    operations: [{ type: 'replace', old_string: '45%', new_string: '50%' }],
                },
                CTX,
            );

            expect(result.error).toContain("Cannot use both");
            expect(mockBatchCommit).not.toHaveBeenCalled();
        });

        it('empty operations array triggers applyOperations error, not "no fields"', async () => {
            const result = await handleEditKnowledge(
                { kiId: 'ki-123', operations: [] },
                CTX,
            );

            expect(result.error).toContain("empty");
            expect(mockBatchCommit).not.toHaveBeenCalled();
        });

        // --- Happy path: replace ---

        it('replace operation patches content, creates version snapshot', async () => {
            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: '45%', new_string: '50%' }],
                },
                CTX,
            );

            expect(result.error).toBeUndefined();
            expect(result.content).toContain('updated');

            // Version snapshot contains OLD content
            expect(mockBatchSet).toHaveBeenCalledTimes(1);
            const versionData = mockBatchSet.mock.calls[0][1];
            expect(versionData.content).toBe('## Old Traffic Analysis\nBrowse 45%...');

            // Main doc update contains PATCHED content
            const updateCalls = mockBatchUpdate.mock.calls;
            const mainDocUpdate = updateCalls.find(
                (call: unknown[]) => (call[0] as { path: string }).path.includes('knowledgeItems/ki-123'),
            );
            expect(mainDocUpdate).toBeDefined();
            expect(mainDocUpdate![1].content).toBe('## Old Traffic Analysis\nBrowse 50%...');

            // contentLength reflects patched content
            expect(result.contentLength).toBe('## Old Traffic Analysis\nBrowse 50%...'.length);

            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
        });

        it('resolveContentVideoRefs called with patched content', async () => {
            await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: '45%', new_string: '50%' }],
                },
                CTX,
            );

            expect(mockResolveContentVideoRefs).toHaveBeenCalledWith(
                '## Old Traffic Analysis\nBrowse 50%...',
                expect.any(String),
                expect.any(Object),
                'editKnowledge',
            );
        });

        // --- Happy path: insert_after ---

        it('insert_after appends content after anchor', async () => {
            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'insert_after', anchor: 'Browse 45%...', content: '\nDirect 30%' }],
                },
                CTX,
            );

            expect(result.error).toBeUndefined();
            const mainDocUpdate = mockBatchUpdate.mock.calls.find(
                (call: unknown[]) => (call[0] as { path: string }).path.includes('knowledgeItems/ki-123'),
            );
            expect(mainDocUpdate![1].content).toBe('## Old Traffic Analysis\nBrowse 45%...\nDirect 30%');
        });

        // --- Happy path: insert_before ---

        it('insert_before prepends content before anchor', async () => {
            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'insert_before', anchor: '## Old Traffic', content: '## Preamble\n' }],
                },
                CTX,
            );

            expect(result.error).toBeUndefined();
            const mainDocUpdate = mockBatchUpdate.mock.calls.find(
                (call: unknown[]) => (call[0] as { path: string }).path.includes('knowledgeItems/ki-123'),
            );
            expect(mainDocUpdate![1].content).toBe('## Preamble\n## Old Traffic Analysis\nBrowse 45%...');
        });

        // --- Operations + metadata ---

        it('operations + title update in same call', async () => {
            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: '45%', new_string: '50%' }],
                    title: 'Updated Traffic Analysis',
                },
                CTX,
            );

            expect(result.error).toBeUndefined();
            expect(result.title).toBe('Updated Traffic Analysis');

            const mainDocUpdate = mockBatchUpdate.mock.calls.find(
                (call: unknown[]) => (call[0] as { path: string }).path.includes('knowledgeItems/ki-123'),
            );
            expect(mainDocUpdate![1].content).toBe('## Old Traffic Analysis\nBrowse 50%...');
            expect(mainDocUpdate![1].title).toBe('Updated Traffic Analysis');
        });

        // --- Operations error: not found ---

        it('operations error (not found) returns error, no batch commit', async () => {
            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: 'nonexistent text', new_string: 'x' }],
                },
                CTX,
            );

            expect(result.error).toContain('not found');
            expect(mockBatchCommit).not.toHaveBeenCalled();
            expect(mockBatchSet).not.toHaveBeenCalled();
        });

        // --- Operations error: multiple matches ---

        it('operations error (multiple matches) returns error, no batch commit', async () => {
            mockDocGet.mockResolvedValue({
                exists: true,
                data: () => ({ ...EXISTING_KI, content: 'duplicated word duplicated word' }),
            });

            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: 'duplicated', new_string: 'x' }],
                },
                CTX,
            );

            expect(result.error).toContain('found');
            expect(mockBatchCommit).not.toHaveBeenCalled();
        });

        // --- Operations unchanged content ---

        it('operations resulting in same content returns "unchanged"', async () => {
            const result = await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: '45%', new_string: '45%' }],
                },
                CTX,
            );

            expect(result.content).toContain('unchanged');
            expect(mockBatchCommit).not.toHaveBeenCalled();
        });

        // --- Provenance ---

        it('operations set lastEditSource: "chat-edit" and lastEditedBy', async () => {
            await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: '45%', new_string: '50%' }],
                },
                CTX,
            );

            const mainDocUpdate = mockBatchUpdate.mock.calls.find(
                (call: unknown[]) => (call[0] as { path: string }).path.includes('knowledgeItems/ki-123'),
            );
            expect(mainDocUpdate![1].lastEditSource).toBe('chat-edit');
            expect(mainDocUpdate![1].lastEditedBy).toBe('claude-sonnet-4-6');
        });

        it('operations with conclude context set lastEditSource: "conclude"', async () => {
            await handleEditKnowledge(
                {
                    kiId: 'ki-123',
                    operations: [{ type: 'replace', old_string: '45%', new_string: '50%' }],
                },
                { ...CTX, isConclude: true },
            );

            const mainDocUpdate = mockBatchUpdate.mock.calls.find(
                (call: unknown[]) => (call[0] as { path: string }).path.includes('knowledgeItems/ki-123'),
            );
            expect(mainDocUpdate![1].lastEditSource).toBe('conclude');
        });
    });
});

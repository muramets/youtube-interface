import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

const mockGetAll = vi.fn();
const mockGet = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

const createChainedQuery = () => ({
    where: (...args: unknown[]) => {
        mockWhere(...args);
        return createChainedQuery();
    },
    orderBy: (...args: unknown[]) => {
        mockOrderBy(...args);
        return createChainedQuery();
    },
    limit: () => createChainedQuery(),
    get: () => mockGet(),
});

vi.mock('../../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({ path, id: path.split('/').pop() }),
        getAll: (...refs: unknown[]) => mockGetAll(...refs),
        collection: () => createChainedQuery(),
    },
}));

import { handleGetKnowledge } from '../getKnowledge.js';

const CTX: ToolContext = { userId: 'user1', channelId: 'ch1' };

function makeSnap(id: string, data: Record<string, unknown>, exists = true) {
    return {
        id,
        exists,
        data: () => ({
            ...data,
            createdAt: { toDate: () => new Date('2026-03-10T12:00:00Z') },
        }),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('handleGetKnowledge', () => {
    it('fetches by IDs (batch read)', async () => {
        mockGetAll.mockResolvedValue([
            makeSnap('ki-1', {
                title: 'Traffic Analysis',
                content: '## Full content here',
                summary: 'Browse 45%',
                category: 'traffic-analysis',
                scope: 'video',
                model: 'claude-sonnet-4-6',
                toolsUsed: ['analyzeTrafficSources'],
                source: 'chat-tool',
            }),
        ]);

        const result = await handleGetKnowledge({ ids: ['ki-1'] }, CTX);

        expect(result.count).toBe(1);
        const parsed = JSON.parse(result.content as string);
        expect(parsed[0].content).toBe('## Full content here');
        expect(parsed[0].id).toBe('ki-1');

        // Lightweight items[] for frontend pill
        const items = result.items as Array<Record<string, unknown>>;
        expect(items).toHaveLength(1);
        expect(items[0]).toEqual({
            id: 'ki-1',
            title: 'Traffic Analysis',
            category: 'traffic-analysis',
            videoId: undefined,
            scope: 'video',
        });
    });

    it('fetches by filters (videoId + categories)', async () => {
        mockGet.mockResolvedValue({
            docs: [
                makeSnap('ki-2', {
                    title: 'Packaging Audit',
                    content: '## Audit content',
                    summary: 'CTR improved',
                    category: 'packaging-audit',
                    scope: 'video',
                    videoId: 'vid-abc',
                    model: 'claude-sonnet-4-6',
                    toolsUsed: [],
                    source: 'chat-tool',
                }),
            ],
        });

        const result = await handleGetKnowledge(
            { videoId: 'vid-abc', categories: ['packaging-audit'] },
            CTX,
        );

        expect(result.count).toBe(1);
        expect(mockWhere).toHaveBeenCalledWith('videoId', '==', 'vid-abc');
        expect(mockWhere).toHaveBeenCalledWith('category', 'in', ['packaging-audit']);

        // items[] includes videoId when present
        const items = result.items as Array<Record<string, unknown>>;
        expect(items).toHaveLength(1);
        expect(items[0].videoId).toBe('vid-abc');
    });

    it('returns error when no filters provided', async () => {
        const result = await handleGetKnowledge({}, CTX);

        expect(result.error).toContain('At least one filter');
    });

    it('returns empty result when no items found', async () => {
        mockGetAll.mockResolvedValue([makeSnap('ki-x', {}, false)]);

        const result = await handleGetKnowledge({ ids: ['ki-x'] }, CTX);

        expect(result.items).toEqual([]);
        expect(result.count).toBe(0);
        expect(result.content).toContain('No Knowledge Items found');
    });

    it('includes full content and all metadata fields', async () => {
        mockGetAll.mockResolvedValue([
            makeSnap('ki-3', {
                title: 'Full Item',
                content: '## Full markdown',
                summary: 'Summary text',
                category: 'traffic-analysis',
                scope: 'video',
                videoId: 'vid-abc',
                videoRefs: ['vid-other'],
                model: 'claude-sonnet-4-6',
                toolsUsed: ['analyzeTrafficSources', 'getMultipleVideoDetails'],
                source: 'conclude',
            }),
        ]);

        const result = await handleGetKnowledge({ ids: ['ki-3'] }, CTX);

        const parsed = JSON.parse(result.content as string);
        const item = parsed[0];
        expect(item.content).toBe('## Full markdown');
        expect(item.videoRefs).toEqual(['vid-other']);
        expect(item.toolsUsed).toEqual(['analyzeTrafficSources', 'getMultipleVideoDetails']);
    });
});

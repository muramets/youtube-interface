import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../../types.js';

// --- Mock Firestore ---

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
        collection: () => createChainedQuery(),
    },
}));

import { handleListKnowledge } from '../listKnowledge.js';

const CTX: ToolContext = { userId: 'user1', channelId: 'ch1' };

function makeDoc(id: string, data: Record<string, unknown>) {
    return {
        id,
        data: () => ({
            ...data,
            createdAt: { toDate: () => new Date('2026-03-10T12:00:00Z') },
        }),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('handleListKnowledge', () => {
    it('returns items with summary but not content', async () => {
        mockGet.mockResolvedValue({
            docs: [
                makeDoc('ki-1', {
                    title: 'Traffic Analysis',
                    summary: 'Browse 45%, Suggested 35%',
                    content: 'FULL CONTENT SHOULD NOT APPEAR',
                    category: 'traffic-analysis',
                    scope: 'video',
                    videoId: 'vid-abc',
                    model: 'claude-sonnet-4-6',
                    toolsUsed: ['analyzeTrafficSources'],
                    source: 'chat-tool',
                }),
            ],
        });

        const result = await handleListKnowledge({}, CTX);

        expect(result.count).toBe(1);
        const parsed = JSON.parse(result.content as string);
        expect(parsed[0].summary).toBe('Browse 45%, Suggested 35%');
        expect(parsed[0]).not.toHaveProperty('content');
    });

    it('returns empty message when no items found', async () => {
        mockGet.mockResolvedValue({ docs: [] });

        const result = await handleListKnowledge({ videoId: 'vid-none' }, CTX);

        expect(result.items).toEqual([]);
        expect(result.content).toContain('No Knowledge Items found');
    });

    it('applies videoId filter', async () => {
        mockGet.mockResolvedValue({ docs: [] });

        await handleListKnowledge({ videoId: 'vid-abc' }, CTX);

        expect(mockWhere).toHaveBeenCalledWith('videoId', '==', 'vid-abc');
    });

    it('applies scope filter', async () => {
        mockGet.mockResolvedValue({ docs: [] });

        await handleListKnowledge({ scope: 'channel' }, CTX);

        expect(mockWhere).toHaveBeenCalledWith('scope', '==', 'channel');
    });

    it('applies category filter', async () => {
        mockGet.mockResolvedValue({ docs: [] });

        await handleListKnowledge({ category: 'traffic-analysis' }, CTX);

        expect(mockWhere).toHaveBeenCalledWith('category', '==', 'traffic-analysis');
    });
});

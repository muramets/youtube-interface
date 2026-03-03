import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetMultipleVideoDetails } from '../getMultipleVideoDetails.js';
import type { ToolContext } from '../../types.js';

// --- Mock Firestore ---

const mockGetAll = vi.fn();

vi.mock('../../../../shared/db.js', () => ({
    db: {
        doc: (path: string) => ({ path }),
        getAll: (..._refs: unknown[]) => mockGetAll(..._refs),
    },
}));

const CTX: ToolContext = { userId: 'user1', channelId: 'ch1' };

function makeSnap(exists: boolean, data?: Record<string, unknown>) {
    return { exists, data: () => data };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getMultipleVideoDetails — thumbnail field bugfix', () => {
    it('reads thumbnail field (not thumbnailUrl) from Firestore', async () => {
        // Firestore doc has `thumbnail` — the real field written by sync.ts
        const snap = makeSnap(true, {
            title: 'Test Video',
            thumbnail: 'https://cdn/real-thumbnail.jpg',
            // thumbnailUrl is intentionally absent — it was a frontend adapter name
        });

        mockGetAll
            .mockResolvedValueOnce([snap])   // videos/ collection
            .mockResolvedValueOnce([makeSnap(false)]); // cached_suggested/ not needed

        const result = await handleGetMultipleVideoDetails({ videoIds: ['vid1'] }, CTX) as {
            videos: Array<{ thumbnailUrl: string }>;
        };

        expect(result.videos[0].thumbnailUrl).toBe('https://cdn/real-thumbnail.jpg');
    });

    it('returns undefined thumbnailUrl when thumbnail field is absent', async () => {
        const snap = makeSnap(true, { title: 'No Thumb' });

        mockGetAll
            .mockResolvedValueOnce([snap])
            .mockResolvedValueOnce([makeSnap(false)]);

        const result = await handleGetMultipleVideoDetails({ videoIds: ['vid1'] }, CTX) as {
            videos: Array<{ thumbnailUrl: unknown }>;
        };

        expect(result.videos[0].thumbnailUrl).toBeUndefined();
    });
});

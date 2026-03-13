// =============================================================================
// knowledgeCategoryService — unit tests
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDoc = vi.fn().mockReturnValue('DOC_REF');

vi.mock('firebase/firestore', () => ({
    doc: (...args: unknown[]) => mockDoc(...args),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));

vi.mock('../../../../config/firebase', () => ({
    db: 'MOCK_DB',
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { KnowledgeCategoryService } from '../knowledgeCategoryService';
import { SEED_CATEGORIES } from '../../../types/knowledge';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeCategoryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getCategories', () => {
        it('returns categories from Firestore when registry exists', async () => {
            const mockCategories = {
                'traffic-analysis': { label: 'Traffic Analysis', level: 'video', description: 'Traffic desc' },
                'custom-cat': { label: 'Custom', level: 'channel', description: 'Custom desc' },
            };

            mockGetDoc.mockResolvedValue({
                exists: () => true,
                data: () => ({ categories: mockCategories }),
            });

            const result = await KnowledgeCategoryService.getCategories('user-1', 'chan-1');

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                slug: 'traffic-analysis',
                label: 'Traffic Analysis',
                level: 'video',
                description: 'Traffic desc',
            });
            expect(result[1]).toEqual({
                slug: 'custom-cat',
                label: 'Custom',
                level: 'channel',
                description: 'Custom desc',
            });
        });

        it('returns seed categories when registry does not exist', async () => {
            mockGetDoc.mockResolvedValue({
                exists: () => false,
            });

            const result = await KnowledgeCategoryService.getCategories('user-1', 'chan-1');

            // Should return all 10 seed categories (5 video + 5 channel)
            expect(result).toHaveLength(Object.keys(SEED_CATEGORIES).length);

            const slugs = result.map(c => c.slug);
            expect(slugs).toContain('traffic-analysis');
            expect(slugs).toContain('channel-journey');
        });

        it('converts map to array correctly preserving all fields', async () => {
            mockGetDoc.mockResolvedValue({
                exists: () => true,
                data: () => ({
                    categories: {
                        'test-slug': { label: 'Test', level: 'both', description: 'Test desc' },
                    },
                }),
            });

            const result = await KnowledgeCategoryService.getCategories('user-1', 'chan-1');

            expect(result).toEqual([
                { slug: 'test-slug', label: 'Test', level: 'both', description: 'Test desc' },
            ]);
        });
    });

    describe('ensureSeedCategories', () => {
        it('creates registry with seed categories when not exists', async () => {
            mockGetDoc.mockResolvedValue({ exists: () => false });
            mockSetDoc.mockResolvedValue(undefined);

            await KnowledgeCategoryService.ensureSeedCategories('user-1', 'chan-1');

            expect(mockSetDoc).toHaveBeenCalledOnce();
            const [, data] = mockSetDoc.mock.calls[0];
            expect(data.categories).toEqual(SEED_CATEGORIES);
        });

        it('does nothing when registry already exists', async () => {
            mockGetDoc.mockResolvedValue({
                exists: () => true,
                data: () => ({ categories: { 'existing': { label: 'Existing', level: 'video', description: 'desc' } } }),
            });

            await KnowledgeCategoryService.ensureSeedCategories('user-1', 'chan-1');

            expect(mockSetDoc).not.toHaveBeenCalled();
        });
    });
});

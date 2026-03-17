import { describe, it, expect } from 'vitest'
import { deriveCategories, filterAndSortItems } from '../knowledgeFilters'
import type { KnowledgeItem } from '../../../../core/types/knowledge'
import type { Timestamp } from 'firebase/firestore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<KnowledgeItem> & { scope: 'video' | 'channel'; category: string; seconds?: number }): KnowledgeItem {
    const { seconds = 1000, ...rest } = overrides
    return {
        id: `ki-${Math.random()}`,
        title: 'Test KI',
        content: '',
        summary: '',
        conversationId: '',
        model: '',
        toolsUsed: [],
        source: 'chat-tool',
        createdAt: { seconds } as Timestamp,
        ...rest,
    } as KnowledgeItem
}

const ITEMS: KnowledgeItem[] = [
    makeItem({ scope: 'channel', category: 'niche-analysis', seconds: 100 }),
    makeItem({ scope: 'channel', category: 'niche-analysis', seconds: 200 }),
    makeItem({ scope: 'channel', category: 'channel-journey', seconds: 300 }),
    makeItem({ scope: 'video', category: 'traffic-analysis', videoId: 'vid-1', seconds: 400 }),
    makeItem({ scope: 'video', category: 'traffic-analysis', videoId: 'vid-2', seconds: 500 }),
    makeItem({ scope: 'video', category: 'packaging-audit', videoId: 'vid-1', seconds: 600 }),
]

// ---------------------------------------------------------------------------
// deriveCategories
// ---------------------------------------------------------------------------

describe('deriveCategories', () => {
    it('returns all categories sorted by count when no scope filter', () => {
        const result = deriveCategories(ITEMS)
        expect(result).toEqual([
            { slug: 'niche-analysis', label: 'niche analysis', count: 2 },
            { slug: 'traffic-analysis', label: 'traffic analysis', count: 2 },
            { slug: 'channel-journey', label: 'channel journey', count: 1 },
            { slug: 'packaging-audit', label: 'packaging audit', count: 1 },
        ])
    })

    it('filters to channel-only categories', () => {
        const result = deriveCategories(ITEMS, 'channel')
        const slugs = result.map(c => c.slug)
        expect(slugs).toEqual(['niche-analysis', 'channel-journey'])
        expect(result[0].count).toBe(2)
        expect(result[1].count).toBe(1)
    })

    it('filters to video-only categories', () => {
        const result = deriveCategories(ITEMS, 'video')
        const slugs = result.map(c => c.slug)
        expect(slugs).toEqual(['traffic-analysis', 'packaging-audit'])
    })

    it('returns empty array for empty items', () => {
        expect(deriveCategories([])).toEqual([])
        expect(deriveCategories([], 'channel')).toEqual([])
    })

    it('converts kebab-case slugs to labels with spaces', () => {
        const result = deriveCategories([
            makeItem({ scope: 'channel', category: 'my-complex-category-name' }),
        ])
        expect(result[0].label).toBe('my complex category name')
    })
})

// ---------------------------------------------------------------------------
// filterAndSortItems
// ---------------------------------------------------------------------------

describe('filterAndSortItems', () => {
    it('returns all items sorted newest-first when no filters', () => {
        const result = filterAndSortItems(ITEMS, 'all', null, 'newest')
        expect(result).toHaveLength(6)
        // Newest = highest seconds first
        const seconds = result.map(i => i.createdAt?.seconds)
        expect(seconds).toEqual([600, 500, 400, 300, 200, 100])
    })

    it('sorts oldest-first', () => {
        const result = filterAndSortItems(ITEMS, 'all', null, 'oldest')
        const seconds = result.map(i => i.createdAt?.seconds)
        expect(seconds).toEqual([100, 200, 300, 400, 500, 600])
    })

    it('filters by scope=channel', () => {
        const result = filterAndSortItems(ITEMS, 'channel', null, 'newest')
        expect(result).toHaveLength(3)
        expect(result.every(i => i.scope === 'channel')).toBe(true)
    })

    it('filters by scope=video', () => {
        const result = filterAndSortItems(ITEMS, 'video', null, 'newest')
        expect(result).toHaveLength(3)
        expect(result.every(i => i.scope === 'video')).toBe(true)
    })

    it('filters by category (additive with scope=all)', () => {
        const result = filterAndSortItems(ITEMS, 'all', 'traffic-analysis', 'newest')
        expect(result).toHaveLength(2)
        expect(result.every(i => i.category === 'traffic-analysis')).toBe(true)
    })

    it('filters by scope + category combined', () => {
        const result = filterAndSortItems(ITEMS, 'video', 'packaging-audit', 'newest')
        expect(result).toHaveLength(1)
        expect(result[0].category).toBe('packaging-audit')
        expect(result[0].scope).toBe('video')
    })

    it('returns empty when no items match filters', () => {
        const result = filterAndSortItems(ITEMS, 'channel', 'traffic-analysis', 'newest')
        expect(result).toHaveLength(0)
    })

    it('does not mutate the original array', () => {
        const original = [...ITEMS]
        filterAndSortItems(ITEMS, 'all', null, 'oldest')
        expect(ITEMS.map(i => i.createdAt?.seconds)).toEqual(original.map(i => i.createdAt?.seconds))
    })
})

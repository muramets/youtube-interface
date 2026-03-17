import type { KnowledgeItem } from '../../../core/types/knowledge'
import type { KnowledgeScopeFilter } from '../../../core/stores/knowledgeStore'

interface CategoryChip {
    slug: string
    label: string
    count: number
}

/**
 * Derive category chips from items, optionally filtered by scope.
 * Returns categories sorted by count (descending).
 */
export function deriveCategories(
    items: KnowledgeItem[],
    scope?: 'video' | 'channel',
): CategoryChip[] {
    const catSet = new Map<string, number>()
    for (const item of items) {
        if (scope && item.scope !== scope) continue
        catSet.set(item.category, (catSet.get(item.category) ?? 0) + 1)
    }
    return Array.from(catSet.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([slug, count]) => ({ slug, label: slug.replace(/-/g, ' '), count }))
}

/**
 * Filter items by scope and category, then sort by createdAt.
 */
export function filterAndSortItems(
    items: KnowledgeItem[],
    scopeFilter: KnowledgeScopeFilter,
    selectedCategory: string | null,
    sortOrder: 'newest' | 'oldest',
): KnowledgeItem[] {
    let filtered = items
    if (scopeFilter !== 'all') {
        filtered = filtered.filter(i => i.scope === scopeFilter)
    }
    if (selectedCategory) {
        filtered = filtered.filter(i => i.category === selectedCategory)
    }
    return [...filtered].sort((a, b) => {
        const timeA = a.createdAt?.seconds ?? 0
        const timeB = b.createdAt?.seconds ?? 0
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB
    })
}

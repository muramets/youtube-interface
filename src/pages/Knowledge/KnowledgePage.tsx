import React, { useState, useCallback, useMemo } from 'react'
import { BookOpen, Plus, ArrowUpDown } from 'lucide-react'
import { Button } from '../../components/ui/atoms/Button/Button'
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip'
import { useAuth } from '../../core/hooks/useAuth'
import { useChannelStore } from '../../core/stores/channelStore'
import { useChannelKnowledgeItems, useUpdateKnowledgeItem, useCreateKnowledgeItem, useDeleteKnowledgeItem } from '../../core/hooks/useKnowledgeItems'
import { useVideos } from '../../core/hooks/useVideos'
import { useVideosCatalog } from '../../core/hooks/useVideosCatalog'
import { useKnowledgeStore } from '../../core/stores/knowledgeStore'
import { buildVideoRefMap } from '../../features/Knowledge/utils/videoRefMap'
import { KnowledgeList } from '../../features/Knowledge/components/KnowledgeList'
import { KnowledgeItemModal } from '../../features/Knowledge/modals/KnowledgeItemModal'
import { CreateKnowledgeItemModal } from '../../features/Knowledge/modals/CreateKnowledgeItemModal'
import type { KnowledgeItem } from '../../core/types/knowledge'

/**
 * KnowledgePage — channel-level Knowledge Items dashboard.
 *
 * Features:
 * - Category chip-row filter (derived from actual KI categories)
 * - Sort: newest / oldest
 * - KI cards with expand, Zen Mode, edit
 * - [+ Add] button for manual KI creation
 */
export const KnowledgePage: React.FC = () => {
    const { user } = useAuth()
    const { currentChannel } = useChannelStore()

    const userId = user?.uid ?? ''
    const channelId = currentChannel?.id ?? ''

    const { items, isLoading, error } = useChannelKnowledgeItems(userId, channelId)
    const { videos } = useVideos(userId, channelId)
    const updateMutation = useUpdateKnowledgeItem(userId, channelId)
    const createMutation = useCreateKnowledgeItem(userId, channelId)
    const deleteMutation = useDeleteKnowledgeItem(userId, channelId)

    const videoMap = useMemo(() => buildVideoRefMap(videos), [videos])
    const videoCatalog = useVideosCatalog()

    const { selectedCategory, sortOrder, setCategory, setSortOrder } = useKnowledgeStore()

    const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)

    // Derive unique categories from actual items
    const categories = useMemo(() => {
        const catSet = new Map<string, number>()
        for (const item of items) {
            catSet.set(item.category, (catSet.get(item.category) ?? 0) + 1)
        }
        return Array.from(catSet.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([slug, count]) => ({ slug, label: slug.replace(/-/g, ' '), count }))
    }, [items])

    // Filter + sort
    const displayItems = useMemo(() => {
        let filtered = items
        if (selectedCategory) {
            filtered = filtered.filter(i => i.category === selectedCategory)
        }
        return [...filtered].sort((a, b) => {
            const timeA = a.createdAt?.seconds ?? 0
            const timeB = b.createdAt?.seconds ?? 0
            return sortOrder === 'newest' ? timeB - timeA : timeA - timeB
        })
    }, [items, selectedCategory, sortOrder])

    const handleEdit = useCallback((item: KnowledgeItem) => {
        setEditingItem(item)
    }, [])

    const handleSaveEdit = useCallback((updates: { title: string; summary: string; content: string }) => {
        if (!editingItem) return
        updateMutation.mutate({ itemId: editingItem.id, updates, previousItem: editingItem })
    }, [editingItem, updateMutation])

    const handleCreate = useCallback((item: { category: string; title: string; content: string; summary: string }) => {
        createMutation.mutate({ ...item, scope: 'channel' })
    }, [createMutation])

    const handleDelete = useCallback((item: KnowledgeItem) => {
        deleteMutation.mutate(item.id)
    }, [deleteMutation])

    if (isLoading) {
        return (
            <div className="flex flex-col h-full">
                <div className="px-6 pt-6 pb-4">
                    <div className="h-8 w-48 bg-bg-secondary animate-pulse rounded-lg" />
                    <div className="flex gap-2 mt-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-8 w-24 bg-bg-secondary animate-pulse rounded-lg" />
                        ))}
                    </div>
                </div>
                <div className="flex-1 px-6 space-y-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-24 bg-bg-secondary animate-pulse rounded-lg" />
                    ))}
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full px-6">
                <p className="text-sm text-text-secondary">
                    Failed to load Knowledge Items. Try refreshing the page.
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 px-6 pt-6 pb-4">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                            <BookOpen size={20} className="text-accent" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-text-primary">Knowledge</h1>
                            <p className="text-xs text-text-secondary">
                                {items.length} {items.length === 1 ? 'item' : 'items'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <PortalTooltip content={sortOrder === 'newest' ? 'Newest First' : 'Oldest First'}>
                            <button
                                onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                                className="p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors cursor-pointer bg-transparent border-none"
                            >
                                <ArrowUpDown size={18} />
                            </button>
                        </PortalTooltip>
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Plus size={16} />}
                            onClick={() => setIsCreateOpen(true)}
                        >
                            Add
                        </Button>
                    </div>
                </div>

                {/* Filter bar: category chips */}
                {categories.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => setCategory(null)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer border-none ${
                                selectedCategory === null
                                    ? 'bg-text-primary text-bg-primary'
                                    : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                            }`}
                        >
                            All
                        </button>

                        {categories.map(cat => (
                            <button
                                key={cat.slug}
                                onClick={() => setCategory(selectedCategory === cat.slug ? null : cat.slug)}
                                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer border-none capitalize ${
                                    selectedCategory === cat.slug
                                        ? 'bg-text-primary text-bg-primary'
                                        : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                                }`}
                            >
                                {cat.label}
                                <span className="ml-1.5 opacity-50">{cat.count}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <KnowledgeList
                    items={displayItems}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    videoMap={videoMap}
                    emptyMessage={
                        selectedCategory
                            ? 'No Knowledge Items in this category yet.'
                            : 'No channel Knowledge Items yet. Use the chat to analyze your channel, or click "+ Add" to create one manually.'
                    }
                />
            </div>

            {/* Edit modal */}
            {editingItem && (
                <KnowledgeItemModal
                    item={editingItem}
                    onSave={handleSaveEdit}
                    onClose={() => setEditingItem(null)}
                    videoCatalog={videoCatalog}
                />
            )}

            {/* Create modal */}
            {isCreateOpen && (
                <CreateKnowledgeItemModal
                    onSave={handleCreate}
                    onClose={() => setIsCreateOpen(false)}
                    videoCatalog={videoCatalog}
                />
            )}
        </div>
    )
}

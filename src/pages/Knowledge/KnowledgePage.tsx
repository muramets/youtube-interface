import React, { useState, useCallback, useMemo } from 'react'
import { BookOpen, Plus, ArrowUpDown } from 'lucide-react'
import { Button } from '../../components/ui/atoms/Button/Button'
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip'
import { useAuth } from '../../core/hooks/useAuth'
import { useChannelStore } from '../../core/stores/channelStore'
import { useAllKnowledgeItems, useUpdateKnowledgeItem, useCreateKnowledgeItem, useDeleteKnowledgeItem } from '../../core/hooks/useKnowledgeItems'
import { useVideos } from '../../core/hooks/useVideos'
import { useVideosCatalog } from '../../core/hooks/useVideosCatalog'
import { useKnowledgeCatalog } from '../../core/hooks/useKnowledgeCatalog'
import { useKnowledgeStore, type KnowledgeScopeFilter } from '../../core/stores/knowledgeStore'
import { buildVideoRefMap } from '../../features/Knowledge/utils/videoRefMap'
import { KnowledgeList } from '../../features/Knowledge/components/KnowledgeList'
import { KnowledgeItemModal } from '../../features/Knowledge/modals/KnowledgeItemModal'
import { CreateKnowledgeItemModal } from '../../features/Knowledge/modals/CreateKnowledgeItemModal'
import { deriveCategories, filterAndSortItems } from '../../features/Knowledge/utils/knowledgeFilters'
import type { KnowledgeItem } from '../../core/types/knowledge'

const SCOPE_CHIPS: { value: KnowledgeScopeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'channel', label: 'Channel' },
    { value: 'video', label: 'Videos' },
]

/**
 * KnowledgePage — Knowledge Items dashboard (all scopes).
 *
 * Features:
 * - Multi-row filters: scope (All/Channel/Videos) + category chips per scope
 * - Sort: newest / oldest
 * - KI cards with expand, Zen Mode, edit, video linking
 * - [+ Add] button for manual KI creation
 */
export const KnowledgePage: React.FC = () => {
    const { user } = useAuth()
    const { currentChannel } = useChannelStore()

    const userId = user?.uid ?? ''
    const channelId = currentChannel?.id ?? ''

    const { items, isLoading, error } = useAllKnowledgeItems(userId, channelId)
    const { videos } = useVideos(userId, channelId)
    const updateMutation = useUpdateKnowledgeItem(userId, channelId)
    const createMutation = useCreateKnowledgeItem(userId, channelId)
    const deleteMutation = useDeleteKnowledgeItem(userId, channelId)

    const videoMap = useMemo(() => buildVideoRefMap(videos), [videos])
    const videoCatalog = useVideosCatalog()
    const knowledgeCatalog = useKnowledgeCatalog()

    const { scopeFilter, selectedCategory, sortOrder, setScopeFilter, setCategory, setSortOrder } = useKnowledgeStore()

    const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null)
    const [isCreateOpen, setIsCreateOpen] = useState(false)

    // Scope counts for chip badges
    const scopeCounts = useMemo(() => {
        let channel = 0
        let video = 0
        for (const item of items) {
            if (item.scope === 'channel') channel++
            else video++
        }
        return { all: items.length, channel, video }
    }, [items])

    // Categories per scope (for conditional rows)
    const channelCategories = useMemo(() => deriveCategories(items, 'channel'), [items])
    const videoCategories = useMemo(() => deriveCategories(items, 'video'), [items])

    // Show category rows based on scope filter
    const showChannelCats = scopeFilter === 'all' || scopeFilter === 'channel'
    const showVideoCats = scopeFilter === 'all' || scopeFilter === 'video'

    // Filter + sort
    const displayItems = useMemo(
        () => filterAndSortItems(items, scopeFilter, selectedCategory, sortOrder),
        [items, scopeFilter, selectedCategory, sortOrder],
    )

    const handleEdit = useCallback((item: KnowledgeItem) => {
        setEditingItem(item)
    }, [])

    const handleSaveEdit = useCallback((updates: {
        title: string;
        summary: string;
        content: string;
        videoId?: string;
        scope?: 'video' | 'channel';
        skipVersioning?: boolean;
        lastEditSource?: string;
        lastEditedBy?: string;
    }) => {
        if (!editingItem) return
        const { skipVersioning, ...firestoreUpdates } = updates
        updateMutation.mutate({
            itemId: editingItem.id,
            updates: firestoreUpdates,
            previousItem: skipVersioning ? undefined : editingItem,
        })
    }, [editingItem, updateMutation])

    const handleCreate = useCallback((item: { category: string; title: string; content: string; summary: string }) => {
        createMutation.mutate({ ...item, scope: 'channel' })
    }, [createMutation])

    const handleDelete = useCallback((item: KnowledgeItem) => {
        deleteMutation.mutate(item.id)
    }, [deleteMutation])

    if (isLoading) {
        return (
            <div className="flex flex-col min-h-[calc(100vh-56px)]">
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
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-6">
                <p className="text-sm text-text-secondary">
                    Failed to load Knowledge Items. Try refreshing the page.
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-56px)]">
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

                {/* Row 1: Scope filter */}
                <div className="flex items-center gap-2 flex-wrap">
                    {SCOPE_CHIPS.map(chip => (
                        <button
                            key={chip.value}
                            onClick={() => setScopeFilter(chip.value)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer border-none ${
                                scopeFilter === chip.value
                                    ? 'bg-text-primary text-bg-primary'
                                    : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                            }`}
                        >
                            {chip.label}
                            <span className="ml-1.5 opacity-50">{scopeCounts[chip.value]}</span>
                        </button>
                    ))}
                </div>

                {/* Row 2: Channel categories */}
                {showChannelCats && channelCategories.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium w-14 flex-shrink-0">Channel</span>
                        {channelCategories.map(cat => (
                            <button
                                key={`ch-${cat.slug}`}
                                onClick={() => setCategory(selectedCategory === cat.slug ? null : cat.slug)}
                                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer border-none capitalize ${
                                    selectedCategory === cat.slug
                                        ? 'bg-text-primary text-bg-primary'
                                        : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                                }`}
                            >
                                {cat.label}
                                <span className="ml-1 opacity-50">{cat.count}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Row 3: Video categories */}
                {showVideoCats && videoCategories.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium w-14 flex-shrink-0">Video</span>
                        {videoCategories.map(cat => (
                            <button
                                key={`vid-${cat.slug}`}
                                onClick={() => setCategory(selectedCategory === cat.slug ? null : cat.slug)}
                                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer border-none capitalize ${
                                    selectedCategory === cat.slug
                                        ? 'bg-text-primary text-bg-primary'
                                        : 'bg-bg-secondary text-text-primary hover:bg-hover-bg'
                                }`}
                            >
                                {cat.label}
                                <span className="ml-1 opacity-50">{cat.count}</span>
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
                    showLinkedVideo
                    emptyMessage={
                        selectedCategory || scopeFilter !== 'all'
                            ? 'No Knowledge Items match these filters.'
                            : 'No Knowledge Items yet. Use the chat to analyze your channel, or click "+ Add" to create one manually.'
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
                    knowledgeCatalog={knowledgeCatalog}
                />
            )}

            {/* Create modal */}
            {isCreateOpen && (
                <CreateKnowledgeItemModal
                    onSave={handleCreate}
                    onClose={() => setIsCreateOpen(false)}
                    videoCatalog={videoCatalog}
                    knowledgeCatalog={knowledgeCatalog}
                />
            )}
        </div>
    )
}

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Bot, Calendar, Tag, Wrench } from 'lucide-react'
import { Button } from '../../../components/ui/atoms/Button/Button'
import { Badge } from '../../../components/ui/atoms/Badge/Badge'
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor'
import { VersionDropdown } from '../components/VersionDropdown'
import { LiveDiffPanel } from '../components/LiveDiffPanel'
import { useKnowledgeVersions } from '../../../core/hooks/useKnowledgeVersions'
import { useAuth } from '../../../core/hooks/useAuth'
import { useChannelStore } from '../../../core/stores/channelStore'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import type { VideoPreviewData } from '../../Video/types'
import { VideoLinkField } from '../components/VideoLinkField'
import { formatKnowledgeDate, formatVersionLabel } from '../utils/formatDate'

interface KnowledgeItemModalProps {
    /** The Knowledge Item to edit */
    item: KnowledgeItem
    /** Called with updated fields when user saves */
    onSave: (updates: {
        title: string;
        summary: string;
        content: string;
        videoId?: string;
        scope?: 'video' | 'channel';
    }) => void
    /** Called when modal should close */
    onClose: () => void
    /** Video catalog for @-autocomplete and vid:// tooltips */
    videoCatalog?: VideoPreviewData[]
}

/**
 * KnowledgeItemModal — edit modal for a Knowledge Item.
 *
 * Features:
 * - Title editing (text input)
 * - Content editing (RichTextEditor — WYSIWYG with markdown storage)
 * - Provenance metadata displayed as read-only (model, toolsUsed, createdAt, source)
 * - Expanded mode: version dropdown + live diff panel alongside editor
 * - Save / Cancel actions
 */
export const KnowledgeItemModal = React.memo(({
    item,
    onSave,
    onClose,
    videoCatalog,
}: KnowledgeItemModalProps) => {
    const { user } = useAuth()
    const { currentChannel } = useChannelStore()
    const userId = user?.uid ?? ''
    const channelId = currentChannel?.id ?? ''

    const [title, setTitle] = useState(item.title)
    const [summary, setSummary] = useState(item.summary)
    const [content, setContent] = useState(item.content)
    const [linkedVideoId, setLinkedVideoId] = useState<string | undefined>(item.videoId)

    const { versions, deleteVersion } = useKnowledgeVersions(userId, channelId, item.id)
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)

    // Build videoMap from videoCatalog for diff panel vid:// link rendering
    const videoMap = useMemo(() => {
        if (!videoCatalog?.length) return undefined
        const map = new Map<string, VideoPreviewData>()
        for (const v of videoCatalog) {
            map.set(v.videoId, v)
            if (v.youtubeVideoId && v.youtubeVideoId !== v.videoId) {
                map.set(v.youtubeVideoId, v)
            }
        }
        return map
    }, [videoCatalog])

    const selectedVersion = selectedVersionId
        ? versions.find(v => v.id === selectedVersionId)
        : null

    // ESC to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleSave = useCallback(() => {
        const videoChanged = linkedVideoId !== item.videoId
        const updates: Parameters<typeof onSave>[0] = {
            title: title.trim(),
            summary: summary.trim(),
            content,
        }
        if (videoChanged) {
            updates.videoId = linkedVideoId
            updates.scope = linkedVideoId ? 'video' : 'channel'
        }
        onSave(updates)
        onClose()
    }, [title, summary, content, linkedVideoId, item.videoId, onSave, onClose])

    const hasChanges = title.trim() !== item.title
        || summary.trim() !== item.summary
        || content !== item.content
        || linkedVideoId !== item.videoId
    const dateStr = formatKnowledgeDate(item.createdAt)

    // --- Expanded mode slots ---

    const expandedToolbarExtra = useMemo(() => (
        <VersionDropdown
            versions={versions}
            selectedVersionId={selectedVersionId}
            onSelect={setSelectedVersionId}
            onDelete={deleteVersion}
            currentSource={item.source}
            currentModel={item.model}
            currentDate={dateStr}
        />
    ), [versions, selectedVersionId, deleteVersion, item.source, item.model, dateStr])

    const expandedSidePanel = selectedVersion ? (
        <LiveDiffPanel
            oldContent={selectedVersion.content}
            newContent={content}
            label={formatVersionLabel(selectedVersion.createdAt, selectedVersion.source)}
            videoMap={videoMap}
            onClose={() => setSelectedVersionId(null)}
        />
    ) : undefined

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onMouseDown={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl w-[800px] max-w-[95vw] max-h-[90vh]"
                onMouseDown={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border flex-shrink-0">
                    <h2 className="text-lg font-bold text-text-primary m-0">Edit Knowledge Item</h2>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* Provenance (read-only) */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary bg-bg-primary/50 rounded-lg px-3 py-2">
                        <span className="flex items-center gap-1">
                            <Tag size={12} />
                            {item.category.replace(/-/g, ' ')}
                        </span>
                        <span className="flex items-center gap-1">
                            <Bot size={12} />
                            {item.model}
                        </span>
                        <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {dateStr}
                        </span>
                        {item.toolsUsed?.length > 0 && (
                            <span className="flex items-center gap-1">
                                <Wrench size={12} />
                                {item.toolsUsed?.join(', ')}
                            </span>
                        )}
                        <Badge variant="neutral">
                            {item.source === 'manual' ? 'Manual' : item.source === 'conclude' ? 'via Memorize' : 'Chat'}
                        </Badge>
                    </div>

                    {/* Title input */}
                    <div>
                        <label className="block text-xs text-text-secondary font-medium mb-1.5 uppercase tracking-wider">
                            Title
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-input-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none hover:border-text-primary focus:border-text-primary transition-colors"
                            placeholder="Knowledge Item title..."
                        />
                    </div>

                    {/* Linked Video */}
                    {videoCatalog && videoCatalog.length > 0 && (
                        <VideoLinkField
                            videoId={linkedVideoId}
                            videoCatalog={videoCatalog}
                            onChange={setLinkedVideoId}
                        />
                    )}

                    {/* Summary input */}
                    <div>
                        <label className="block text-xs text-text-secondary font-medium mb-1.5 uppercase tracking-wider">
                            Summary
                        </label>
                        <textarea
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            rows={4}
                            className="w-full bg-input-bg border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary outline-none hover:border-text-primary focus:border-text-primary transition-colors resize-none"
                            placeholder="2-3 sentence summary for quick reference..."
                        />
                    </div>

                    {/* Content editor */}
                    <div>
                        <label className="block text-xs text-text-secondary font-medium mb-1.5 uppercase tracking-wider">
                            Content
                        </label>
                        <RichTextEditor
                            value={content}
                            onChange={setContent}
                            placeholder="Write your analysis..."
                            videoCatalog={videoCatalog}
                            expandedToolbarExtra={expandedToolbarExtra}
                            expandedSidePanel={expandedSidePanel}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30 flex-shrink-0">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!hasChanges || !title.trim()}
                    >
                        Save Changes
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    )
})

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Minimize, Bot, Calendar, Tag } from 'lucide-react'
import { CollapsibleMarkdownSections } from './CollapsibleMarkdownSections'
import { formatKnowledgeDate, formatVersionLabel } from '../utils/formatDate'
import { VersionDropdown } from './VersionDropdown'
import { RenderedDiffViewer } from './RenderedDiffViewer'
import { useKnowledgeVersions } from '../../../core/hooks/useKnowledgeVersions'
import { useAuth } from '../../../core/hooks/useAuth'
import { useChannelStore } from '../../../core/stores/channelStore'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import type { VideoPreviewData } from '../../Video/types'

interface KnowledgeViewerProps {
    /** Full Knowledge Item object */
    item: KnowledgeItem
    /** Pre-processed content (with linkified video refs) */
    content: string
    /** Called when the viewer should close */
    onClose: () => void
    /** Video data map for vid:// link tooltips */
    videoMap?: Map<string, VideoPreviewData>
}

/**
 * KnowledgeViewer — Zen Mode
 *
 * Fullscreen read-only overlay for viewing Knowledge Item content.
 * Portal + CSS transition + backdrop blur.
 * Includes version history dropdown. When a version is selected,
 * shows split-view DiffViewer (old version vs current) and expands to near-fullscreen.
 *
 * Closes on: ESC key, backdrop click, or close button.
 */
export const KnowledgeViewer = React.memo(({
    item,
    content,
    onClose,
    videoMap,
}: KnowledgeViewerProps) => {
    const { user } = useAuth()
    const { currentChannel } = useChannelStore()
    const userId = user?.uid ?? ''
    const channelId = currentChannel?.id ?? ''

    const { versions, deleteVersion } = useKnowledgeVersions(userId, channelId, item.id)
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)

    const selectedVersion = selectedVersionId
        ? versions.find(v => v.id === selectedVersionId)
        : null

    const isDiffActive = !!selectedVersion
    const dateStr = item.createdAt ? formatKnowledgeDate(item.createdAt) : ''
    const currentDateStr = formatKnowledgeDate(item.updatedAt ?? item.createdAt, true)
    const originSource = item.source
    const editSource = item.lastEditSource
    const currentModel = item.lastEditedBy ?? item.model

    // Fade-in via CSS transition (immune to style-recalc animation restarts).
    // useEffect sets mounted=true on next frame → opacity transitions from 0 to 1.
    const [mounted, setMounted] = useState(false)
    const backdropRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        requestAnimationFrame(() => setMounted(true))
    }, [])

    // Lock body scroll while Zen Mode is open
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    // ESC to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    // Container class: near-fullscreen when diff active, normal max-w-4xl otherwise
    const containerClass = isDiffActive
        ? 'bg-bg-secondary w-full max-w-[100vw] h-[90vh] rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col relative transition-[max-width] duration-300 ease-out'
        : 'bg-bg-secondary w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col relative transition-[max-width] duration-300 ease-out'

    // Backdrop always covers full viewport; padding on the inner flex container controls spacing
    const outerPadding = isDiffActive ? 'p-4 sm:p-8' : 'p-10'

    return createPortal(
        <div
            ref={backdropRef}
            className={`fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${outerPadding}`}
            style={{ opacity: mounted ? 1 : 0 }}
            onClick={onClose}
        >
            <div
                className={`${containerClass} transition-[transform,opacity] duration-300`}
                style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.95)' }}
                onClick={(e) => e.stopPropagation()}
            >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-secondary">
                        <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                            <h2 className="text-sm font-medium text-text-primary truncate">
                                {item.title}
                            </h2>
                            <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
                                <span className="flex items-center gap-1">
                                    <Tag size={10} />
                                    {item.category.replace(/-/g, ' ')}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Bot size={10} />
                                    {item.model}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Calendar size={10} />
                                    {dateStr}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <VersionDropdown
                                versions={versions}
                                selectedVersionId={selectedVersionId}
                                onSelect={setSelectedVersionId}
                                onDelete={deleteVersion}
                                originSource={originSource}
                                editSource={editSource}
                                currentModel={currentModel}
                                currentDate={currentDateStr}
                            />
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-hover-bg rounded-full text-text-secondary transition-colors"
                                title="Close Zen Mode"
                            >
                                <Minimize className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content: RenderedDiffViewer when version selected, RichTextViewer otherwise */}
                    {isDiffActive ? (
                        <div className="flex-1 overflow-hidden">
                            <RenderedDiffViewer
                                oldContent={selectedVersion.content}
                                newContent={item.content}
                                oldLabel={formatVersionLabel(selectedVersion.createdAt, selectedVersion.source)}
                                newLabel="Current"
                                videoMap={videoMap}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8">
                            <CollapsibleMarkdownSections
                                content={content}
                                videoMap={videoMap}
                                defaultOpenLevel={3}
                            />
                        </div>
                    )}
            </div>
        </div>,
        document.body
    )
})

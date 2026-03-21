import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Bot, Calendar, Tag, Wrench } from 'lucide-react'
import { Button } from '../../../components/ui/atoms/Button/Button'
import { Badge } from '../../../components/ui/atoms/Badge/Badge'
import { ConfirmationModal } from '../../../components/ui/organisms/ConfirmationModal'
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor'
import { VersionDropdown } from '../components/VersionDropdown'
import { LiveDiffPanel } from '../components/LiveDiffPanel'
import { useKnowledgeVersions } from '../../../core/hooks/useKnowledgeVersions'
import { useAuth } from '../../../core/hooks/useAuth'
import { useChannelStore } from '../../../core/stores/channelStore'
import type { KnowledgeItem, KnowledgeVersionWithId } from '../../../core/types/knowledge'
import type { VideoPreviewData } from '../../Video/types'
import type { KiPreviewData } from '../../../components/ui/organisms/RichTextEditor/types'
import { VideoLinkField } from '../components/VideoLinkField'
import { formatKnowledgeDate, formatVersionLabel, getOriginLabel } from '../utils/formatDate'
import type { KnowledgeItemSaveUpdates } from '../hooks/useKnowledgeSaveHandler'

interface KnowledgeItemModalProps {
    /** The Knowledge Item to edit */
    item: KnowledgeItem
    /** Called with updated fields when user saves */
    onSave: (updates: KnowledgeItemSaveUpdates) => void
    /** Called when modal should close */
    onClose: () => void
    /** Video catalog for @-autocomplete and vid:// tooltips */
    videoCatalog?: VideoPreviewData[]
    /** KI catalog for @-autocomplete and ki:// tooltips */
    knowledgeCatalog?: KiPreviewData[]
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
    knowledgeCatalog,
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
    const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
    const [restoredVersion, setRestoredVersion] = useState<KnowledgeVersionWithId | null>(null)
    const [oldCurrentSnapshot, setOldCurrentSnapshot] = useState<KnowledgeVersionWithId | null>(null)

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

    // Unsaved-changes guard — must be declared before ESC handler
    const hasChanges = title.trim() !== item.title
        || summary.trim() !== item.summary
        || content !== item.content
        || linkedVideoId !== item.videoId
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
    const handleClose = () => {
        if (hasChanges) {
            setShowUnsavedConfirm(true)
        } else {
            onClose()
        }
    }

    // ESC to close (with unsaved-changes guard)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (hasChanges) {
                    setShowUnsavedConfirm(true)
                } else {
                    onClose()
                }
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [hasChanges, onClose])

    // Lock body scroll while modal is open
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    const handleRestore = useCallback((versionId: string) => {
        const version = versions.find(v => v.id === versionId)
        if (!version) return

        // Capture old Current as a virtual version entry (shown as pending removal)
        const contentTs = item.updatedAt ?? item.createdAt
        const contentTimeMs = contentTs?.toDate?.()?.getTime()
            ?? ((contentTs as unknown as { seconds?: number })?.seconds
                ? (contentTs as unknown as { seconds: number }).seconds * 1000
                : Date.now())
        setOldCurrentSnapshot({
            id: 'pending-old-current',
            content: content,
            title: item.title,
            createdAt: contentTimeMs,
            source: item.source,
            model: item.model,
            lastEditSource: item.lastEditSource,
            lastEditedBy: item.lastEditedBy,
        })

        setContent(version.content)
        setRestoredVersion(version)
        // Versions NEWER than the target + old current virtual entry
        const newerIds = versions
            .filter(v => v.createdAt > version.createdAt)
            .map(v => v.id)
        setPendingDeleteIds([...newerIds, 'pending-old-current'])
        setSelectedVersionId(null)
    }, [versions, content, item])

    const isRestore = restoredVersion !== null

    const handleSave = useCallback(() => {
        const videoChanged = linkedVideoId !== item.videoId
        const updates: Parameters<typeof onSave>[0] = {
            title: title.trim(),
            summary: summary.trim(),
            content,
            skipVersioning: isRestore,
        }
        if (videoChanged) {
            updates.videoId = linkedVideoId
            updates.scope = linkedVideoId ? 'video' : 'channel'
        }
        if (isRestore && restoredVersion) {
            const isPureRestore = content === restoredVersion.content
            if (isPureRestore) {
                updates.lastEditSource = restoredVersion.source
                updates.lastEditedBy = restoredVersion.model ?? ''
            } else {
                updates.lastEditSource = 'manual'
                updates.lastEditedBy = ''
            }
            // Atomic: version cleanup happens in the same Firestore batch as save
            updates.versionIdsToDelete = [...pendingDeleteIds, restoredVersion.id]
        }
        onSave(updates)
        onClose()
    }, [title, summary, content, linkedVideoId, item.videoId, onSave, onClose, isRestore, restoredVersion, pendingDeleteIds])

    const dateStr = formatKnowledgeDate(item.createdAt)
    const baseCurrentDate = formatKnowledgeDate(item.updatedAt ?? item.createdAt, true)
    const baseCurrentModel = item.lastEditedBy ?? item.model

    // When restore is active, Current shows the restored version's metadata
    const currentDateStr = restoredVersion
        ? new Date(restoredVersion.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : baseCurrentDate
    // Origin is always the KI creation source (immutable)
    const originSource = item.source
    // Edit source: who last edited. undefined = never edited.
    const editSource = restoredVersion ? restoredVersion.lastEditSource : item.lastEditSource
    const currentModel = restoredVersion ? (restoredVersion.model ?? '') : baseCurrentModel

    // --- Expanded mode slots ---

    const expandedToolbarExtra = useMemo(() => (
        <VersionDropdown
            versions={versions}
            selectedVersionId={selectedVersionId}
            onSelect={setSelectedVersionId}
            onDelete={deleteVersion}
            onRestore={handleRestore}
            pendingDeleteIds={pendingDeleteIds}
            restoredVersionId={restoredVersion?.id}
            oldCurrentSnapshot={oldCurrentSnapshot ?? undefined}
            originSource={originSource}
            editSource={editSource}
            currentModel={currentModel}
            currentDate={currentDateStr}
        />
    ), [versions, selectedVersionId, deleteVersion, handleRestore, pendingDeleteIds, restoredVersion, oldCurrentSnapshot, originSource, editSource, currentModel, currentDateStr])

    const expandedSidePanel = selectedVersion ? (
        <LiveDiffPanel
            oldContent={selectedVersion.content}
            newContent={content}
            label={formatVersionLabel(selectedVersion.createdAt, selectedVersion.source)}
            videoMap={videoMap}
            onClose={() => setSelectedVersionId(null)}
            onRestore={() => handleRestore(selectedVersion.id)}
        />
    ) : undefined

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onMouseDown={handleClose}
        >
            <div
                className="bg-bg-secondary rounded-xl flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl w-[800px] max-w-[95vw] max-h-[90vh]"
                onMouseDown={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border flex-shrink-0">
                    <h2 className="text-lg font-bold text-text-primary m-0">Edit Knowledge Item</h2>
                    <button
                        onClick={handleClose}
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
                            {getOriginLabel(item.source)}
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
                            knowledgeCatalog={knowledgeCatalog}
                            expandedToolbarExtra={expandedToolbarExtra}
                            expandedSidePanel={expandedSidePanel}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30 flex-shrink-0">
                    <Button variant="secondary" onClick={handleClose}>
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

            {/* Unsaved-changes guard */}
            <ConfirmationModal
                isOpen={showUnsavedConfirm}
                title="Unsaved Changes"
                message="You have unsaved changes. What would you like to do?"
                confirmLabel="Discard"
                cancelLabel="Cancel"
                confirmVariant="danger"
                alternateLabel="Save"
                onAlternate={() => {
                    setShowUnsavedConfirm(false)
                    handleSave()
                }}
                onConfirm={onClose}
                onClose={() => setShowUnsavedConfirm(false)}
            />
        </div>,
        document.body
    )
})

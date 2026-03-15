import React, { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Bot, Calendar, Tag, Wrench } from 'lucide-react'
import { Button } from '../../../components/ui/atoms/Button/Button'
import { Badge } from '../../../components/ui/atoms/Badge/Badge'
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import { formatKnowledgeDate } from '../utils/formatDate'

interface KnowledgeItemModalProps {
    /** The Knowledge Item to edit */
    item: KnowledgeItem
    /** Called with updated fields when user saves */
    onSave: (updates: { title: string; content: string }) => void
    /** Called when modal should close */
    onClose: () => void
    /** Video IDs to highlight in the editor */
    videoIds?: Set<string>
}

/**
 * KnowledgeItemModal — edit modal for a Knowledge Item.
 *
 * Features:
 * - Title editing (text input)
 * - Content editing (RichTextEditor — WYSIWYG with markdown storage)
 * - Provenance metadata displayed as read-only (model, toolsUsed, createdAt, source)
 * - Save / Cancel actions
 *
 * Modal pattern matches ConfirmationModal: Portal + backdrop + z-modal.
 */
export const KnowledgeItemModal = React.memo(({
    item,
    onSave,
    onClose,
    videoIds,
}: KnowledgeItemModalProps) => {
    const [title, setTitle] = useState(item.title)
    const [content, setContent] = useState(item.content)

    // ESC to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleSave = useCallback(() => {
        onSave({ title: title.trim(), content })
        onClose()
    }, [title, content, onSave, onClose])

    const hasChanges = title.trim() !== item.title || content !== item.content
    const dateStr = formatKnowledgeDate(item.createdAt)

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
                <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-6 space-y-4">
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
                        {item.toolsUsed.length > 0 && (
                            <span className="flex items-center gap-1">
                                <Wrench size={12} />
                                {item.toolsUsed.join(', ')}
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

                    {/* Content editor */}
                    <div>
                        <label className="block text-xs text-text-secondary font-medium mb-1.5 uppercase tracking-wider">
                            Content
                        </label>
                        <RichTextEditor
                            value={content}
                            onChange={setContent}
                            placeholder="Write your analysis..."
                            videoIds={videoIds}
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

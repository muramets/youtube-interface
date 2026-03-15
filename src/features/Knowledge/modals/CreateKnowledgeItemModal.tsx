import React, { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'
import { Button } from '../../../components/ui/atoms/Button/Button'
import { Dropdown } from '../../../components/ui/molecules/Dropdown'
import { RichTextEditor } from '../../../components/ui/organisms/RichTextEditor'
import { SEED_CATEGORIES } from '../../../core/types/knowledge'

interface CreateKnowledgeItemModalProps {
    /** Called with new item fields when user saves */
    onSave: (item: { category: string; title: string; content: string; summary: string }) => void
    /** Called when modal should close */
    onClose: () => void
}

/** Channel-level seed categories for the dropdown */
const CHANNEL_CATEGORIES = Object.entries(SEED_CATEGORIES)
    .filter(([, v]) => v.level === 'channel')
    .map(([slug, v]) => ({ slug, label: v.label }))

/**
 * CreateKnowledgeItemModal — modal for manually creating a channel-level Knowledge Item.
 *
 * No provenance metadata (source='manual', no model/tools).
 * Category is selected from channel-level seed categories.
 */
export const CreateKnowledgeItemModal = React.memo(({
    onSave,
    onClose,
}: CreateKnowledgeItemModalProps) => {
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [category, setCategory] = useState(CHANNEL_CATEGORIES[0]?.slug ?? '')
    const [catAnchorEl, setCatAnchorEl] = useState<HTMLElement | null>(null)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handleSave = useCallback(() => {
        const trimmedTitle = title.trim()
        if (!trimmedTitle || !content.trim()) return
        // Auto-generate summary from first ~200 chars of content
        const summary = content.replace(/[#*_`>[\]()]/g, '').slice(0, 200).trim()
        onSave({ category, title: trimmedTitle, content, summary })
        onClose()
    }, [title, content, category, onSave, onClose])

    const canSave = title.trim().length > 0 && content.trim().length > 0

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
                    <h2 className="text-lg font-bold text-text-primary m-0">New Knowledge Item</h2>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto scrollbar-auto-hide p-6 space-y-4">
                    {/* Category dropdown */}
                    <div>
                        <label className="block text-xs text-text-secondary font-medium mb-1.5 uppercase tracking-wider">
                            Category
                        </label>
                        <div className="relative w-full">
                            <button
                                onClick={(e) => setCatAnchorEl(prev => prev ? null : e.currentTarget)}
                                className={`w-full flex items-center justify-between bg-input-bg border border-border ${catAnchorEl ? 'rounded-t-lg rounded-b-none border-b-transparent' : 'rounded-lg'} px-3 py-2 text-sm text-text-primary hover:border-text-primary transition-colors cursor-pointer`}
                            >
                                <span>{CHANNEL_CATEGORIES.find(c => c.slug === category)?.label ?? category}</span>
                                <ChevronDown
                                    size={16}
                                    className={`text-text-secondary transition-transform ${catAnchorEl ? 'rotate-180' : ''}`}
                                />
                            </button>
                            <Dropdown
                                isOpen={Boolean(catAnchorEl)}
                                anchorEl={catAnchorEl}
                                onClose={() => setCatAnchorEl(null)}
                                width={catAnchorEl?.offsetWidth ?? 300}
                                zIndexClass="z-tooltip"
                                connected
                            >
                                {CHANNEL_CATEGORIES.map(c => (
                                    <div
                                        key={c.slug}
                                        className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-hover-bg transition-colors ${c.slug === category ? 'text-accent font-medium' : 'text-text-primary opacity-70'}`}
                                        onClick={() => {
                                            setCategory(c.slug)
                                            setCatAnchorEl(null)
                                        }}
                                    >
                                        {c.label}
                                    </div>
                                ))}
                            </Dropdown>
                        </div>
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
                            placeholder="e.g. Channel Growth Strategy Q1 2026..."
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
                            placeholder="Write your analysis, observations, or insights..."
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
                        disabled={!canSave}
                    >
                        Create
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    )
})

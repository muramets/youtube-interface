import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Minimize, Bot, Calendar, Tag } from 'lucide-react'
import { RichTextViewer } from '../../../components/ui/organisms/RichTextEditor'

interface KnowledgeViewerProps {
    /** Markdown content to display */
    content: string
    /** Knowledge Item title */
    title: string
    /** Optional metadata to display in the header */
    meta?: {
        model: string
        createdAt: string
        category: string
    }
    /** Called when the viewer should close */
    onClose: () => void
}

/**
 * KnowledgeViewer — Zen Mode
 *
 * Fullscreen read-only overlay for viewing Knowledge Item content.
 * Ported from MonkeyLearn's ProtocolInstructionViewer pattern:
 * Portal + AnimatePresence + backdrop blur + body scroll lock.
 *
 * Closes on: ESC key, backdrop click, or close button.
 */
export const KnowledgeViewer = React.memo(({
    content,
    title,
    meta,
    onClose,
}: KnowledgeViewerProps) => {
    // ESC to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm p-10"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-bg-secondary w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg-secondary">
                        <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                            <h2 className="text-sm font-medium text-text-primary truncate">
                                {title}
                            </h2>
                            {meta && (
                                <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
                                    <span className="flex items-center gap-1">
                                        <Tag size={10} />
                                        {meta.category}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Bot size={10} />
                                        {meta.model}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Calendar size={10} />
                                        {meta.createdAt}
                                    </span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-hover-bg rounded-full text-text-secondary transition-colors flex-shrink-0"
                            title="Close Zen Mode"
                        >
                            <Minimize className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 scrollbar-auto-hide">
                        <RichTextViewer content={content} />
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    )
})

import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Maximize, Pencil, Bot, Tag, Wrench } from 'lucide-react'
import clsx from 'clsx'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import { RichTextViewer } from '../../../components/ui/organisms/RichTextEditor'
import { KnowledgeViewer } from './KnowledgeViewer'
import { formatKnowledgeDate } from '../utils/formatDate'

interface KnowledgeCardProps {
    item: KnowledgeItem
    onEdit: (item: KnowledgeItem) => void
}

/**
 * KnowledgeCard — collapsed/expanded view of a single Knowledge Item.
 *
 * Collapsed: category, title, date, model, summary + [Open] [Edit] buttons.
 * Expanded: full content via RichTextViewer + [Maximize] button for Zen Mode.
 *
 * Shared between Watch Page (video KI) and Lab Page (channel KI).
 */
export const KnowledgeCard = React.memo(({ item, onEdit }: KnowledgeCardProps) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isZenMode, setIsZenMode] = useState(false)

    const handleToggle = useCallback(() => setIsExpanded(prev => !prev), [])
    const handleEdit = useCallback(() => onEdit(item), [item, onEdit])

    const dateStr = formatKnowledgeDate(item.createdAt)

    return (
        <>
            <div className={clsx(
                "group rounded-lg border border-border bg-bg-secondary transition-colors",
                isExpanded && "ring-1 ring-accent/20"
            )}>
                {/* Header — always visible */}
                <div
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none"
                    onClick={handleToggle}
                >
                    {/* Chevron */}
                    <ChevronDown
                        size={14}
                        className={clsx(
                            "text-text-tertiary mt-1 transition-transform flex-shrink-0",
                            isExpanded && "rotate-180"
                        )}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-medium text-accent uppercase tracking-wider">
                                {item.category.replace(/-/g, ' ')}
                            </span>
                            <span className="text-text-tertiary text-[10px]">{dateStr}</span>
                        </div>

                        <h3 className="text-sm font-medium text-text-primary truncate">
                            {item.title}
                        </h3>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-text-tertiary">
                            <span className="flex items-center gap-1">
                                <Bot size={10} />
                                {item.model}
                            </span>
                            {item.toolsUsed.length > 0 && (
                                <span className="flex items-center gap-1">
                                    <Wrench size={10} />
                                    {item.toolsUsed.length} tools
                                </span>
                            )}
                            {item.source !== 'chat-tool' && (
                                <span className="flex items-center gap-1">
                                    <Tag size={10} />
                                    {item.source}
                                </span>
                            )}
                        </div>

                        {/* Summary — only in collapsed state */}
                        {!isExpanded && (
                            <p className="mt-2 text-xs text-text-secondary line-clamp-2 leading-relaxed">
                                {item.summary}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleEdit() }}
                            className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-hover-bg transition-colors"
                            title="Edit"
                        >
                            <Pencil size={14} />
                        </button>
                    </div>
                </div>

                {/* Expanded content */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <div className="px-4 pb-4 border-t border-border/50 relative group/content">
                                {/* Maximize button */}
                                <div className="absolute top-2 right-4 opacity-0 group-hover/content:opacity-100 transition-opacity z-10">
                                    <button
                                        onClick={() => setIsZenMode(true)}
                                        className="p-1.5 bg-bg-secondary/80 backdrop-blur hover:bg-accent hover:text-white text-text-secondary border border-border rounded-md transition-all shadow-lg"
                                        title="Open in Zen Mode"
                                    >
                                        <Maximize className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="pt-3">
                                    <RichTextViewer content={item.content} />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Zen Mode overlay */}
            {isZenMode && (
                <KnowledgeViewer
                    content={item.content}
                    title={item.title}
                    meta={{
                        model: item.model,
                        createdAt: dateStr,
                        category: item.category.replace(/-/g, ' '),
                    }}
                    onClose={() => setIsZenMode(false)}
                />
            )}
        </>
    )
})

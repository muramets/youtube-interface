import React, { useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Maximize, Pencil, Bot, Wrench } from 'lucide-react'
import { Badge } from '../../../components/ui/atoms/Badge/Badge'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import clsx from 'clsx'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import { CollapsibleSection } from '../../../components/ui/molecules/CollapsibleSection'
import { KnowledgeViewer } from './KnowledgeViewer'
import { formatKnowledgeDate } from '../utils/formatDate'
import { parseMarkdownSections, type HierarchicalSection } from '../utils/markdownSections'

interface KnowledgeCardProps {
    item: KnowledgeItem
    onEdit: (item: KnowledgeItem) => void
}

/** Header size classes by level — used inside CollapsibleSection triggers. */
const HEADER_SIZE: Record<number, string> = {
    1: '[&_button]:text-sm',
    2: '[&_button]:text-xs',
    3: '[&_button]:text-[11px]',
    4: '[&_button]:text-[10px]',
    5: '[&_button]:text-[10px]',
    6: '[&_button]:text-[9px]',
}

/** Indentation by level. */
const INDENT: Record<number, string> = {
    1: 'pl-0',
    2: 'pl-5',
    3: 'pl-5',
    4: 'pl-5',
    5: 'pl-5',
    6: 'pl-5',
}

/** Markdown components for section body content. */
const bodyComponents: Components = {
    h1: ({ className, style, children }) => <h1 className={clsx('text-sm font-bold mb-2 mt-4 first:mt-0 text-text-secondary', className)} style={style}>{children}</h1>,
    h2: ({ className, style, children }) => <h2 className={clsx('text-xs font-bold mb-2 mt-3 text-text-secondary', className)} style={style}>{children}</h2>,
    h3: ({ className, style, children }) => <h3 className={clsx('text-[11px] font-bold mb-1 mt-2 text-text-secondary', className)} style={style}>{children}</h3>,
    p: ({ className, style, children }) => <p className={clsx('mb-1 last:mb-0 text-xs text-text-secondary leading-relaxed', className)} style={style}>{children}</p>,
    ul: ({ className, style, children }) => <ul className={clsx('list-disc list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary', className)} style={style}>{children}</ul>,
    ol: ({ className, style, children }) => <ol className={clsx('list-decimal list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary', className)} style={style}>{children}</ol>,
    li: ({ className, style, children }) => <li className={clsx('pl-1 marker:text-text-tertiary', className)} style={style}>{children}</li>,
    strong: ({ className, style, children }) => <strong className={clsx('font-bold text-text-primary', className)} style={style}>{children}</strong>,
    code: ({ className, style, children }) => <code className={clsx('bg-bg-primary rounded px-1 py-0.5 text-[10px] font-mono text-text-primary', className)} style={style}>{children}</code>,
    blockquote: ({ className, style, children }) => <blockquote className={clsx('border-l-2 border-accent/50 pl-3 my-2 text-text-secondary italic', className)} style={style}>{children}</blockquote>,
    hr: ({ className, style }) => <hr className={clsx('my-3 border-none h-px bg-border', className)} style={style} />,
    table: ({ className, style, children }) => <table className={clsx('border-collapse w-full my-2 text-[11px]', className)} style={style}>{children}</table>,
    th: ({ className, style, children }) => <th className={clsx('border border-border p-1.5 text-left font-semibold bg-bg-primary/50 text-text-primary', className)} style={style}>{children}</th>,
    td: ({ className, style, children }) => <td className={clsx('border border-border p-1.5 text-text-secondary', className)} style={style}>{children}</td>,
}

/** Markdown components for section titles (inside CollapsibleSection trigger). */
const headerComponents: Components = {
    h1: ({ className, style, children }) => <h1 className={clsx('text-sm font-bold text-inherit', className)} style={style}>{children}</h1>,
    h2: ({ className, style, children }) => <h2 className={clsx('text-xs font-bold text-inherit', className)} style={style}>{children}</h2>,
    h3: ({ className, style, children }) => <h3 className={clsx('text-[11px] font-bold text-inherit', className)} style={style}>{children}</h3>,
    h4: ({ className, style, children }) => <h4 className={clsx('text-[10px] font-bold text-inherit', className)} style={style}>{children}</h4>,
    p: ({ children }) => <span className="inline">{children}</span>,
    strong: ({ children }) => <strong className="font-bold text-inherit">{children}</strong>,
}

/**
 * KnowledgeCard — premium collapsible card for a Knowledge Item.
 *
 * Design language: Music TrackCard hover behavior + MonkeyLearn collapsible sections.
 * - Collapsed: category, title, summary. Expand indicator on hover (center bottom).
 * - Expanded: hierarchical collapsible sections (headers collapsed by default).
 * - Meta (model, tools, source) shown only in expanded state.
 *
 * Shared between Knowledge Page (channel KI) and Watch Page (video KI).
 */
export const KnowledgeCard = React.memo(({ item, onEdit }: KnowledgeCardProps) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isZenMode, setIsZenMode] = useState(false)
    const cardRef = useRef<HTMLDivElement>(null)

    const handleToggle = useCallback(() => {
        setIsExpanded(prev => {
            const next = !prev
            if (next) {
                requestAnimationFrame(() => {
                    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
            }
            return next
        })
    }, [])
    const handleEdit = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        onEdit(item)
    }, [item, onEdit])

    const dateStr = formatKnowledgeDate(item.createdAt)

    const sections = useMemo(() => parseMarkdownSections(item.content), [item.content])

    const renderSection = (section: HierarchicalSection, idx: number) => (
        <CollapsibleSection
            key={idx}
            defaultOpen={false}
            variant="mini"
            title={
                <div className="inline-block pointer-events-none">
                    <ReactMarkdown rehypePlugins={[rehypeRaw]} components={headerComponents}>
                        {section.title}
                    </ReactMarkdown>
                </div>
            }
            className={clsx(
                'mb-3',
                '[&_button]:items-start [&_button]:text-left [&_button_div:first-child]:mt-[5px]',
                '[&>div:first-child]:!mb-0',
                INDENT[section.level] ?? 'pl-5',
                HEADER_SIZE[section.level] ?? '[&_button]:text-xs',
            )}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={bodyComponents}>
                {section.content.join('\n')}
            </ReactMarkdown>
            {section.children.length > 0 && (
                <div className="mt-2">
                    {section.children.map((child, i) => renderSection(child, i))}
                </div>
            )}
        </CollapsibleSection>
    )

    return (
        <>
            <div
                ref={cardRef}
                className={clsx(
                    'group relative rounded-lg hover-trail cursor-pointer select-none',
                    isExpanded
                        ? 'bg-white/[0.06]'
                        : 'bg-white/[0.03] hover:bg-white/[0.06]'
                )}
                onClick={handleToggle}
            >
                {/* Header — always visible */}
                <div className="px-4 pt-3 pb-2">
                    {/* Category + date row */}
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium text-accent uppercase tracking-wider">
                            {item.category.replace(/-/g, ' ')}
                        </span>
                        <span className="text-text-tertiary text-[10px]">{dateStr}</span>
                    </div>

                    {/* Title + edit action */}
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-medium text-text-primary truncate">
                            {item.title}
                        </h3>
                        <button
                            onClick={handleEdit}
                            className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-hover-bg transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                            title="Edit"
                        >
                            <Pencil size={13} />
                        </button>
                    </div>

                    {/* Summary — always visible */}
                    <p className="mt-1.5 text-xs text-text-secondary line-clamp-2 leading-relaxed">
                        {item.summary}
                    </p>
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
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="pb-4 relative group/content">
                                <div className="mx-4 h-px bg-border" />
                                {/* Meta row */}
                                <div className="flex items-center gap-3 mt-3 mb-3 px-4 text-[10px] text-text-tertiary">
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
                                    <Badge variant="neutral">
                                        {item.source === 'manual' ? 'Manual' : item.source === 'conclude' ? 'via Memorize' : 'Chat'}
                                    </Badge>
                                </div>

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

                                {/* Collapsible sections */}
                                <div className="text-left px-4">
                                    {sections.preamble && (
                                        <div className="mb-3">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={bodyComponents}>
                                                {sections.preamble}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                    {sections.sections.map((section, idx) => renderSection(section, idx))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Chevron indicator — always in DOM, rotates on expand/collapse */}
                <div
                    className="flex items-center justify-center pb-1.5 pt-0.5"
                    onClick={(e) => { e.stopPropagation(); handleToggle() }}
                >
                    <ChevronDown
                        size={14}
                        className={clsx(
                            'hover-trail transition-transform duration-200',
                            isExpanded
                                ? 'rotate-180 text-text-tertiary hover:text-text-primary'
                                : 'opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-primary'
                        )}
                    />
                </div>
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

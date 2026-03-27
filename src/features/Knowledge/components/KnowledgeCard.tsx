import React, { useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Maximize, Pencil, Bot, Wrench, Hash } from 'lucide-react'
import { Badge } from '../../../components/ui/atoms/Badge/Badge'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import clsx from 'clsx'
import type { KnowledgeItem } from '../../../core/types/knowledge'
import type { VideoPreviewData } from '../../Video/types'
import { ConfirmDeleteButton } from '../../../components/ui/atoms/ConfirmDeleteButton'
import { KnowledgeViewer } from './KnowledgeViewer'
import { CollapsibleMarkdownSections } from './CollapsibleMarkdownSections'
import { formatKnowledgeDate, getOriginLabel } from '../utils/formatDate'
import { buildBodyComponents } from '../utils/bodyComponents'
import { allowCustomUrls } from '../utils/diffUtils'
import { linkifyVideoIds } from '../../../core/utils/linkifyVideoIds'
import { fmtTokens } from '../../Chat/utils/tokenDisplay'
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip'
import { VideoPreviewTooltip, PREVIEW_DIMENSIONS } from '../../Video/components/VideoPreviewTooltip'

interface KnowledgeCardProps {
    item: KnowledgeItem
    onEdit: (item: KnowledgeItem) => void
    onDelete?: (item: KnowledgeItem) => void
    videoMap?: Map<string, VideoPreviewData>
    /** Show linked video row for video-scoped KI (default: false) */
    showLinkedVideo?: boolean
    /** Whether this card is selected (for export). */
    isSelected?: boolean
    /** Callback to toggle selection (Ctrl/Cmd+click). */
    onToggleSelection?: (id: string) => void
}

/** Rough estimate: ~4 chars per token (matches backend CHARS_PER_TOKEN in memory.ts). */
const CHARS_PER_TOKEN = 4;

/** Sanitize schema: allow vid:// protocols + class attribute on links/spans */
const sanitizeSchema = {
    ...defaultSchema,
    protocols: { ...defaultSchema.protocols, href: [...(defaultSchema.protocols?.href ?? []), 'vid', 'mention', 'ki'] },
    attributes: { ...defaultSchema.attributes, a: [...(defaultSchema.attributes?.a ?? []), 'className', 'class'], span: [...(defaultSchema.attributes?.span ?? []), 'className', 'class'] },
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
export const KnowledgeCard = React.memo(({ item, onEdit, onDelete, videoMap: externalVideoMap, showLinkedVideo = false, isSelected, onToggleSelection }: KnowledgeCardProps) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isZenMode, setIsZenMode] = useState(false)
    const cardRef = useRef<HTMLDivElement>(null)

    // Merge externalVideoMap (channel videos, rich data) + resolvedVideoRefs (server snapshot, fallback for competitors)
    // externalVideoMap has viewCount/publishedAt; resolvedVideoRefs fills gaps for IDs not in externalVideoMap
    const videoMap = useMemo(() => {
        const map = new Map<string, VideoPreviewData>()
        // Base: server-resolved refs (competitors + own, includes metrics when available)
        if (item.resolvedVideoRefs) {
            for (const ref of item.resolvedVideoRefs) {
                map.set(ref.videoId, {
                    videoId: ref.videoId,
                    title: ref.title,
                    thumbnailUrl: ref.thumbnailUrl,
                    ownership: ref.ownership,
                    viewCount: ref.viewCount,
                    publishedAt: ref.publishedAt,
                })
            }
        }
        // Overlay: channel videos (richer data — viewCount, publishedAt, duration)
        if (externalVideoMap) {
            for (const [id, v] of externalVideoMap) map.set(id, v)
        }
        return map.size > 0 ? map : undefined
    }, [item.resolvedVideoRefs, externalVideoMap])

    const handleClick = useCallback((e: React.MouseEvent) => {
        // Ctrl/Cmd+click → toggle selection
        if ((e.metaKey || e.ctrlKey) && onToggleSelection) {
            e.preventDefault()
            e.stopPropagation()
            onToggleSelection(item.id)
            return
        }
        // Normal click → expand/collapse
        setIsExpanded(prev => {
            const next = !prev
            if (next) {
                requestAnimationFrame(() => {
                    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
            }
            return next
        })
    }, [onToggleSelection, item.id])
    const handleEdit = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        onEdit(item)
    }, [item, onEdit])


    const dateStr = formatKnowledgeDate(item.createdAt)

    // Resolve linked video for video-scoped KI
    const linkedVideo = useMemo(() => {
        if (item.scope !== 'video' || !item.videoId) return null
        return videoMap?.get(item.videoId) ?? null
    }, [item.scope, item.videoId, videoMap])

    const bodyComponents = useMemo(() => buildBodyComponents(videoMap), [videoMap])

    const linkifiedContent = useMemo(() =>
        videoMap ? linkifyVideoIds(item.content, videoMap) : item.content,
        [item.content, videoMap],
    )

    return (
        <>
            <div
                ref={cardRef}
                className={clsx(
                    'group relative rounded-lg hover-trail-lift cursor-pointer select-none scale-100 shadow-none',
                    isSelected
                        ? 'border-2 border-blue-500 bg-blue-500/10'
                        : isExpanded
                            ? 'bg-black/[0.04] dark:bg-white/[0.06]'
                            : 'bg-black/[0.02] hover:bg-black/[0.04] hover:scale-[1.012] hover:shadow-lg dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:hover:shadow-black/30'
                )}
                onClick={handleClick}
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
                        <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary group-hover:text-text-primary hover-trail truncate">
                            {item.title}
                        </h3>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsZenMode(true) }}
                                className="p-1.5 rounded text-text-tertiary hover:text-accent hover:bg-hover-bg transition-all"
                                title="Open in Zen Mode"
                            >
                                <Maximize size={13} />
                            </button>
                            <button
                                onClick={handleEdit}
                                className="p-1.5 rounded text-text-tertiary hover:text-text-primary hover:bg-hover-bg transition-all"
                                title="Edit"
                            >
                                <Pencil size={13} />
                            </button>
                            {onDelete && (
                                <ConfirmDeleteButton onConfirm={() => onDelete(item)} />
                            )}
                        </div>
                    </div>

                    {/* Linked video + summary — video-scoped KI on Knowledge Page */}
                    {showLinkedVideo && linkedVideo ? (
                        <div className="flex items-center gap-3 mt-2 cursor-default">
                            {linkedVideo.thumbnailUrl && (
                                <img
                                    src={linkedVideo.thumbnailUrl}
                                    alt=""
                                    className="w-20 aspect-video object-cover rounded flex-shrink-0 transition-transform hover:scale-105"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <PortalTooltip
                                    content={<VideoPreviewTooltip video={linkedVideo} mode="mini" />}
                                    variant="glass"
                                    side="top"
                                    align="center"
                                    sizeMode="fixed"
                                    fixedDimensions={PREVIEW_DIMENSIONS.mini}
                                    enterDelay={200}
                                    cursorAnchor
                                    inline
                                >
                                    <span className="text-[10px] text-text-tertiary truncate inline transition-colors hover:text-text-secondary">
                                        {linkedVideo.title}
                                        {linkedVideo.channelTitle && (
                                            <span className="text-text-tertiary/50 ml-1">
                                                {linkedVideo.channelTitle}
                                            </span>
                                        )}
                                    </span>
                                </PortalTooltip>
                                <div className="mt-1 text-xs text-text-secondary line-clamp-2 leading-relaxed [&_p]:m-0 [&_p]:inline">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={bodyComponents}>
                                        {videoMap ? linkifyVideoIds(item.summary, videoMap) : item.summary}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Summary — non-video KI or hidden linked video */
                        <div className="mt-1.5 text-xs text-text-secondary line-clamp-2 leading-relaxed [&_p]:m-0 [&_p]:inline">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={bodyComponents}>
                                {videoMap ? linkifyVideoIds(item.summary, videoMap) : item.summary}
                            </ReactMarkdown>
                        </div>
                    )}
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
                            <div className="pb-4 relative">
                                <div className="mx-4 h-px bg-border" />
                                {/* Meta row */}
                                <div className="flex items-center gap-3 mt-3 mb-3 px-4 text-[10px] text-text-tertiary">
                                    <span className="flex items-center gap-1">
                                        <Bot size={10} />
                                        {item.model}
                                    </span>
                                    {item.toolsUsed?.length > 0 && (
                                        <span className="flex items-center gap-1">
                                            <Wrench size={10} />
                                            {item.toolsUsed?.length} tools
                                        </span>
                                    )}
                                    <Badge variant="neutral">
                                        {getOriginLabel(item.source)}
                                    </Badge>
                                    <span className="flex items-center gap-1 ml-auto">
                                        <Hash size={10} />
                                        {fmtTokens(Math.ceil(item.content.length / CHARS_PER_TOKEN))} tokens
                                    </span>
                                </div>

                                {/* Collapsible sections */}
                                <div className="text-left px-4">
                                    <CollapsibleMarkdownSections
                                        content={linkifiedContent}
                                        videoMap={videoMap}
                                        defaultOpenLevel={0}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Chevron indicator — always in DOM, rotates on expand/collapse */}
                <div
                    className="flex items-center justify-center pb-1.5 pt-0.5"
                    onClick={(e) => { e.stopPropagation(); handleClick(e) }}
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
                    item={item}
                    content={videoMap ? linkifyVideoIds(item.content, videoMap) : item.content}
                    onClose={() => setIsZenMode(false)}
                    videoMap={videoMap}
                />
            )}
        </>
    )
})

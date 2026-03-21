import React, { useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Maximize, Pencil, Bot, Wrench } from 'lucide-react'
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
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip'
import { VideoPreviewTooltip, PREVIEW_DIMENSIONS } from '../../Video/components/VideoPreviewTooltip'

interface KnowledgeCardProps {
    item: KnowledgeItem
    onEdit: (item: KnowledgeItem) => void
    onDelete?: (item: KnowledgeItem) => void
    videoMap?: Map<string, VideoPreviewData>
    /** Show linked video row for video-scoped KI (default: false) */
    showLinkedVideo?: boolean
}

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
export const KnowledgeCard = React.memo(({ item, onEdit, onDelete, videoMap: externalVideoMap, showLinkedVideo = false }: KnowledgeCardProps) => {
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
                    'group relative rounded-lg hover-trail cursor-pointer select-none',
                    isExpanded
                        ? 'bg-black/[0.04] dark:bg-white/[0.06]'
                        : 'bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
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

                    {/* Linked video — video-scoped KI only, hidden on Watch Page */}
                    {showLinkedVideo && linkedVideo && (
                        <div className="group/linked flex items-center gap-2 mt-1.5 cursor-default">
                            {linkedVideo.thumbnailUrl && (
                                <img
                                    src={linkedVideo.thumbnailUrl}
                                    alt=""
                                    className="w-8 aspect-video object-cover rounded flex-shrink-0 transition-transform group-hover/linked:scale-110"
                                />
                            )}
                            <PortalTooltip
                                content={<VideoPreviewTooltip video={linkedVideo} mode="mini" />}
                                variant="glass"
                                side="top"
                                align="center"
                                sizeMode="fixed"
                                fixedDimensions={PREVIEW_DIMENSIONS.mini}
                                enterDelay={200}
                                inline
                            >
                                <span className="text-[10px] text-text-tertiary truncate transition-colors group-hover/linked:text-text-secondary">
                                    {linkedVideo.title}
                                    {linkedVideo.channelTitle && (
                                        <span className="text-text-tertiary/50 transition-colors group-hover/linked:text-text-tertiary ml-1">
                                            {linkedVideo.channelTitle}
                                        </span>
                                    )}
                                </span>
                            </PortalTooltip>
                        </div>
                    )}

                    {/* Summary — always visible */}
                    <div className="mt-1.5 text-xs text-text-secondary line-clamp-2 leading-relaxed [&_p]:m-0 [&_p]:inline">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={bodyComponents}>
                            {videoMap ? linkifyVideoIds(item.summary, videoMap) : item.summary}
                        </ReactMarkdown>
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
                    item={item}
                    content={videoMap ? linkifyVideoIds(item.content, videoMap) : item.content}
                    onClose={() => setIsZenMode(false)}
                    videoMap={videoMap}
                />
            )}
        </>
    )
})

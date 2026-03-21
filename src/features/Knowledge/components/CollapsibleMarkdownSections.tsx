import React, { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import clsx from 'clsx'
import { CollapsibleSection } from '../../../components/ui/molecules/CollapsibleSection'
import { allowCustomUrls } from '../utils/diffUtils'
import { parseMarkdownSections, type HierarchicalSection } from '../utils/markdownSections'
import type { VideoPreviewData } from '../../Video/types'
import type { KiPreviewData } from '../../../components/ui/organisms/RichTextEditor/types'
import { buildBodyComponents } from '../utils/bodyComponents'
import { VID_RE, MENTION_RE } from '../../../core/config/referencePatterns'
import { VideoReferenceTooltip } from '../../Chat/components/VideoReferenceTooltip'

// =============================================================================
// Shared section rendering for KnowledgeCard and KnowledgeViewer (Zen Mode).
// Parses markdown into hierarchical sections, renders each as a CollapsibleSection.
// =============================================================================

/** Sanitize schema: allow vid://, mention://, ki:// protocols + class on links/spans + details/summary */
const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
    protocols: { ...defaultSchema.protocols, href: [...(defaultSchema.protocols?.href ?? []), 'vid', 'mention', 'ki'] },
    attributes: {
        ...defaultSchema.attributes,
        a: [...(defaultSchema.attributes?.a ?? []), 'className', 'class'],
        span: [...(defaultSchema.attributes?.span ?? []), 'className', 'class'],
        details: ['open'],
    },
}

/** Indentation by heading level. */
const INDENT: Record<number, string> = {
    1: 'pl-0',
    2: 'pl-5',
    3: 'pl-5',
    4: 'pl-5',
    5: 'pl-5',
    6: 'pl-5',
}

// --- Variant-specific styling ---

interface VariantConfig {
    headerSize: Record<number, string>
    headerComponents: Components
    sectionSpacing: string
    preambleSpacing: string
    contentTopMargin: string
}

const COMPACT_CONFIG: VariantConfig = {
    headerSize: {
        1: '[&_[role=button]]:text-sm',
        2: '[&_[role=button]]:text-xs',
        3: '[&_[role=button]]:text-[11px]',
        4: '[&_[role=button]]:text-[10px]',
        5: '[&_[role=button]]:text-[10px]',
        6: '[&_[role=button]]:text-[9px]',
    },
    headerComponents: {
        h1: ({ className, style, children }) => <h1 className={clsx('text-sm font-bold text-inherit', className)} style={style}>{children}</h1>,
        h2: ({ className, style, children }) => <h2 className={clsx('text-xs font-bold text-inherit', className)} style={style}>{children}</h2>,
        h3: ({ className, style, children }) => <h3 className={clsx('text-[11px] font-bold text-inherit', className)} style={style}>{children}</h3>,
        h4: ({ className, style, children }) => <h4 className={clsx('text-[10px] font-bold text-inherit', className)} style={style}>{children}</h4>,
        p: ({ children }) => <span className="inline">{children}</span>,
        strong: ({ children }) => <strong className="font-bold text-inherit">{children}</strong>,
    },
    sectionSpacing: 'mb-3',
    preambleSpacing: 'mb-3',
    contentTopMargin: '',
}

const ZEN_CONFIG: VariantConfig = {
    headerSize: {
        1: '[&_[role=button]]:text-base',
        2: '[&_[role=button]]:text-sm',
        3: '[&_[role=button]]:text-xs',
        4: '[&_[role=button]]:text-[11px]',
        5: '[&_[role=button]]:text-[10px]',
        6: '[&_[role=button]]:text-[10px]',
    },
    headerComponents: {
        h1: ({ className, style, children }) => <h1 className={clsx('text-base font-bold text-inherit', className)} style={style}>{children}</h1>,
        h2: ({ className, style, children }) => <h2 className={clsx('text-sm font-bold text-inherit', className)} style={style}>{children}</h2>,
        h3: ({ className, style, children }) => <h3 className={clsx('text-xs font-bold text-inherit', className)} style={style}>{children}</h3>,
        h4: ({ className, style, children }) => <h4 className={clsx('text-[11px] font-bold text-inherit', className)} style={style}>{children}</h4>,
        h5: ({ className, style, children }) => <h5 className={clsx('text-[10px] font-bold text-inherit', className)} style={style}>{children}</h5>,
        p: ({ children }) => <span className="inline">{children}</span>,
        strong: ({ children }) => <strong className="font-bold text-inherit">{children}</strong>,
    },
    sectionSpacing: 'mb-1',
    preambleSpacing: 'mb-4',
    contentTopMargin: 'mt-3',
}

const VARIANT_MAP = { compact: COMPACT_CONFIG, zen: ZEN_CONFIG }

interface CollapsibleMarkdownSectionsProps {
    /** Pre-processed markdown content (with linkified video refs) */
    content: string
    /** Video data map for vid:// link tooltips */
    videoMap?: Map<string, VideoPreviewData>
    /** KI data map for ki:// link tooltips */
    kiMap?: Map<string, KiPreviewData>
    /** Sections at this level and below are collapsed by default (0 = all collapsed, 3 = h4+ collapsed) */
    defaultOpenLevel?: number
    /** Visual variant: compact (card) or zen (reading mode, more breathing room) */
    variant?: 'compact' | 'zen'
}

/**
 * CollapsibleMarkdownSections — hierarchical collapsible markdown renderer.
 *
 * Parses markdown into sections by headings, renders each as a CollapsibleSection
 * with hover animations, indent, and configurable default open state.
 * Shared between KnowledgeCard (compact, all collapsed) and Zen Mode (zen, h1-h3 open).
 */
export const CollapsibleMarkdownSections = React.memo(({
    content,
    videoMap,
    kiMap,
    defaultOpenLevel = 3,
    variant = 'compact',
}: CollapsibleMarkdownSectionsProps) => {
    const config = VARIANT_MAP[variant]
    const bodyComponents = useMemo(() => buildBodyComponents(videoMap, variant, kiMap), [videoMap, variant, kiMap])

    // Extend header components with vid:// link support + pointer-events-auto
    const headerComponents = useMemo((): Components => ({
        ...config.headerComponents,
        a({ href, children }) {
            if (href && videoMap) {
                const vidMatch = VID_RE.exec(href)
                if (vidMatch) {
                    const video = videoMap.get(vidMatch[1]) ?? null
                    return (
                        <span className="pointer-events-auto inline">
                            <VideoReferenceTooltip label={String(children)} video={video} />
                        </span>
                    )
                }
                const mentionMatch = MENTION_RE.exec(href)
                if (mentionMatch) {
                    const video = videoMap.get(mentionMatch[1]) ?? null
                    return (
                        <span className="pointer-events-auto inline">
                            <VideoReferenceTooltip label={String(children)} video={video} />
                        </span>
                    )
                }
            }
            return <span>{children}</span>
        },
    }), [config.headerComponents, videoMap])

    const sections = useMemo(
        () => parseMarkdownSections(content),
        [content],
    )

    const renderSection = (section: HierarchicalSection, idx: number) => (
        <CollapsibleSection
            key={idx}
            defaultOpen={section.level <= defaultOpenLevel}
            variant="mini"
            title={
                <div className="inline-block pointer-events-none">
                    <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={headerComponents}>
                        {section.title}
                    </ReactMarkdown>
                </div>
            }
            className={clsx(
                config.sectionSpacing,
                '[&_[role=button]]:items-start [&_[role=button]]:text-left [&_button_div:first-child]:mt-[5px]',
                '[&>div:first-child]:!mb-0',
                INDENT[section.level] ?? 'pl-5',
                config.headerSize[section.level] ?? '[&_[role=button]]:text-xs',
            )}
        >
            <div className={config.contentTopMargin}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={bodyComponents}>
                    {section.content.join('\n')}
                </ReactMarkdown>
            </div>
            {section.children.length > 0 && (
                <div className="mt-2">
                    {section.children.map((child, i) => renderSection(child, i))}
                </div>
            )}
        </CollapsibleSection>
    )

    return (
        <>
            {sections.preamble && (
                <div className={config.preambleSpacing}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={bodyComponents}>
                        {sections.preamble}
                    </ReactMarkdown>
                </div>
            )}
            {sections.sections.map((section, i) => renderSection(section, i))}
        </>
    )
})

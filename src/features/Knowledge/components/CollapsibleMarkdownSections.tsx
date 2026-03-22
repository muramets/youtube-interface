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
import { ReferenceLink } from '../../../components/ui/organisms/RichTextEditor/components/ReferenceLink'

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

// --- Section layout config ---

const HEADER_SIZE: Record<number, string> = {
    1: '[&_[role=button]]:text-base',
    2: '[&_[role=button]]:text-sm',
    3: '[&_[role=button]]:text-xs',
    4: '[&_[role=button]]:text-[11px]',
    5: '[&_[role=button]]:text-[10px]',
    6: '[&_[role=button]]:text-[10px]',
}

const HEADER_COMPONENTS: Components = {
    h1: ({ className, style, children }) => <h1 className={clsx('text-base font-bold text-inherit', className)} style={style}>{children}</h1>,
    h2: ({ className, style, children }) => <h2 className={clsx('text-sm font-bold text-inherit', className)} style={style}>{children}</h2>,
    h3: ({ className, style, children }) => <h3 className={clsx('text-xs font-bold text-inherit', className)} style={style}>{children}</h3>,
    h4: ({ className, style, children }) => <h4 className={clsx('text-[11px] font-bold text-inherit', className)} style={style}>{children}</h4>,
    h5: ({ className, style, children }) => <h5 className={clsx('text-[10px] font-bold text-inherit', className)} style={style}>{children}</h5>,
    p: ({ children }) => <span className="inline">{children}</span>,
    strong: ({ children }) => <strong className="font-bold text-inherit">{children}</strong>,
}

/** Spacing between sections, content margins, children wrapper gaps */
const SECTION_SPACING = {
    section: 'mb-1',
    preamble: 'mb-4',
    contentTop: 'mt-1',
    contentBottom: 'mb-6',
    childrenTop: 'mt-1',
}

interface CollapsibleMarkdownSectionsProps {
    /** Pre-processed markdown content (with linkified video refs) */
    content: string
    /** Video data map for vid:// link tooltips */
    videoMap?: Map<string, VideoPreviewData>
    /** KI data map for ki:// link tooltips */
    kiMap?: Map<string, KiPreviewData>
    /** Sections at this level and below are collapsed by default (0 = all collapsed, 3 = h4+ collapsed) */
    defaultOpenLevel?: number
}

/**
 * CollapsibleMarkdownSections — hierarchical collapsible markdown renderer.
 *
 * Parses markdown into sections by headings, renders each as a CollapsibleSection
 * with hover animations, indent, and configurable default open state.
 * Used by KnowledgeCard (all collapsed), KnowledgeViewer/Zen Mode (h1-h3 open),
 * WatchPageNotes, and AiAssistantSettings.
 */
export const CollapsibleMarkdownSections = React.memo(({
    content,
    videoMap,
    kiMap,
    defaultOpenLevel = 3,
}: CollapsibleMarkdownSectionsProps) => {
    const bodyComponents = useMemo(() => buildBodyComponents(videoMap, 'prose', kiMap), [videoMap, kiMap])

    // Extend header components with vid:// link support + pointer-events-auto
    const headerComponents = useMemo((): Components => ({
        ...HEADER_COMPONENTS,
        a({ href, children }) {
            return (
                <span className="pointer-events-auto inline">
                    <ReferenceLink href={href} videoMap={videoMap} kiMap={kiMap}>{children}</ReferenceLink>
                </span>
            )
        },
    }), [videoMap, kiMap])

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
            headerGap="mb-0"
            className={clsx(
                SECTION_SPACING.section,
                '[&_[role=button]]:items-start [&_[role=button]]:text-left [&_button_div:first-child]:mt-[5px]',
                INDENT[section.level] ?? 'pl-5',
                HEADER_SIZE[section.level] ?? '[&_[role=button]]:text-xs',
            )}
        >
            {section.content.join('').trim() && (
                <div className={clsx(SECTION_SPACING.contentTop, SECTION_SPACING.contentBottom)}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={bodyComponents}>
                        {section.content.join('\n')}
                    </ReactMarkdown>
                </div>
            )}
            {section.children.length > 0 && (
                <div className={SECTION_SPACING.childrenTop}>
                    {section.children.map((child, i) => renderSection(child, i))}
                </div>
            )}
        </CollapsibleSection>
    )

    return (
        <>
            {sections.preamble && (
                <div className={SECTION_SPACING.preamble}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]} urlTransform={allowCustomUrls} components={bodyComponents}>
                        {sections.preamble}
                    </ReactMarkdown>
                </div>
            )}
            {sections.sections.map((section, i) => renderSection(section, i))}
        </>
    )
})

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { computeDiffBlocks, allowCustomUrls, type DiffBlock } from '../utils/diffUtils'
import { buildBodyComponents } from '../utils/bodyComponents'
import { linkifyVideoIds } from '../../../core/utils/linkifyVideoIds'
import type { VideoPreviewData } from '../../Video/types'

/** Sanitize schema: allow vid://, details/summary, class on links/spans */
const diffSanitizeSchema = {
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

/**
 * Cap leading whitespace to 2 spaces per nesting level.
 * Prevents CommonMark from treating 4+ space lines as code blocks
 * while preserving list nesting for sub-bullets.
 */
function capIndentation(content: string): string {
    return content.replace(/^[ ]{4,}/gm, match => {
        // Cap at 3 spaces max (CommonMark code block threshold is 4)
        const level = Math.min(Math.round(match.length / 4), 1)
        return '  '.repeat(level)
    })
}

interface RenderedDiffViewerProps {
    oldContent: string
    newContent: string
    oldLabel?: string
    newLabel?: string
    videoMap?: Map<string, VideoPreviewData>
}

/**
 * RenderedDiffViewer — premium split-view diff with rendered markdown.
 *
 * Left column: old version (removed blocks red, added spacers green).
 * Right column: current version (added blocks green, removed spacers red).
 * Both columns render markdown with vid:// tooltip support.
 * Theme-aware via CSS variables.
 */
export const RenderedDiffViewer = ({
    oldContent, newContent, oldLabel, newLabel, videoMap,
}: RenderedDiffViewerProps) => {
    const { left, right, stats } = useMemo(() => {
        const oldLinkified = videoMap ? linkifyVideoIds(oldContent, videoMap) : oldContent
        const newLinkified = videoMap ? linkifyVideoIds(newContent, videoMap) : newContent
        return computeDiffBlocks(oldLinkified, newLinkified)
    }, [oldContent, newContent, videoMap])

    const mdComponents = useMemo(() => buildBodyComponents(videoMap), [videoMap])

    return (
        <div className="h-full flex flex-col">
            {/* Column headers with stats */}
            <div className="grid grid-cols-2 border-b flex-shrink-0" style={{ borderColor: 'var(--diff-separator)' }}>
                <div className="px-4 py-2 flex items-center justify-between" style={{ borderRight: '1px solid var(--diff-separator)' }}>
                    <span className="text-[11px] font-medium text-text-secondary truncate">
                        {oldLabel || 'Previous version'}
                    </span>
                    {stats.removed > 0 && (
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--diff-removed-text)' }}>
                            -{stats.removed}
                        </span>
                    )}
                </div>
                <div className="px-4 py-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-text-secondary truncate">
                        {newLabel || 'Current'}
                    </span>
                    {stats.added > 0 && (
                        <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--diff-added-text)' }}>
                            +{stats.added}
                        </span>
                    )}
                </div>
            </div>

            {/* Diff content — two independent scroll columns */}
            <div className="flex-1 grid grid-cols-2 overflow-hidden min-h-0">
                <div className="overflow-y-auto px-4 py-3" style={{ borderRight: '1px solid var(--diff-separator)' }}>
                    {left.map((block, i) => (
                        <DiffBlockView
                            key={i}
                            block={block}
                            side="left"
                            components={mdComponents}
                        />
                    ))}
                </div>
                <div className="overflow-y-auto px-4 py-3">
                    {right.map((block, i) => (
                        <DiffBlockView
                            key={i}
                            block={block}
                            side="right"
                            components={mdComponents}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

export const DiffBlockView = ({
    block, side, components,
}: {
    block: DiffBlock
    side: 'left' | 'right'
    components: ReturnType<typeof buildBodyComponents>
}) => {
    // Spacer: left shows "added" indicator, right shows "removed" indicator
    const isSpacer = (side === 'left' && block.type === 'added')
        || (side === 'right' && block.type === 'removed')

    if (isSpacer) {
        const isAdded = block.type === 'added'
        return (
            <div
                className="my-1 px-3 py-1 rounded text-[10px] font-mono"
                style={{
                    backgroundColor: isAdded ? 'var(--diff-added-bg)' : 'var(--diff-removed-bg)',
                    color: isAdded ? 'var(--diff-added-text)' : 'var(--diff-removed-text)',
                    borderLeft: `3px solid ${isAdded ? 'var(--diff-added-text)' : 'var(--diff-removed-text)'}`,
                }}
            >
                {isAdded ? '+' : '-'}{block.lineCount} line{block.lineCount !== 1 ? 's' : ''} {isAdded ? 'added' : 'removed'}
            </div>
        )
    }

    // Content block: highlighted if changed, plain if unchanged
    const isHighlighted = block.type !== 'unchanged'
    const highlightStyle = block.type === 'removed'
        ? { backgroundColor: 'var(--diff-removed-bg)', borderLeft: '3px solid var(--diff-removed-text)' }
        : block.type === 'added'
            ? { backgroundColor: 'var(--diff-added-bg)', borderLeft: '3px solid var(--diff-added-text)' }
            : undefined

    return (
        <div
            className={isHighlighted ? 'rounded px-3 py-1 my-1' : ''}
            style={highlightStyle}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, [rehypeSanitize, diffSanitizeSchema]]}
                components={components}
                urlTransform={allowCustomUrls}
            >
                {capIndentation(block.content)}
            </ReactMarkdown>
        </div>
    )
}

import type { Components } from 'react-markdown'
import clsx from 'clsx'
import { VID_RE, MENTION_RE } from '../../../core/config/referencePatterns'
import { VideoReferenceTooltip } from '../../Chat/components/VideoReferenceTooltip'
import type { VideoPreviewData } from '../../Video/types'

// --- Size presets ---

interface SizePreset {
    p: string
    ul: string
    ol: string
    li: string
    strong: string
    code: string
    blockquote: string
    table: string
    th: string
    td: string
    hr: string
    h1: string
    h2: string
    h3: string
    h4: string
    h5: string
    h6: string
}

/** Compact: for KnowledgeCard, MemoryCheckpoint, diff panels */
const COMPACT: SizePreset = {
    p: 'mb-1 last:mb-0 text-xs text-text-secondary leading-relaxed',
    ul: 'list-disc list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary',
    ol: 'list-decimal list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary',
    li: 'pl-1 marker:text-text-tertiary',
    strong: 'font-bold text-text-primary',
    code: 'bg-bg-primary rounded px-1 py-0.5 text-[10px] font-mono text-text-primary',
    blockquote: 'border-l-2 border-accent/50 pl-3 my-2 text-text-secondary italic',
    table: 'border-collapse w-full my-2 text-[11px]',
    th: 'border border-border p-1.5 text-left font-semibold bg-bg-primary/50 text-text-primary',
    td: 'border border-border p-1.5 text-text-secondary',
    hr: 'my-3 border-none h-px bg-border',
    h1: 'text-sm font-bold mb-2 mt-4 first:mt-0 text-text-secondary',
    h2: 'text-xs font-bold mb-2 mt-3 text-text-secondary',
    h3: 'text-[11px] font-bold mb-1 mt-2 text-text-secondary',
    h4: 'text-[11px] font-semibold mb-1 mt-2 text-text-secondary',
    h5: 'text-[10px] font-semibold mb-1 mt-1.5 text-text-tertiary',
    h6: 'text-[10px] font-medium mb-1 mt-1.5 text-text-tertiary',
}

/** Zen: for Zen Mode reading — MonkeyLearn-inspired muted tones, generous spacing */
const ZEN: SizePreset = {
    p: 'mb-2 last:mb-0 text-xs font-mono leading-relaxed [color:var(--zen-body)]',
    ul: 'list-disc list-outside pl-5 mb-2 space-y-3 text-xs font-mono [color:var(--zen-body)]',
    ol: 'list-decimal list-outside pl-5 mb-2 space-y-3 text-xs font-mono [color:var(--zen-body)]',
    li: 'pl-1 [&::marker]:![color:var(--zen-marker)]',
    strong: 'font-bold [color:var(--zen-bold)]',
    code: 'bg-bg-primary/50 rounded px-1.5 py-0.5 text-[10px] font-mono [color:var(--zen-bold)]',
    blockquote: 'border-l-4 border-accent/50 pl-4 my-3 bg-[var(--zen-body)]/5 py-1 rounded-r-md [color:var(--zen-body)] not-italic font-medium',
    table: 'border-collapse w-full my-3 text-[11px] font-mono',
    th: 'border border-border p-2 text-left font-semibold bg-bg-primary/50 [color:var(--zen-bold)]',
    td: 'border border-border p-2 [color:var(--zen-body)]',
    hr: 'my-1 border-none h-px bg-border/30',
    h1: 'text-base font-bold mb-3 mt-5 first:mt-0 [color:var(--zen-heading)] hover:text-text-primary transition-colors duration-200 [&_strong]:![color:inherit]',
    h2: 'text-sm font-bold mb-2 mt-4 [color:var(--zen-heading)] hover:text-text-primary transition-colors duration-200 [&_strong]:![color:inherit]',
    h3: 'text-xs font-bold mb-1.5 mt-3 [color:var(--zen-heading)] hover:text-text-primary transition-colors duration-200 [&_strong]:![color:inherit]',
    h4: 'text-[11px] font-bold mb-1 mt-2 [color:var(--zen-heading)] hover:text-text-primary transition-colors duration-200 [&_strong]:![color:inherit]',
    h5: 'text-[10px] font-bold mb-1 mt-2 [color:var(--zen-heading)] hover:text-text-primary transition-colors duration-200 [&_strong]:![color:inherit]',
    h6: 'text-[10px] font-medium mb-1 mt-2 [color:var(--zen-heading)] hover:text-text-primary transition-colors duration-200 [&_strong]:![color:inherit]',
}

const PRESETS = { compact: COMPACT, zen: ZEN }

/**
 * Shared markdown body components for KnowledgeCard, Zen Mode, MemoryCheckpoint.
 * Handles vid:// (LLM-generated) and mention:// (legacy) video reference links.
 *
 * @param videoMap - Video data for vid:// tooltip rendering
 * @param variant - Size variant: 'compact' (card/diff) or 'zen' (reading mode)
 */
export function buildBodyComponents(
    videoMap?: Map<string, VideoPreviewData>,
    variant: 'compact' | 'zen' = 'compact',
): Components {
    const s = PRESETS[variant]

    return {
        h1: ({ className, style, children }) => <h1 className={clsx(s.h1, className)} style={style}>{children}</h1>,
        h2: ({ className, style, children }) => <h2 className={clsx(s.h2, className)} style={style}>{children}</h2>,
        h3: ({ className, style, children }) => <h3 className={clsx(s.h3, className)} style={style}>{children}</h3>,
        h4: ({ className, style, children }) => <h4 className={clsx(s.h4, className)} style={style}>{children}</h4>,
        h5: ({ className, style, children }) => <h5 className={clsx(s.h5, className)} style={style}>{children}</h5>,
        h6: ({ className, style, children }) => <h6 className={clsx(s.h6, className)} style={style}>{children}</h6>,
        p: ({ className, style, children }) => <p className={clsx(s.p, className)} style={style}>{children}</p>,
        ul: ({ className, style, children }) => <ul className={clsx(s.ul, className)} style={style}>{children}</ul>,
        ol: ({ className, style, children, start }) => <ol start={start} className={clsx(s.ol, className)} style={style}>{children}</ol>,
        li: ({ className, style, children }) => <li className={clsx(s.li, className)} style={style}>{children}</li>,
        strong: ({ className, style, children }) => <strong className={clsx(s.strong, className)} style={style}>{children}</strong>,
        code: ({ className, style, children }) => <code className={clsx(s.code, className)} style={style}>{children}</code>,
        blockquote: ({ className, style, children }) => <blockquote className={clsx(s.blockquote, className)} style={style}>{children}</blockquote>,
        hr: ({ className, style }) => <hr className={clsx(s.hr, className)} style={style} />,
        table: ({ className, style, children }) => <table className={clsx(s.table, className)} style={style}>{children}</table>,
        th: ({ className, style, children }) => <th className={clsx(s.th, className)} style={style}>{children}</th>,
        td: ({ className, style, children }) => <td className={clsx(s.td, className)} style={style}>{children}</td>,
        a({ href, children }) {
            if (href && videoMap) {
                const vidMatch = VID_RE.exec(href)
                if (vidMatch) {
                    const video = videoMap.get(vidMatch[1]) ?? null
                    return <VideoReferenceTooltip label={String(children)} video={video} />
                }
                const mentionMatch = MENTION_RE.exec(href)
                if (mentionMatch) {
                    const video = videoMap.get(mentionMatch[1]) ?? null
                    return <VideoReferenceTooltip label={String(children)} video={video} />
                }
            }
            return <a href={href} target="_blank" rel="noreferrer">{children}</a>
        },
    }
}

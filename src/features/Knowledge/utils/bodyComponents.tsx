import type { Components } from 'react-markdown'
import clsx from 'clsx'
import { VID_RE, MENTION_RE } from '../../../core/config/referencePatterns'
import { VideoReferenceTooltip } from '../../Chat/components/VideoReferenceTooltip'
import type { VideoPreviewData } from '../../Video/types'

/**
 * Shared markdown body components for KnowledgeCard and MemoryCheckpoint.
 * Handles vid:// (LLM-generated) and mention:// (legacy) video reference links.
 */
export function buildBodyComponents(videoMap?: Map<string, VideoPreviewData>): Components {
    return {
        h1: ({ className, style, children }) => <h1 className={clsx('text-sm font-bold mb-2 mt-4 first:mt-0 text-text-secondary', className)} style={style}>{children}</h1>,
        h2: ({ className, style, children }) => <h2 className={clsx('text-xs font-bold mb-2 mt-3 text-text-secondary', className)} style={style}>{children}</h2>,
        h3: ({ className, style, children }) => <h3 className={clsx('text-[11px] font-bold mb-1 mt-2 text-text-secondary', className)} style={style}>{children}</h3>,
        h4: ({ className, style, children }) => <h4 className={clsx('text-[11px] font-semibold mb-1 mt-2 text-text-secondary', className)} style={style}>{children}</h4>,
        h5: ({ className, style, children }) => <h5 className={clsx('text-[10px] font-semibold mb-1 mt-1.5 text-text-tertiary', className)} style={style}>{children}</h5>,
        h6: ({ className, style, children }) => <h6 className={clsx('text-[10px] font-medium mb-1 mt-1.5 text-text-tertiary', className)} style={style}>{children}</h6>,
        p: ({ className, style, children }) => <p className={clsx('mb-1 last:mb-0 text-xs text-text-secondary leading-relaxed', className)} style={style}>{children}</p>,
        ul: ({ className, style, children }) => <ul className={clsx('list-disc list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary', className)} style={style}>{children}</ul>,
        ol: ({ className, style, children, start }) => <ol start={start} className={clsx('list-decimal list-outside pl-5 mb-1 space-y-0.5 text-xs text-text-secondary', className)} style={style}>{children}</ol>,
        li: ({ className, style, children }) => <li className={clsx('pl-1 marker:text-text-tertiary', className)} style={style}>{children}</li>,
        strong: ({ className, style, children }) => <strong className={clsx('font-bold text-text-primary', className)} style={style}>{children}</strong>,
        code: ({ className, style, children }) => <code className={clsx('bg-bg-primary rounded px-1 py-0.5 text-[10px] font-mono text-text-primary', className)} style={style}>{children}</code>,
        blockquote: ({ className, style, children }) => <blockquote className={clsx('border-l-2 border-accent/50 pl-3 my-2 text-text-secondary italic', className)} style={style}>{children}</blockquote>,
        hr: ({ className, style }) => <hr className={clsx('my-3 border-none h-px bg-border', className)} style={style} />,
        table: ({ className, style, children }) => <table className={clsx('border-collapse w-full my-2 text-[11px]', className)} style={style}>{children}</table>,
        th: ({ className, style, children }) => <th className={clsx('border border-border p-1.5 text-left font-semibold bg-bg-primary/50 text-text-primary', className)} style={style}>{children}</th>,
        td: ({ className, style, children }) => <td className={clsx('border border-border p-1.5 text-text-secondary', className)} style={style}>{children}</td>,
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

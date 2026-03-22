import type React from 'react'
import { VID_RE, MENTION_RE, KI_RE } from '../../../../../core/config/referencePatterns'
import { VideoReferenceTooltip } from '../../../../../features/Chat/components/VideoReferenceTooltip'
import { PortalTooltip } from '../../../../ui/atoms/PortalTooltip'
import { KiPreviewTooltipContent } from './KiPreviewTooltipContent'
import type { VideoPreviewData } from '../../../../../features/Video/types'
import type { KiPreviewData } from '../types'

interface ReferenceLinkProps {
    href?: string
    children?: React.ReactNode
    videoMap?: Map<string, VideoPreviewData>
    kiMap?: Map<string, KiPreviewData>
}

/**
 * Shared `<a>` handler for react-markdown that resolves vid://, mention://, and ki:// URIs
 * into interactive tooltips.
 *
 * Used by: ChatMessageList (chat messages), bodyComponents (KI cards, Zen mode),
 * CollapsibleMarkdownSections (section headers).
 *
 * Unrecognized links render as plain external `<a>` tags.
 */
export function ReferenceLink({ href, children, videoMap, kiMap }: ReferenceLinkProps) {
    const childText = String(children)

    if (href && videoMap) {
        const mentionMatch = MENTION_RE.exec(href)
        if (mentionMatch) {
            const videoId = mentionMatch[1]
            const video = videoMap.get(videoId) ?? null
            const label = (video?.title && childText === videoId) ? video.title : childText
            return <VideoReferenceTooltip label={label} video={video} />
        }
        const vidMatch = VID_RE.exec(href)
        if (vidMatch) {
            const video = videoMap.get(vidMatch[1]) ?? null
            return <VideoReferenceTooltip label={childText} video={video} />
        }
    }

    if (href) {
        const kiMatch = KI_RE.exec(href)
        if (kiMatch) {
            const ki = kiMap?.get(kiMatch[1]) ?? null
            if (ki) {
                return (
                    <PortalTooltip
                        content={<KiPreviewTooltipContent ki={ki} videoMap={videoMap} />}
                        side="top"
                        align="center"
                        variant="glass"
                        enterDelay={200}
                        inline
                    >
                        <span className="ki-reference-highlight cursor-pointer">{children}</span>
                    </PortalTooltip>
                )
            }
            return <span className="ki-reference-highlight">{children}</span>
        }
    }

    return <a href={href} target="_blank" rel="noreferrer">{children}</a>
}

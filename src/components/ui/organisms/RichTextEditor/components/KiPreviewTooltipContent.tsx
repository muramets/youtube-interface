import type { KiPreviewData } from '../types'
import type { VideoPreviewData } from '../../../../../features/Video/types'

interface KiPreviewTooltipContentProps {
    ki: KiPreviewData
    /** Video catalog for thumbnail resolution (optional — tooltip works without it) */
    videoMap?: Map<string, VideoPreviewData>
}

/**
 * Shared tooltip content for ki:// Knowledge Item references.
 * Used in both edit mode (KiRefView MarkView) and read mode (bodyComponents markdown renderer).
 *
 * For video-scoped KI: resolves thumbnail from videoMap via ki.videoId (owner field).
 */
export function KiPreviewTooltipContent({ ki, videoMap }: KiPreviewTooltipContentProps) {
    const thumbnailUrl = ki.videoId ? videoMap?.get(ki.videoId)?.thumbnailUrl : undefined

    return (
        <div className="max-w-[280px] rounded-lg overflow-hidden">
            {thumbnailUrl && (
                <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-full aspect-video object-cover"
                />
            )}
            <div className="p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                        {ki.category}
                    </span>
                    <span className="text-[9px] text-text-tertiary capitalize">{ki.scope}</span>
                </div>
                <div className="text-xs font-medium text-text-primary mb-1">{ki.title}</div>
                <div className="text-[11px] text-text-secondary line-clamp-3">{ki.summary}</div>
            </div>
        </div>
    )
}

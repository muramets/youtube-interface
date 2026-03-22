import React, { useContext } from 'react'
import type { MarkViewProps } from '@tiptap/core'
import { MarkViewContent } from '@tiptap/react'
import { PortalTooltip } from '../../../../ui/atoms/PortalTooltip'
import { KiRefContext } from '../extensions/KiRefContext'
import { VideoRefContext } from '../extensions/VideoRefContext'
import { KiPreviewTooltipContent } from './KiPreviewTooltipContent'

/**
 * React MarkView for the kiRef mark.
 *
 * Renders the mark text (MarkViewContent) as a highlighted span with
 * a hover tooltip showing KI metadata (title, category, summary).
 * For video-scoped KI, resolves thumbnail from VideoRefContext.
 *
 * KI data is obtained via KiRefContext, video data via VideoRefContext.
 */
export const KiRefView: React.FC<MarkViewProps> = ({ mark }) => {
    const kiMap = useContext(KiRefContext)
    const videoMap = useContext(VideoRefContext)
    const kiId = mark.attrs.kiId as string
    const ki = kiMap.get(kiId) ?? null

    if (!ki) {
        return (
            <span className="ki-reference-highlight">
                <MarkViewContent as="span" />
            </span>
        )
    }

    return (
        <PortalTooltip
            content={<KiPreviewTooltipContent ki={ki} videoMap={videoMap} />}
            side="top"
            align="center"
            variant="glass"
            enterDelay={200}
            inline
        >
            <span className="ki-reference-highlight cursor-pointer">
                <MarkViewContent as="span" />
            </span>
        </PortalTooltip>
    )
}

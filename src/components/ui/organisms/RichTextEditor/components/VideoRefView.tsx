import React, { useContext } from 'react'
import type { MarkViewProps } from '@tiptap/core'
import { MarkViewContent } from '@tiptap/react'
import { PortalTooltip } from '../../../../ui/atoms/PortalTooltip'
import { VideoPreviewTooltip, PREVIEW_DIMENSIONS } from '../../../../../features/Video/components/VideoPreviewTooltip'
import { VideoRefContext } from '../extensions/VideoRefContext'

/**
 * React MarkView for the videoRef mark.
 *
 * Renders the mark text (MarkViewContent) as a highlighted span with
 * a hover tooltip showing video metadata (thumbnail, title, metrics).
 *
 * Video data is obtained via VideoRefContext (see T2.3).
 */
export const VideoRefView: React.FC<MarkViewProps> = ({ mark }) => {
    const videoMap = useContext(VideoRefContext)
    const videoId = mark.attrs.videoId as string
    const video = videoMap.get(videoId) ?? null

    if (!video) {
        return (
            <span className="video-reference-highlight">
                <MarkViewContent as="span" />
            </span>
        )
    }

    return (
        <PortalTooltip
            content={<VideoPreviewTooltip video={video} mode="mini" />}
            side="top"
            align="center"
            sizeMode="fixed"
            fixedDimensions={PREVIEW_DIMENSIONS.mini}
            variant="glass"
            enterDelay={200}
            inline
        >
            <span className="video-reference-highlight cursor-pointer">
                <MarkViewContent as="span" />
            </span>
        </PortalTooltip>
    )
}

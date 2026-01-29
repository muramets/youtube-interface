import React from 'react';
import type { TrendVideo } from '../../../core/types/trends';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { VideoPreviewTooltip } from '../../../features/Video/components/VideoPreviewTooltip';

interface TrendTooltipProps {
    video: TrendVideo;
    anchorPos: { x: number; y: number; width: number; height: number };
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    percentileGroup?: string;
    className?: string;
    isClosing?: boolean;
}

/**
 * TrendTooltip now uses the shared UI components while maintaining the same interface
 * for the Trends Timeline.
 */
export const TrendTooltip: React.FC<TrendTooltipProps> = ({
    video,
    anchorPos,
    className,
    onMouseEnter,
    onMouseLeave,
    percentileGroup,
    isClosing = false
}) => {
    // TrendTooltip now uses anchorRect for precise viewport positioning
    // anchorPos.x is center, anchorPos.y is top
    return (
        <PortalTooltip
            forceOpen={!isClosing}
            anchorRect={{
                top: anchorPos.y,
                left: anchorPos.x - anchorPos.width / 2,
                width: anchorPos.width,
                height: anchorPos.height,
                right: anchorPos.x + anchorPos.width / 2,
                bottom: anchorPos.y + anchorPos.height
            }}
            content={
                <div
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    className="pointer-events-auto"
                >
                    <VideoPreviewTooltip
                        videoId={video.id}
                        title={video.title}
                        channelTitle={video.channelTitle}
                        viewCount={video.viewCount}
                        publishedAt={video.publishedAt}
                        percentileGroup={percentileGroup}
                        description={video.description}
                        tags={video.tags}
                    />
                </div>
            }
            variant="glass"
            className={className}
        >
            <div className="hidden" />
        </PortalTooltip>
    );
};

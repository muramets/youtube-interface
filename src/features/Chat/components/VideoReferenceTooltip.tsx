// =============================================================================
// CHAT: VideoReferenceTooltip
// Inline component that renders a video title as a highlighted mention with a
// hover tooltip showing enriched video metadata.
//
// Tooltip content is rendered via unified VideoPreviewTooltip (mini mode).
// =============================================================================

import React from 'react';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import type { VideoPreviewData } from '../../Video/types';
import { VideoPreviewTooltip, PREVIEW_DIMENSIONS } from '../../Video/components/VideoPreviewTooltip';
import { OWNERSHIP_CONFIG, REF_TYPE_LABELS } from '../../../core/config/referencePatterns';
import type { ReferenceType } from '../utils/videoReferenceUtils';

// --- Props ---

interface VideoReferenceTooltipProps {
    /** The display text, e.g. "Video #3" */
    label: string;
    /** The resolved video data (null = reference not found) */
    video: VideoPreviewData | null;
    /** Reference type from parsed href (e.g. 'video', 'competitor', 'suggested') */
    refType?: ReferenceType;
    /** The parsed reference index (e.g. 3 for "Video #3") */
    index?: number;
    onBadgeClick?: () => void;
}

// --- Component ---

export const VideoReferenceTooltip: React.FC<VideoReferenceTooltipProps> = React.memo(({ label, video, refType, index, onBadgeClick }) => {
    // Graceful fallback: if video not found, render plain text (no tooltip)
    if (!video) {
        return <span>{label}</span>;
    }

    // Defense layer: derive canonical label from REF_TYPE_LABELS (keyed by
    // reference type, not ownership) so "suggested" always shows "Suggested #N"
    // even though its ownership is 'competitor'.
    const typeLabel = refType
        ? REF_TYPE_LABELS[refType]
        : (video.ownership ? OWNERSHIP_CONFIG[video.ownership]?.label : undefined);

    // Adaptive Badge Labels:
    // If an override changed the type (e.g. from "Video" to "Competitor"), the original `label`
    // (e.g. "Video #4") will misrepresent the new type. We detect this and reconstruct it.
    let displayLabel = label.trim();
    if (refType && index !== undefined && typeLabel) {
        const labelLower = displayLabel.toLowerCase();
        const typeLower = typeLabel.toLowerCase();

        if (refType !== 'video' && !labelLower.includes(typeLower)) {
            const hashStyle = label.match(/[#№]/)?.[0] ?? '#';
            displayLabel = `${typeLabel} ${hashStyle}${index}`;
        }
    }

    return (
        <PortalTooltip
            content={
                <VideoPreviewTooltip
                    video={video}
                    mode="mini"
                />
            }
            variant="glass"
            side="top"
            align="center"
            sizeMode="fixed"
            fixedDimensions={PREVIEW_DIMENSIONS.mini}
            enterDelay={200}
            triggerClassName="!inline !flex-none"
            inline
        >
            <span
                className={`video-reference-highlight ${onBadgeClick ? 'cursor-pointer hover:bg-white/10' : ''}`}
                onClick={(e) => {
                    if (onBadgeClick) {
                        e.preventDefault();
                        onBadgeClick();
                    }
                }}
            >
                {displayLabel}
            </span>
        </PortalTooltip>
    );
});
VideoReferenceTooltip.displayName = 'VideoReferenceTooltip';

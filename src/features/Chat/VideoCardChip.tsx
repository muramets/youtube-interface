// =============================================================================
// VIDEO CARD CHIP: Mini video card for chat input & message history
// Vertical layout mirrors the full VideoCard: thumbnail on top, info below
// =============================================================================

import React, { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { VideoCardContext } from '../../core/types/appContext';
import { formatDuration, formatViewCount } from '../../core/utils/formatUtils';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';

// ---------------------------------------------------------------------------
// Module-level state for cross-chip tooltip handoff.
// When a tooltip closes, we record timestamp so the next chip can skip the
// enter delay and appear instantly — creating a premium "sliding" effect.
// ---------------------------------------------------------------------------
const HANDOFF_WINDOW_MS = 400;
let lastTooltipCloseTime = 0;

interface VideoCardChipProps {
    video: VideoCardContext;
    onRemove?: () => void;
    /** Compact mode for message history (smaller, no remove button) */
    compact?: boolean;
    /** 1-based index shown as "#N" to match Gemini's numbering */
    index?: number;
    /** Short prefix for the badge, e.g. 'D' for Draft, 'P' for Published, 'C' for Competitor */
    badgePrefix?: string;
}

export const VideoCardChip: React.FC<VideoCardChipProps> = React.memo(({ video, onRemove, compact, index, badgePrefix }) => {
    const formattedDate = video.publishedAt
        ? new Date(video.publishedAt).toLocaleDateString()
        : undefined;

    // Track tooltip enter delay for cross-chip handoff logic
    const [enterDelay, setEnterDelay] = useState(500);

    const handleTooltipOpenChange = useCallback((open: boolean) => {
        if (!open) {
            lastTooltipCloseTime = Date.now();
        }
    }, []);

    // Dynamically set delay: instant if another chip tooltip was recently open
    const handlePointerEnter = useCallback(() => {
        const elapsed = Date.now() - lastTooltipCloseTime;
        setEnterDelay(elapsed < HANDOFF_WINDOW_MS ? 0 : 500);
    }, []);

    return (
        <div
            className={`
                group/chip flex flex-col rounded-lg overflow-hidden transition-all duration-200 relative
                ${compact
                    ? 'bg-white/[0.04] w-[140px]'
                    : 'bg-white/[0.05] w-[160px] hover:bg-purple-500/[0.06]'
                }
            `}
            onPointerEnter={handlePointerEnter}
        >
            {/* Remove button — overlayed top-right */}
            {onRemove && !compact && (
                <button
                    className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/60 text-white/70 flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity hover:text-red-400 hover:bg-black/80 border-none cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    title="Remove from context"
                >
                    <X size={10} />
                </button>
            )}

            {/* Thumbnail with duration badge */}
            <div className="relative w-full aspect-video bg-bg-secondary">
                {video.thumbnailUrl ? (
                    <img
                        src={video.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] to-[#0f3460]" />
                )}
                {index != null && (
                    <div className={`absolute top-1 left-1 bg-black/70 rounded text-white/90 font-semibold leading-none ${compact ? 'px-1 py-[2px] text-[8px]' : 'px-1 py-[2px] text-[9px]'}`}>
                        {badgePrefix ? `${badgePrefix}#${index}` : `#${index}`}
                    </div>
                )}
                {video.duration && (
                    <div className={`absolute bottom-1 right-1 bg-black/80 rounded text-white font-medium leading-none ${compact ? 'px-1 py-[2px] text-[8px]' : 'px-1 py-[2px] text-[9px]'}`}>
                        {formatDuration(video.duration)}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className={`flex flex-col min-w-0 ${compact ? 'px-1.5 py-1 gap-0' : 'px-2 py-1.5 gap-0.5'}`}>
                <PortalTooltip
                    content={video.title}
                    side="top"
                    align="center"
                    maxWidth={260}
                    enterDelay={enterDelay}
                    onOpenChange={handleTooltipOpenChange}
                    triggerClassName="min-w-0"
                >
                    <span className={`font-semibold text-text-primary leading-tight line-clamp-2 cursor-default ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                        {video.title}
                    </span>
                </PortalTooltip>
                <span className={`text-text-tertiary leading-tight truncate ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
                    {[
                        video.viewCount ? `${formatViewCount(video.viewCount)} views` : null,
                        formattedDate,
                    ].filter(Boolean).join(' • ')}
                </span>
            </div>
        </div>
    );
});
VideoCardChip.displayName = 'VideoCardChip';

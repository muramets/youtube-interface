// =============================================================================
// SUGGESTED TRAFFIC CHIP: Compact context chip for chat input & message history
// Shows source video + count of selected suggested videos
// =============================================================================

import React from 'react';
import { X, TrendingUp } from 'lucide-react';
import type { SuggestedTrafficContext } from '../../core/types/appContext';

interface SuggestedTrafficChipProps {
    context: SuggestedTrafficContext;
    onRemove?: () => void;
    /** Compact mode for message history (smaller, no remove button) */
    compact?: boolean;
}

export const SuggestedTrafficChip: React.FC<SuggestedTrafficChipProps> = React.memo(({ context, onRemove, compact }) => {
    const { sourceVideo, suggestedVideos } = context;
    const count = suggestedVideos.length;

    // Show up to 4 thumbnails in a mini-grid
    const previewThumbs = suggestedVideos
        .filter(v => v.thumbnailUrl)
        .slice(0, 4);

    return (
        <div
            className={`
                group/chip flex flex-col rounded-lg overflow-hidden transition-all duration-200 relative
                ${compact
                    ? 'bg-white/[0.04] w-[180px]'
                    : 'bg-white/[0.05] w-[200px] hover:bg-emerald-500/[0.06]'
                }
            `}
        >
            {/* Remove button */}
            {onRemove && !compact && (
                <button
                    className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/60 text-white/70 flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity hover:text-red-400 hover:bg-black/80 border-none cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    title="Remove from context"
                >
                    <X size={10} />
                </button>
            )}

            {/* Thumbnail grid (up to 2x2) */}
            {previewThumbs.length > 0 && (
                <div className={`w-full grid gap-px bg-black/20 ${previewThumbs.length > 2 ? 'grid-cols-2' : previewThumbs.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {previewThumbs.map((v, i) => (
                        <div key={i} className="aspect-video bg-bg-secondary overflow-hidden">
                            <img
                                src={v.thumbnailUrl}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Info section */}
            <div className={`flex flex-col min-w-0 ${compact ? 'px-1.5 py-1 gap-0.5' : 'px-2 py-1.5 gap-0.5'}`}>
                {/* Count as primary header */}
                <div className="flex items-center gap-1 min-w-0">
                    <TrendingUp size={compact ? 9 : 10} className="text-emerald-400 shrink-0" />
                    <span className={`font-semibold text-text-primary leading-tight truncate ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
                        {count} suggested video{count !== 1 ? 's' : ''} selected
                    </span>
                </div>
                {/* Source video name */}
                <span className={`text-text-tertiary leading-tight truncate ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
                    for: {sourceVideo.title}
                </span>
            </div>
        </div>
    );
});
SuggestedTrafficChip.displayName = 'SuggestedTrafficChip';

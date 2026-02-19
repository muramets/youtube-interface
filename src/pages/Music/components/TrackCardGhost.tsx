// =============================================================================
// TrackCardGhost: Lightweight drag preview for DragOverlay
// =============================================================================
// Renders only cover + title + artist — no hooks, no interactivity.
// Used in AppDndProvider and PlaylistSortableList DragOverlay.
// =============================================================================

import React from 'react';
import type { Track } from '../../../core/types/track';

interface TrackCardGhostProps {
    track: Track;
}

export const TrackCardGhost: React.FC<TrackCardGhostProps> = ({ track }) => {
    return (
        <div className="pointer-events-none flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-lg bg-[#1e1e22] shadow-2xl max-w-[220px]">
            {/* Compact cover */}
            <div
                className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                style={{
                    background: track.coverUrl
                        ? undefined
                        : 'linear-gradient(135deg, #6366f188, #6366f144)',
                }}
            >
                {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="text-white/60 text-[10px] font-bold">
                        {track.title.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>

            {/* Title only */}
            <p className="text-xs font-medium text-text-primary truncate">
                {track.title}
            </p>
        </div>
    );
};

// =============================================================================
// TrackCardGhost: Lightweight drag preview for DragOverlay
// =============================================================================
// Renders only cover + title + artist — no hooks, no interactivity.
// Used in AppDndProvider and PlaylistSortableList DragOverlay.
// =============================================================================

import React from 'react';
import { Check } from 'lucide-react';
import type { Track } from '../../../../core/types/track';

interface TrackCardGhostProps {
    track: Track;
    /** Visual-only: dims the ghost when over a non-droppable target */
    disabled?: boolean;
    /** Track is already in the hovered playlist */
    alreadyInPlaylist?: boolean;
}

export const TrackCardGhost: React.FC<TrackCardGhostProps> = ({ track, disabled, alreadyInPlaylist }) => {
    return (
        <div className={`pointer-events-none flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-lg bg-white dark:bg-[#1e1e22] shadow-2xl max-w-[220px] ${disabled ? 'opacity-40' : ''}`}>
            {/* Compact cover with optional checkmark badge */}
            <div className="relative w-7 h-7 flex-shrink-0">
                <div
                    className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center"
                    style={{
                        background: track.coverUrl
                            ? undefined
                            : 'linear-gradient(135deg, #6366f188, #6366f144)',
                    }}
                >
                    {track.coverUrl ? (
                        <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-text-primary/60 dark:text-white/60 text-[10px] font-bold">
                            {track.title.charAt(0).toUpperCase()}
                        </span>
                    )}
                </div>
                {alreadyInPlaylist && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center ring-1 ring-white dark:ring-[#1e1e22]">
                        <Check size={8} className="text-white" strokeWidth={3} />
                    </div>
                )}
            </div>

            {/* Title or "Already added" */}
            <p className={`text-xs font-medium truncate ${alreadyInPlaylist ? 'text-black/40 dark:text-white/40' : 'text-text-primary'}`}>
                {alreadyInPlaylist ? 'Already added' : track.title}
            </p>
        </div>
    );
};

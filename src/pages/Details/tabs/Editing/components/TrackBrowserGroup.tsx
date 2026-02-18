// =============================================================================
// TRACK BROWSER GROUP: Compact collapsible accordion for version-grouped tracks
// =============================================================================
// Collapsed: representative track (lowest groupOrder) with "×N" badge
// Expanded: all tracks in the group as TrackBrowserItem rows
// =============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import type { Track } from '../../../../../core/types/track';
import { TrackBrowserItem } from './TrackBrowserItem';
import { useMusicStore } from '../../../../../core/stores/musicStore';

interface TrackBrowserGroupProps {
    tracks: Track[];
    timelineTrackIds: Set<string>;
    browseTracks: Track[];
}

export const TrackBrowserGroup: React.FC<TrackBrowserGroupProps> = ({
    tracks,
    timelineTrackIds,
    browseTracks,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);

    const displayTrack = tracks[0]; // lowest groupOrder (pre-sorted by hook)
    const childTracks = tracks.slice(1);

    // Is a child (non-display) track currently playing?
    const isChildPlaying = !isExpanded
        && playingTrackId != null
        && playingTrackId !== displayTrack?.id
        && childTracks.some((t) => t.id === playingTrackId);

    // Measure content height for smooth expand animation
    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [isExpanded, tracks.length]);

    const toggleExpand = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);

    if (!displayTrack) return null;

    return (
        <div className="relative">
            {/* Display track — always visible */}
            <div className="relative">
                <TrackBrowserItem
                    track={displayTrack}
                    isOnTimeline={timelineTrackIds.has(displayTrack.id)}
                    browseTracks={browseTracks}
                />

                {/* "N versions" expand bar */}
                <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
                    className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1
                        border-none cursor-pointer transition-all duration-300 ease-out z-10"
                    style={{
                        height: 12,
                        background: isExpanded ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                    }}
                >
                    <Layers size={7} className={isExpanded ? 'text-indigo-400/80' : 'text-text-tertiary'} />
                    <span className={`text-[7px] font-medium tracking-wider uppercase ${isExpanded ? 'text-indigo-300/80' : 'text-text-tertiary'}`}>
                        {tracks.length} versions
                    </span>
                    {isChildPlaying && (
                        <span className="flex items-end gap-[1px] ml-0.5">
                            {[0, 1, 2].map((i) => (
                                <span
                                    key={i}
                                    className="w-[1.5px] rounded-full"
                                    style={{
                                        backgroundColor: 'rgb(129 140 248 / 0.8)',
                                        animation: `barBounce 0.6s ease-in-out ${i * 0.15}s infinite`,
                                    }}
                                />
                            ))}
                        </span>
                    )}
                    <ChevronDown
                        size={7}
                        className={`transition-transform duration-300 ease-out ${isExpanded ? 'text-indigo-400/60' : 'text-text-tertiary'}`}
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                </button>
            </div>

            {/* Expandable children */}
            <div
                ref={contentRef}
                className={`transition-all duration-300 ease-out ${isExpanded ? '' : 'overflow-hidden'}`}
                style={{
                    maxHeight: isExpanded ? contentHeight || 'none' : 0,
                    opacity: isExpanded ? 1 : 0,
                }}
            >
                <div
                    className="relative rounded-b-lg"
                    style={{ background: 'rgba(99,102,241,0.06)' }}
                >
                    {childTracks.map((track) => (
                        <TrackBrowserItem
                            key={track.id}
                            track={track}
                            isOnTimeline={timelineTrackIds.has(track.id)}
                            browseTracks={browseTracks}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

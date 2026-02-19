import React, { useCallback, useMemo, useState } from 'react';
import { Check, ChevronRight, ListMusic, Plus } from 'lucide-react';
import type { MusicPlaylist } from '../../../../../core/types/musicPlaylist';
import type { Track } from '../../../../../core/types/track';
import { getDefaultVariant } from '../../../../../core/utils/trackUtils';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import { createTimelineTrack } from '../../../../../core/types/editing';
import { TrackBrowserItem } from './TrackBrowserItem';

interface PlaylistBrowserItemProps {
    playlist: MusicPlaylist;
    timelineTrackIds: Set<string>;
    browseTracks: Track[];
}

export const PlaylistBrowserItem: React.FC<PlaylistBrowserItemProps> = ({ playlist, timelineTrackIds, browseTracks }) => {
    const addTrack = useEditingStore((s) => s.addTrack);
    const genres = useMusicStore((s) => s.genres);
    const [expanded, setExpanded] = useState(false);

    // Resolve playlist trackIds → Track objects
    const playlistTracks = useMemo(() => {
        return playlist.trackIds
            .map((id) => browseTracks.find((t) => t.id === id))
            .filter(Boolean) as typeof browseTracks;
    }, [playlist.trackIds, browseTracks]);

    const resolveAndAdd = useCallback(() => {
        const existing = useEditingStore.getState().tracks.map((t) => t.trackId);
        const existingSet = new Set(existing);

        for (const track of playlistTracks) {
            if (existingSet.has(track.id)) continue;
            const variant = getDefaultVariant(track);
            addTrack(createTimelineTrack(track, variant, genres));
            existingSet.add(track.id);
        }
    }, [playlistTracks, addTrack, genres]);

    // Native drag
    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.dataTransfer.setData(
            'application/x-editing-playlist',
            JSON.stringify({
                playlistId: playlist.id,
                trackIds: playlist.trackIds,
            })
        );
        e.dataTransfer.effectAllowed = 'copy';
    }, [playlist.id, playlist.trackIds]);

    const allOnTimeline = playlistTracks.length > 0 && playlistTracks.every((t) => timelineTrackIds.has(t.id));
    const accentColor = playlist.color || '#888888';

    return (
        <div>
            {/* Playlist header row */}
            <div
                draggable={!allOnTimeline}
                onDragStart={allOnTimeline ? undefined : handleDragStart}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors group ${allOnTimeline
                    ? 'opacity-40 cursor-default'
                    : 'hover:bg-hover cursor-pointer'
                    }`}
                onClick={() => setExpanded(!expanded)}
            >
                {/* Chevron */}
                <div className="flex-shrink-0 p-0.5 text-text-tertiary">
                    <ChevronRight
                        size={12}
                        className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                    />
                </div>

                {/* Icon */}
                <div
                    className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${accentColor}20` }}
                >
                    <ListMusic size={13} style={{ color: accentColor }} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text-primary truncate">{playlist.name}</p>
                    <p className="text-[10px] text-text-tertiary group-hover:text-text-secondary transition-colors truncate">
                        {playlistTracks.length} {playlistTracks.length === 1 ? 'track' : 'tracks'}
                    </p>
                </div>

                {/* Add-all / Check indicator */}
                <div className="flex-shrink-0">
                    {allOnTimeline ? (
                        <div className="p-1 text-text-tertiary">
                            <Check size={14} />
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); resolveAndAdd(); }}
                            className="p-1 rounded hover:bg-hover text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded track list */}
            {expanded && (
                <div className="pl-5 border-l border-border/50 ml-[15px]">
                    {playlistTracks.length === 0 ? (
                        <div className="py-2 text-[10px] text-text-tertiary text-center">Empty playlist</div>
                    ) : (
                        playlistTracks.map((track) => (
                            <TrackBrowserItem
                                key={track.id}
                                track={track}
                                isOnTimeline={timelineTrackIds.has(track.id)}
                                browseTracks={browseTracks}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

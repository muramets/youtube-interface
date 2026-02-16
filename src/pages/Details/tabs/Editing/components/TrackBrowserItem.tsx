import React, { useCallback } from 'react';
import { Plus, Play, Music2, Check } from 'lucide-react';
import type { Track } from '../../../../../core/types/track';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import { createTimelineTrack } from '../../../../../core/types/editing';
import { formatDuration } from '../utils/formatDuration';

interface TrackBrowserItemProps {
    track: Track;
    isOnTimeline: boolean;
}

export const TrackBrowserItem: React.FC<TrackBrowserItemProps> = ({ track, isOnTimeline }) => {
    const addTrack = useEditingStore((s) => s.addTrack);

    const defaultVariant: 'vocal' | 'instrumental' =
        track.vocalUrl ? 'vocal' : 'instrumental';

    const handleAdd = useCallback(() => {
        addTrack(createTimelineTrack(track, defaultVariant));
    }, [track, defaultVariant, addTrack]);

    const handlePlay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        useMusicStore.getState().setPlayingTrack(track.id, defaultVariant);
    }, [track.id, defaultVariant]);

    // Native drag
    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.dataTransfer.setData(
            'application/x-editing-track',
            JSON.stringify({ trackId: track.id, variant: defaultVariant })
        );
        e.dataTransfer.effectAllowed = 'copy';
    }, [track.id, defaultVariant]);

    return (
        <div
            draggable={!isOnTimeline}
            onDragStart={isOnTimeline ? undefined : handleDragStart}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors group ${isOnTimeline
                ? 'opacity-40 cursor-default'
                : 'hover:bg-hover cursor-pointer'
                }`}
            onClick={isOnTimeline ? undefined : handleAdd}
        >
            {/* Cover Art */}
            <div className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-bg-secondary">
                {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Music2 size={12} className="text-text-tertiary" />
                    </div>
                )}
                {/* Play overlay */}
                <button
                    onClick={handlePlay}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <Play size={12} fill="white" className="text-white" />
                </button>
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-primary truncate">{track.title}</p>
                <p className="text-[10px] text-text-tertiary group-hover:text-text-secondary transition-colors truncate">
                    {track.artist && `${track.artist} · `}{formatDuration(track.duration)}
                </p>
            </div>

            {/* Add indicator */}
            <div className="flex-shrink-0">
                {isOnTimeline ? (
                    <div className="p-1 text-text-tertiary">
                        <Check size={14} />
                    </div>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleAdd(); }}
                        className="p-1 rounded hover:bg-hover text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-all"
                    >
                        <Plus size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

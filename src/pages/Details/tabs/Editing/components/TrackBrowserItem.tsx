import React, { useCallback, useMemo } from 'react';
import { Plus, Play, Pause, Music2, Check, Heart } from 'lucide-react';
import type { Track } from '../../../../../core/types/track';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useMusicStore, selectAllTags } from '../../../../../core/stores/musicStore';
import { createTimelineTrack } from '../../../../../core/types/editing';
import { formatDuration } from '../utils/formatDuration';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';

interface TrackBrowserItemProps {
    track: Track;
    isOnTimeline: boolean;
    browseTracks: Track[];
}

export const TrackBrowserItem: React.FC<TrackBrowserItemProps> = ({ track, isOnTimeline, browseTracks }) => {
    const addTrack = useEditingStore((s) => s.addTrack);
    const playingTrackId = useMusicStore((s) => s.playingTrackId);
    const isPlaying = useMusicStore((s) => s.isPlaying);

    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    const isCurrentlyPlaying = playingTrackId === track.id && isPlaying;

    const defaultVariant: 'vocal' | 'instrumental' =
        track.vocalUrl ? 'vocal' : 'instrumental';

    const handleAdd = useCallback(() => {
        addTrack(createTimelineTrack(track, defaultVariant));
    }, [track, defaultVariant, addTrack]);

    const handlePlay = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCurrentlyPlaying) {
            useMusicStore.getState().setIsPlaying(false);
        } else {
            useMusicStore.getState().setPlaybackSource('browser-preview');
            // Set playback queue to all visible browser tracks
            useMusicStore.getState().setPlaybackQueue(browseTracks.map(t => t.id));
            useMusicStore.getState().setPlayingTrack(track.id, defaultVariant);
        }
    }, [track.id, defaultVariant, isCurrentlyPlaying, browseTracks]);

    const handleToggleLike = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        useMusicStore.getState().toggleLike(userId, channelId, track.id);
    }, [userId, channelId, track.id]);

    // Native drag
    const handleDragStart = useCallback((e: React.DragEvent) => {
        e.dataTransfer.setData(
            'application/x-editing-track',
            JSON.stringify({ trackId: track.id, variant: defaultVariant })
        );
        e.dataTransfer.effectAllowed = 'copy';
    }, [track.id, defaultVariant]);

    // ── Tags tooltip (grouped by category) ──
    const allTags = useMusicStore(selectAllTags);
    const categoryOrder = useMusicStore((s) => s.categoryOrder);

    const tagsTooltipContent = useMemo(() => {
        if (track.tags.length === 0) return null;

        const grouped = new Map<string, string[]>();
        for (const tagId of track.tags) {
            const tagDef = allTags.find(t => t.id === tagId);
            const category = tagDef?.category || 'Other';
            const name = tagDef?.name || tagId;
            if (!grouped.has(category)) grouped.set(category, []);
            grouped.get(category)!.push(name);
        }

        const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) => {
            const idxA = categoryOrder.indexOf(a);
            const idxB = categoryOrder.indexOf(b);
            return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB);
        });

        return (
            <div className="flex flex-col gap-2 max-w-[240px]">
                {sortedEntries.map(([category, names]) => (
                    <div key={category}>
                        <div className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider mb-1">
                            {category}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {names.map(name => (
                                <span key={name} className="text-[9px] bg-white/10 px-2 py-0.5 rounded-full text-text-secondary">
                                    {name}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [track.tags, allTags, categoryOrder]);

    return (
        <PortalTooltip
            content={tagsTooltipContent}
            enterDelay={1000}
            disabled={!tagsTooltipContent}
            side="left"
            triggerClassName="w-full min-w-0 !justify-start"
        >
            <div
                draggable={!isOnTimeline}
                onDragStart={isOnTimeline ? undefined : handleDragStart}
                className={`w-full flex items-center gap-2 px-3 py-1.5 transition-colors group ${isOnTimeline
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
                    {/* Play/Pause overlay */}
                    <button
                        onClick={handlePlay}
                        className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity
                        ${isCurrentlyPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        {isCurrentlyPlaying ? (
                            <Pause size={12} fill="white" className="text-white" />
                        ) : (
                            <Play size={12} fill="white" className="text-white" />
                        )}
                    </button>
                    {/* Playing indicator bars */}
                    {isCurrentlyPlaying && (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-[1px]">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className="w-[2px] rounded-full"
                                    style={{
                                        backgroundColor: '#fff',
                                        animation: `barBounce 0.6s ease-in-out ${i * 0.15}s infinite`,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${isCurrentlyPlaying ? 'text-indigo-400' : 'text-text-primary'}`}>{track.title}</p>
                    <p className="text-[10px] text-text-tertiary group-hover:text-text-secondary transition-colors truncate">
                        {track.artist && `${track.artist} · `}{formatDuration(track.duration)}
                    </p>
                </div>

                {/* Like heart — same styling as TrackCard */}
                <button
                    onClick={handleToggleLike}
                    className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${track.liked
                        ? 'text-red-400 hover:text-red-300'
                        : 'text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100'
                        }`}
                >
                    <Heart size={14} fill={track.liked ? 'currentColor' : 'none'} />
                </button>

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
        </PortalTooltip>
    );
};

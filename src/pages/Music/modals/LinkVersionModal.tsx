// =============================================================================
// LINK VERSION MODAL — Pick a track to link as a version
// =============================================================================

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Link, Music } from 'lucide-react';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { formatDuration } from '../utils/formatDuration';

interface LinkVersionModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceTrackId: string;
}

export const LinkVersionModal: React.FC<LinkVersionModalProps> = ({
    isOpen,
    onClose,
    sourceTrackId,
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { tracks, linkAsVersion, genres } = useMusicStore();
    const [search, setSearch] = useState('');

    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    const sourceTrack = tracks.find((t) => t.id === sourceTrackId);

    // Show only ungrouped tracks + display track (parent) of each group
    const candidates = useMemo(() => {
        const sourceGroupId = sourceTrack?.groupId;
        // Find display track ID for each group (lowest groupOrder)
        const groupDisplayIds = new Set<string>();
        const groupMap = new Map<string, typeof tracks>();
        for (const t of tracks) {
            if (!t.groupId) continue;
            if (!groupMap.has(t.groupId)) groupMap.set(t.groupId, []);
            groupMap.get(t.groupId)!.push(t);
        }
        for (const [, groupTracks] of groupMap) {
            const sorted = [...groupTracks].sort((a, b) => {
                if (a.groupOrder !== undefined && b.groupOrder !== undefined) {
                    return a.groupOrder - b.groupOrder;
                }
                return b.createdAt - a.createdAt;
            });
            if (sorted[0]) groupDisplayIds.add(sorted[0].id);
        }

        return tracks.filter((t) => {
            if (t.id === sourceTrackId) return false;
            // Exclude tracks in the same group as source
            if (sourceGroupId && t.groupId === sourceGroupId) return false;
            // For grouped tracks, only show the display track (parent)
            if (t.groupId && !groupDisplayIds.has(t.id)) return false;
            return true;
        });
    }, [tracks, sourceTrackId, sourceTrack?.groupId]);

    const filtered = useMemo(() => {
        if (!search.trim()) return candidates;
        const q = search.toLowerCase();
        return candidates.filter(
            (t) =>
                t.title.toLowerCase().includes(q) ||
                t.artist?.toLowerCase().includes(q)
        );
    }, [candidates, search]);

    const handleLink = async (targetTrackId: string) => {
        if (!userId || !channelId) return;
        await linkAsVersion(userId, channelId, sourceTrackId, targetTrackId);
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl flex flex-col overflow-hidden animate-scale-in border border-white/[0.08] shadow-2xl w-[440px] max-w-[90vw] max-h-[70vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.08]">
                    <div className="flex items-center gap-2">
                        <Link size={16} className="text-text-secondary" />
                        <h2 className="text-base font-semibold text-text-primary m-0">Link as Version</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-secondary cursor-pointer hover:text-text-primary transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2 bg-white/[0.06] rounded-lg px-3 py-2">
                        <Search size={14} className="text-text-tertiary flex-shrink-0" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search tracks..."
                            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder-text-tertiary"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Track list */}
                <div className="flex-1 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
                            <Music size={24} className="mb-2 opacity-50" />
                            <span className="text-sm">No matching tracks</span>
                        </div>
                    ) : (
                        filtered.map((track) => {
                            const genreInfo = genres.find((g) => g.id === track.genre);
                            const isInGroup = !!track.groupId;
                            return (
                                <button
                                    key={track.id}
                                    onClick={() => handleLink(track.id)}
                                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.06] transition-colors cursor-pointer bg-transparent border-none text-left"
                                >
                                    {/* Mini cover */}
                                    <div
                                        className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center"
                                        style={{
                                            background: track.coverUrl
                                                ? undefined
                                                : `linear-gradient(135deg, ${genreInfo?.color || '#6366F1'}88, ${genreInfo?.color || '#6366F1'}44)`,
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

                                    {/* Title + artist */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-text-primary truncate m-0 flex items-center gap-1.5">
                                            {track.title}
                                            {isInGroup && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-text-tertiary">
                                                    grouped
                                                </span>
                                            )}
                                        </p>
                                        <p className="text-[11px] text-text-tertiary truncate m-0">
                                            {track.artist || 'Unknown'}
                                        </p>
                                    </div>

                                    {/* Duration */}
                                    <span className="text-[11px] text-text-tertiary tabular-nums flex-shrink-0">
                                        {track.duration > 0 ? formatDuration(track.duration) : '—'}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

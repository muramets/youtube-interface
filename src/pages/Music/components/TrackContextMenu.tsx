// =============================================================================
// TrackContextMenu: Action buttons (like, download) + More dropdown + modals
// =============================================================================
//
// Extracted from TrackCard to isolate:
// - Overflow detection (ResizeObserver)
// - Download logic (fetch → blob → anchor)
// - Like/download inline buttons
// - "More" dropdown (Add to Playlist, Link Version, Settings, Delete)
// - All modal triggers (Delete confirm, Add to Playlist, Link Version)
// =============================================================================

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Heart, Download, MoreHorizontal, Trash2, Settings, ListMusic, Link, Unlink, Mic, Piano } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../../../components/ui/molecules/DropdownMenu';
import { ConfirmationModal } from '../../../components/ui/organisms/ConfirmationModal';
import { AddToMusicPlaylistModal } from '../modals/AddToMusicPlaylistModal';
import { LinkVersionModal } from '../modals/LinkVersionModal';
import { useMusicStore } from '../../../core/stores/musicStore';
import type { Track } from '../../../core/types/track';

interface TrackContextMenuProps {
    track: Track;
    userId: string;
    channelId: string;
    onDelete?: (trackId: string) => void;
    onEdit?: (track: Track) => void;
    /** Ref to the card element for overflow detection */
    cardRef: React.RefObject<HTMLDivElement | null>;
    /** Called when dropdown opens/closes — parent uses this for hover styling */
    onDropdownChange: (open: boolean) => void;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
    track,
    userId,
    channelId,
    onDelete,
    onEdit,
    cardRef,
    onDropdownChange,
}) => {
    // ── Store selectors ──────────────────────────────────────────────────
    const toggleLike = useMusicStore((s) => s.toggleLike);
    const unlinkFromGroup = useMusicStore((s) => s.unlinkFromGroup);
    const activePlaylistId = useMusicStore((s) => s.activePlaylistId);

    // ── State ────────────────────────────────────────────────────────────
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
    const [showLinkVersion, setShowLinkVersion] = useState(false);
    const [downloadVisible, setDownloadVisible] = useState(true);

    const overflowRef = useRef<HTMLDivElement>(null);
    const neededWidthRef = useRef<number>(0);

    // ── Derived ──────────────────────────────────────────────────────────
    const hasVocal = !!track.vocalUrl;
    const hasInstrumental = !!track.instrumentalUrl;
    const hasBothVariants = hasVocal && hasInstrumental;

    const downloadBaseName = useMemo(() => {
        const artist = track.artist?.trim();
        return artist ? `${artist} - ${track.title}` : track.title;
    }, [track.artist, track.title]);

    // ── Download ─────────────────────────────────────────────────────────
    const handleDownload = useCallback(async (url?: string, suffix?: string) => {
        if (!url) return;
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${downloadBaseName}${suffix ? ` ${suffix}` : ''}.mp3`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (err) {
            console.error('[TrackCard] Download failed, falling back to direct link:', err);
            window.open(url, '_blank');
        }
    }, [downloadBaseName]);

    const handleDownloadBoth = useCallback(() => {
        handleDownload(track.vocalUrl);
        setTimeout(() => handleDownload(track.instrumentalUrl, '(instr)'), 300);
    }, [handleDownload, track.vocalUrl, track.instrumentalUrl]);

    // ── Overflow detection ───────────────────────────────────────────────
    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;

        const check = () => {
            const overflows = card.scrollWidth > card.clientWidth + 1;
            if (overflows) {
                neededWidthRef.current = card.scrollWidth;
                setDownloadVisible(false);
            } else if (neededWidthRef.current > 0) {
                if (card.clientWidth >= neededWidthRef.current) {
                    neededWidthRef.current = 0;
                    setDownloadVisible(true);
                }
            }
        };

        const observer = new ResizeObserver(check);
        observer.observe(card);
        check();
        return () => observer.disconnect();
    }, [cardRef]);

    // ── Render ───────────────────────────────────────────────────────────
    return (
        <>
            {/* Like + Download (visible when they fit) */}
            {downloadVisible && (
                <div ref={overflowRef} className="flex items-center gap-0.5">
                    {/* Like heart */}
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleLike(userId, channelId, track.id); }}
                        className={`p-1.5 rounded-lg transition-colors ${track.liked
                            ? 'text-red-400 hover:text-red-300'
                            : 'text-text-tertiary hover:text-text-primary'
                            }`}
                    >
                        <Heart size={14} fill={track.liked ? 'currentColor' : 'none'} />
                    </button>

                    {/* Download */}
                    {hasBothVariants ? (
                        <DropdownMenu onOpenChange={onDropdownChange}>
                            <DropdownMenuTrigger asChild>
                                <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors flex items-center"
                                >
                                    <Download size={14} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={4}>
                                {hasVocal && (
                                    <DropdownMenuItem onClick={() => handleDownload(track.vocalUrl)}>
                                        <Mic size={14} className="mr-2" /> Vocal
                                    </DropdownMenuItem>
                                )}
                                {hasInstrumental && (
                                    <DropdownMenuItem onClick={() => handleDownload(track.instrumentalUrl, '(instr)')}>
                                        <Piano size={14} className="mr-2" /> Instrumental
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={handleDownloadBoth}>
                                    <Download size={14} className="mr-2" /> Both
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(track.vocalUrl || track.instrumentalUrl); }}
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <Download size={14} />
                        </button>
                    )}
                </div>
            )}

            {/* More menu */}
            {(onEdit || onDelete || !downloadVisible) && (
                <DropdownMenu onOpenChange={onDropdownChange}>
                    <DropdownMenuTrigger asChild>
                        <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <MoreHorizontal size={14} />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4}>
                        {onEdit && (
                            <>
                                <DropdownMenuItem onClick={() => setShowAddToPlaylist(true)}>
                                    <ListMusic size={14} className="mr-2" />
                                    {activePlaylistId && activePlaylistId !== 'liked' ? 'Manage Playlists' : 'Add to Playlist'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setShowLinkVersion(true)}>
                                    <Link size={14} className="mr-2" /> Link as Version
                                </DropdownMenuItem>
                                {track.groupId && (
                                    <DropdownMenuItem onClick={() => unlinkFromGroup(userId, channelId, track.id)}>
                                        <Unlink size={14} className="mr-2" /> Unlink from Group
                                    </DropdownMenuItem>
                                )}
                            </>
                        )}
                        {!downloadVisible && (
                            <>
                                {onEdit && <DropdownMenuSeparator />}
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); toggleLike(userId, channelId, track.id); }}>
                                    <Heart size={14} className="mr-2" fill={track.liked ? 'currentColor' : 'none'} />
                                    {track.liked ? 'Unlike' : 'Like'}
                                </DropdownMenuItem>
                                {hasBothVariants ? (
                                    <>
                                        <DropdownMenuItem onClick={() => handleDownload(track.vocalUrl)}>
                                            <Download size={14} className="mr-2" /> Download Vocal
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDownload(track.instrumentalUrl, '(instr)')}>
                                            <Download size={14} className="mr-2" /> Download Instrumental
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={handleDownloadBoth}>
                                            <Download size={14} className="mr-2" /> Download Both
                                        </DropdownMenuItem>
                                    </>
                                ) : (
                                    <DropdownMenuItem onClick={() => handleDownload(track.vocalUrl || track.instrumentalUrl)}>
                                        <Download size={14} className="mr-2" /> Download
                                    </DropdownMenuItem>
                                )}
                            </>
                        )}
                        {onEdit && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => onEdit(track)}>
                                    <Settings size={14} className="mr-2" /> Track Settings
                                </DropdownMenuItem>
                            </>
                        )}
                        {onDelete && <DropdownMenuSeparator />}
                        {onDelete && (
                            <DropdownMenuItem
                                onClick={() => setShowDeleteConfirm(true)}
                                className="text-red-400 focus:text-red-400"
                            >
                                <Trash2 size={14} className="mr-2" /> Delete Track
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {/* Delete confirmation */}
            <ConfirmationModal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => onDelete?.(track.id)}
                title="Delete Track"
                message={<>Are you sure you want to delete <strong>{track.title}</strong>? Audio files will be permanently removed.</>}
                confirmLabel="Delete"
                cancelLabel="Cancel"
            />
            {/* Add to Playlist */}
            <AddToMusicPlaylistModal
                isOpen={showAddToPlaylist}
                onClose={() => setShowAddToPlaylist(false)}
                trackId={track.id}
            />
            {/* Link Version */}
            <LinkVersionModal
                isOpen={showLinkVersion}
                onClose={() => setShowLinkVersion(false)}
                sourceTrackId={track.id}
            />
        </>
    );
};

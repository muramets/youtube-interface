import React, { useState, useRef, useEffect } from 'react';
import { ListVideo, Plus, Check } from 'lucide-react';
import { FloatingDropdownPortal } from '../../../Shared/FloatingDropdownPortal';
import { useAuth } from '../../../../hooks/useAuth';
import { useChannelStore } from '../../../../stores/channelStore';
import { useTrendStore } from '../../../../stores/trendStore';
import { usePlaylists } from '../../../../hooks/usePlaylists';
import { useVideos } from '../../../../hooks/useVideos';
import { useUIStore } from '../../../../stores/uiStore';
import { VideoService } from '../../../../services/videoService';
import { PlaylistService } from '../../../../services/playlistService';
import type { TrendVideo } from '../../../../types/trends';
import { trendVideoToVideoDetails } from '../../../../utils/videoAdapters';

interface PlaylistSelectorProps {
    video: TrendVideo;
    isOpen: boolean;
    openAbove: boolean;
    onToggle: () => void;
}

export const PlaylistSelector: React.FC<PlaylistSelectorProps> = ({
    video,
    isOpen,
    openAbove,
    onToggle
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels } = useTrendStore();
    const { playlists, addVideoToPlaylist, removeVideoFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus input when opening
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    const getChannelAvatar = (channelId: string) => {
        return channels.find(c => c.id === channelId)?.avatarUrl || '';
    };

    const handleQuickAction = async (action: () => Promise<void>) => {
        setIsProcessing(true);
        try {
            await action();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCreatePlaylist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPlaylistName.trim() || !user || !currentChannel) return;

        await handleQuickAction(async () => {
            // Ensure video exists
            const videoExists = homeVideos.some(v => v.id === video.id);
            if (!videoExists) {
                const videoDetails = trendVideoToVideoDetails(video, getChannelAvatar(video.channelId));
                await VideoService.addVideo(user.uid, currentChannel.id, {
                    ...videoDetails,
                    isPlaylistOnly: true,
                    createdAt: Date.now()
                });
            }

            const playlistId = `playlist-${Date.now()}`;
            await PlaylistService.createPlaylist(user.uid, currentChannel.id, {
                id: playlistId,
                name: newPlaylistName.trim(),
                videoIds: [video.id],
                createdAt: Date.now()
            });

            showToast(`Created "${newPlaylistName}"`, 'success');
            setNewPlaylistName('');
            onToggle(); // Close after create
        });
    };

    const handlePlaylistToggle = async (playlistId: string, playlistName: string, isInPlaylist: boolean) => {
        if (!user || !currentChannel) return;

        await handleQuickAction(async () => {
            if (isInPlaylist) {
                // Remove from playlist
                await removeVideoFromPlaylist({ playlistId, videoId: video.id });
                showToast(`Removed from "${playlistName}"`, 'success');
            } else {
                // Add to playlist - ensure video exists in DB first
                const videoExists = homeVideos.some(v => v.id === video.id);
                if (!videoExists) {
                    const videoDetails = trendVideoToVideoDetails(video, getChannelAvatar(video.channelId));
                    await VideoService.addVideo(user.uid, currentChannel.id, {
                        ...videoDetails,
                        isPlaylistOnly: true,
                        createdAt: Date.now()
                    });
                }
                await addVideoToPlaylist({ playlistId, videoId: video.id });
                showToast(`Added to "${playlistName}"`, 'success');
            }
        });
    };

    const getPlaylistContainsVideo = (playlist: { videoIds?: string[] }) => {
        return playlist.videoIds?.includes(video.id) || false;
    };

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onToggle}
                disabled={isProcessing}
                className={`p-1.5 rounded-full transition-colors ${isOpen ? 'bg-white text-black' : 'text-text-secondary hover:text-white hover:bg-white/10'} ${isProcessing ? 'opacity-50' : ''}`}
                title="Add to Playlist"
            >
                <ListVideo size={16} />
            </button>

            <FloatingDropdownPortal
                isOpen={isOpen}
                anchorRect={buttonRef.current?.getBoundingClientRect() || null}
                openAbove={openAbove}
                width={256}
            >
                <div data-portal-wrapper className="flex flex-col h-full">
                    <div className="p-2 border-b border-white/10">
                        <form onSubmit={handleCreatePlaylist} className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Create playlist..."
                                className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                value={newPlaylistName}
                                onChange={(e) => setNewPlaylistName(e.target.value)}
                            />
                            <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                        </form>
                    </div>
                    <div className="overflow-y-auto custom-scrollbar p-1 flex-1">
                        {playlists.map(playlist => {
                            const isInPlaylist = getPlaylistContainsVideo(playlist);
                            return (
                                <button
                                    key={playlist.id}
                                    onClick={() => handlePlaylistToggle(playlist.id, playlist.name, isInPlaylist)}
                                    className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors justify-between ${isInPlaylist ? 'text-white' : 'text-text-secondary hover:text-white'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <ListVideo size={14} />
                                        <span className="truncate">{playlist.name}</span>
                                    </div>
                                    {isInPlaylist && <Check size={12} className="text-green-400 flex-shrink-0" />}
                                </button>
                            );
                        })}
                        {playlists.length === 0 && (
                            <div className="text-center py-3 text-xs text-text-tertiary">No playlists</div>
                        )}
                    </div>
                </div>
            </FloatingDropdownPortal>
        </div>
    );
};

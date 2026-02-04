import React, { useState, useRef, useEffect } from 'react';
import { ListVideo, Plus, Check } from 'lucide-react';
import { FloatingDropdownPortal } from '../../../../components/ui/atoms/FloatingDropdownPortal';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useTrendStore } from '../../../../core/stores/trendStore';
import { usePlaylists } from '../../../../core/hooks/usePlaylists';
import { useVideos } from '../../../../core/hooks/useVideos';
import { useUIStore } from '../../../../core/stores/uiStore';
import { VideoService } from '../../../../core/services/videoService';
import { PlaylistService } from '../../../../core/services/playlistService';
import type { TrendVideo } from '../../../../core/types/trends';
import { trendVideoToVideoDetails } from '../../../../core/utils/videoAdapters';
import { useKeyboardNavigation } from '../../../../core/hooks/useKeyboardNavigation';

interface PlaylistSelectorProps {
    videos: TrendVideo[];
    isOpen: boolean;
    openAbove: boolean;
    onToggle: () => void;
}

export const PlaylistSelector: React.FC<PlaylistSelectorProps> = ({
    videos,
    isOpen,
    openAbove,
    onToggle
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels } = useTrendStore();
    const { playlists, addVideosToPlaylist, removeVideosFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');

    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const isMultiSelect = videos.length > 1;

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
            const videoIdsToAdd = videos.map(v => v.id);

            await Promise.all(videos.map(async (video) => {
                const videoExists = homeVideos.some(v => v.id === video.id);
                if (!videoExists) {
                    const videoDetails = trendVideoToVideoDetails(video, getChannelAvatar(video.channelId));
                    await VideoService.addVideo(user.uid, currentChannel!.id, {
                        ...videoDetails,
                        isPlaylistOnly: true,
                        createdAt: Date.now()
                    });
                }
            }));

            const playlistId = `playlist-${Date.now()}`;
            await PlaylistService.createPlaylist(user.uid, currentChannel.id, {
                id: playlistId,
                name: newPlaylistName.trim(),
                videoIds: videoIdsToAdd,
                createdAt: Date.now()
            });

            showToast(`Created "${newPlaylistName}" with ${videos.length} videos`, 'success');
            setNewPlaylistName('');
            onToggle(); // Close after create
        });
    };

    const handlePlaylistToggle = async (playlistId: string, playlistName: string, isInPlaylist: boolean) => {
        if (!user || !currentChannel) return;

        await handleQuickAction(async () => {
            const videoIds = videos.map(v => v.id);

            if (isInPlaylist) {
                // Remove ALL from playlist (Bulk Operation)
                if (videoIds.length > 0) {
                    await removeVideosFromPlaylist({ playlistId, videoIds });
                }
                showToast(isMultiSelect ? `Removed ${videos.length} videos from "${playlistName}"` : `Removed from "${playlistName}"`, 'success');
            } else {
                // Add to playlist

                // Ensure videos exist in DB
                await Promise.all(videos.map(async (video) => {
                    const videoExists = homeVideos.some(v => v.id === video.id);
                    if (!videoExists) {
                        const videoDetails = trendVideoToVideoDetails(video, getChannelAvatar(video.channelId));
                        await VideoService.addVideo(user.uid, currentChannel!.id, {
                            ...videoDetails,
                            isPlaylistOnly: true,
                            createdAt: Date.now()
                        });
                    }
                }));

                // Bulk Add
                if (videoIds.length > 0) {
                    await addVideosToPlaylist({ playlistId, videoIds });
                }
                showToast(isMultiSelect ? `Added ${videos.length} videos to "${playlistName}"` : `Added to "${playlistName}"`, 'success');
            }
        });
    };

    const getPlaylistStatus = (playlist: { videoIds?: string[] }) => {
        // Return 'all', 'some', 'none'
        if (!playlist.videoIds) return 'none';

        let count = 0;
        videos.forEach(v => {
            if (playlist.videoIds!.includes(v.id)) count++;
        });

        if (count === videos.length) return 'all';
        if (count > 0) return 'some';
        return 'none';
    };

    const filteredPlaylists = React.useMemo(() => {
        let result = playlists;

        if (newPlaylistName.trim()) {
            const searchTerms = newPlaylistName.toLowerCase().trim().split(/\s+/);
            result = playlists.filter(p => {
                const nameLower = p.name.toLowerCase();
                return searchTerms.every(term => nameLower.includes(term));
            });
        }

        // Sort by recency (updatedAt -> createdAt) to keep recently used closest to input (top)
        return [...result].sort((a, b) => {
            const timeA = a.updatedAt || a.createdAt;
            const timeB = b.updatedAt || b.createdAt;
            return timeB - timeA;
        });
    }, [playlists, newPlaylistName]);

    const { activeIndex, handleKeyDown } = useKeyboardNavigation({
        listLength: filteredPlaylists.length,
        onEnter: (index) => {
            const playlist = filteredPlaylists[index];
            const status = getPlaylistStatus(playlist);
            handlePlaylistToggle(playlist.id, playlist.name, status === 'all');
        },
        onEscape: onToggle
    });

    const listRef = useRef<HTMLDivElement>(null);

    // Scroll active item into view
    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            const item = listRef.current.children[activeIndex] as HTMLElement;
            if (item) {
                item.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

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
                <div data-portal-wrapper className="flex flex-col h-full min-h-0">
                    <div className="p-2 border-b border-white/10 bg-white/5">
                        <form onSubmit={handleCreatePlaylist} className="relative flex flex-col gap-2">
                            <div className="relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search or create playlist..."
                                    className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                    value={newPlaylistName}
                                    onChange={(e) => setNewPlaylistName(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                                <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                            </div>
                            {/* Create button removed as per UX feedback - Enter key is sufficient */}
                        </form>
                    </div>
                    <div ref={listRef} className="overflow-y-auto custom-scrollbar p-1 flex-1">
                        {filteredPlaylists.map((playlist, index) => {
                            const status = getPlaylistStatus(playlist);
                            const isChecked = status === 'all';

                            return (
                                <button
                                    key={playlist.id}
                                    onClick={() => handlePlaylistToggle(playlist.id, playlist.name, isChecked)}
                                    className={`w-full text-left px-3 py-2 text-xs rounded-lg flex items-center gap-2 transition-colors justify-between ${isChecked ? 'text-white' : 'text-text-secondary'
                                        } ${activeIndex === index ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <ListVideo size={14} />
                                        <span className="truncate">{playlist.name}</span>
                                    </div>
                                    {isChecked && <Check size={12} className="text-green-400 flex-shrink-0" />}
                                </button>
                            );
                        })}
                        {filteredPlaylists.length === 0 && !newPlaylistName && (
                            <div className="text-center py-3 text-xs text-text-tertiary">No playlists found</div>
                        )}
                        {filteredPlaylists.length === 0 && newPlaylistName && (
                            <div className="text-center py-3 text-xs text-text-tertiary">
                                Press Enter to create "{newPlaylistName}"
                            </div>
                        )}
                    </div>
                </div>
            </FloatingDropdownPortal>
        </div>
    );
};

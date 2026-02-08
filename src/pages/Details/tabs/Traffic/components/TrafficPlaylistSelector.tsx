import React, { useState, useRef, useEffect } from 'react';
import { ListVideo, Plus, Check, Loader2 } from 'lucide-react';
import { FloatingDropdownPortal } from '@/components/ui/atoms/FloatingDropdownPortal';
import { PortalTooltip } from '@/components/ui/atoms/PortalTooltip';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import { usePlaylists } from '@/core/hooks/usePlaylists';

import { useUIStore } from '@/core/stores/uiStore';
import { VideoService } from '@/core/services/videoService';
import { PlaylistService } from '@/core/services/playlistService';
import { fetchVideosBatch } from '@/core/utils/youtubeApi';
import type { TrafficSource } from '@/core/types/traffic';
import { useSettings } from '@/core/hooks/useSettings';
import type { VideoDetails } from '@/core/utils/youtubeApi';

interface TrafficPlaylistSelectorProps {
    videos: TrafficSource[];
    homeVideos: VideoDetails[];
    isOpen: boolean;
    openAbove: boolean;
    onToggle: () => void;
}

export const TrafficPlaylistSelector: React.FC<TrafficPlaylistSelectorProps> = ({
    videos,
    homeVideos,
    isOpen,
    openAbove,
    onToggle
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, addVideosToPlaylist, removeVideosFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    // ...

    // ... inside handlePlaylistToggle

    const { showToast } = useUIStore();
    const { generalSettings, isLoading: isSettingsLoading } = useSettings();

    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Auto-focus input and scroll list to bottom when opening above
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                inputRef.current?.focus();
                // When opening above, scroll to bottom so the most recent playlist is visible near the input
                if (openAbove && listRef.current) {
                    listRef.current.scrollTop = listRef.current.scrollHeight;
                }
            }, 50);
        }
    }, [isOpen, openAbove]);


    const isMounted = useRef(true);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const handleQuickAction = async (action: () => Promise<void>) => {
        setIsProcessing(true);
        try {
            await action();
        } catch (e) {
            console.error('Playlist action failed:', e);
        } finally {
            if (isMounted.current) {
                setIsProcessing(false);
            }
        }
    };

    // Helper to ensure video exists in Home (DB) before adding to playlist
    const ensureVideosExist = async (videosToProcess: TrafficSource[]) => {
        if (!user || !currentChannel) return;

        // If settings are still loading, wait a bit or warn? 
        // Realistically, they should be loaded by now, but let's be safe.
        if (isSettingsLoading && !generalSettings.apiKey) {
            showToast('Loading settings, please try again in a moment...', 'error');
            throw new Error('SETTINGS_LOADING');
        }

        const videosMissing = videosToProcess.filter(v => v.videoId && !homeVideos.some(hv => hv.id === v.videoId));
        if (videosMissing.length === 0) return;

        const apiKey = generalSettings.apiKey;
        if (!apiKey) {
            showToast('YouTube API Key not found. Please add it in settings.', 'error');
            throw new Error('API_KEY_MISSING');
        }

        const videoIds = videosMissing.map(v => v.videoId!);
        const fetchedDetailsMap = new Map<string, VideoDetails>();
        let quotaUsed = 0;

        // Batch fetch
        const BATCH_SIZE = 50;
        for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
            const chunk = videoIds.slice(i, i + BATCH_SIZE);
            try {
                const details = await fetchVideosBatch(chunk, apiKey);
                details.forEach(d => fetchedDetailsMap.set(d.id, d));
                quotaUsed += 2;
            } catch (err) {
                const error = err instanceof Error ? err : new Error('Unknown error');
                console.error("Failed to fetch batch details for playlist", error);
                showToast('Failed to fetch video details', 'error');
                throw error;
            }
        }

        await Promise.all(videosMissing.map(async (v) => {
            const fetched = fetchedDetailsMap.get(v.videoId!);
            if (!fetched) {
                console.warn(`Could not fetch details for ${v.videoId}, skipping add to home logic but proceeding with playlist.`);
                return;
            }

            const videoPayload = {
                id: v.videoId!,
                title: fetched.title, // Use fetched title
                thumbnail: fetched.thumbnail || v.thumbnail || '',
                channelId: fetched.channelId || '',
                channelTitle: fetched.channelTitle || v.channelTitle || '',
                channelAvatar: fetched.channelAvatar || '',
                viewCount: fetched.viewCount || v.views.toString(),
                publishedAt: fetched.publishedAt || v.publishedAt || new Date().toISOString(),
                duration: fetched.duration,

                isPlaylistOnly: true, // Mark as playlist-only initially
                createdAt: Date.now()
            };
            await VideoService.addVideo(user.uid, currentChannel!.id, videoPayload);
        }));

        if (quotaUsed > 0) {
            showToast(`Fetched ${videosMissing.length} videos details`, 'success');
        }
    };

    const handleCreatePlaylist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPlaylistName.trim() || !user || !currentChannel) return;

        await handleQuickAction(async () => {
            await ensureVideosExist(videos);
            const videoIdsToAdd = videos.map(v => v.videoId!).filter(Boolean);

            const playlistId = `playlist-${Date.now()}`;
            await PlaylistService.createPlaylist(user.uid, currentChannel.id, {
                id: playlistId,
                name: newPlaylistName.trim(),
                videoIds: videoIdsToAdd,
                createdAt: Date.now()
            });

            showToast(`Created "${newPlaylistName}"`, 'success');
            setNewPlaylistName('');
            onToggle(); // Close after create
        });
    };

    const handlePlaylistToggle = async (playlistId: string, _playlistName: string, isInPlaylist: boolean) => {
        if (!user || !currentChannel) return;

        await handleQuickAction(async () => {
            const videoIds = videos.map(v => v.videoId).filter((id): id is string => !!id);
            if (videoIds.length === 0) return;

            if (isInPlaylist) {
                // Remove ALL from playlist (Bulk Operation)
                await removeVideosFromPlaylist({ playlistId, videoIds });
                showToast('Removed from playlist', 'success');
            } else {
                // Add to playlist (Bulk Operation)
                await ensureVideosExist(videos);
                await addVideosToPlaylist({ playlistId, videoIds });
                showToast('Added to playlist', 'success');
            }
        });
    };

    const getPlaylistStatus = (playlist: { videoIds?: string[] }) => {
        // Return 'all', 'some', 'none'
        if (!playlist.videoIds) return 'none';

        let count = 0;
        const validVideos = videos.filter(v => v.videoId);
        if (validVideos.length === 0) return 'none';

        validVideos.forEach(v => {
            if (playlist.videoIds!.includes(v.videoId!)) count++;
        });

        if (count === validVideos.length) return 'all';
        if (count > 0) return 'some';
        return 'none';
    };

    return (
        <div className="relative">
            <PortalTooltip
                content={<span className="text-xs">Add to Playlist</span>}
                side="top"
                align="center"
                variant="glass"
                enterDelay={400}
            >
                <button
                    ref={buttonRef}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={onToggle}
                    className={`p-1.5 rounded-full transition-colors ${isOpen ? 'bg-white text-black' : 'text-text-secondary hover:text-white hover:bg-white/10'}`}
                >
                    {isProcessing ? (
                        <Loader2 size={16} className="animate-spin text-text-secondary" />
                    ) : (
                        <ListVideo size={16} />
                    )}
                </button>
            </PortalTooltip>

            <FloatingDropdownPortal
                isOpen={isOpen}
                anchorRect={buttonRef.current?.getBoundingClientRect() || null}
                openAbove={openAbove}
                width={256}
            >
                <div data-portal-wrapper className="flex flex-col h-full min-h-0">
                    <div data-portal-wrapper className="flex flex-col h-full min-h-0">
                        {/* List Section — reverse order only when dropdown opens downward so recent items stay near the input */}
                        <div ref={listRef} className={`flex-1 overflow-y-auto custom-scrollbar p-1 flex ${openAbove ? 'flex-col' : 'flex-col-reverse'}`}>
                            {playlists
                                .filter(p => p.name.toLowerCase().includes(newPlaylistName.toLowerCase()))
                                .map(playlist => {
                                    const status = getPlaylistStatus(playlist);
                                    const isChecked = status === 'all';

                                    return (
                                        <button
                                            key={playlist.id}
                                            onClick={() => handlePlaylistToggle(playlist.id, playlist.name, isChecked)}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors justify-between shrink-0 ${isChecked ? 'text-white' : 'text-text-secondary hover:text-white'
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
                            {playlists.length === 0 && (
                                <div className="text-center py-3 text-xs text-text-tertiary">No playlists</div>
                            )}
                            {playlists.length > 0 && playlists.filter(p => p.name.toLowerCase().includes(newPlaylistName.toLowerCase())).length === 0 && (
                                <div className="text-center py-3 text-xs text-text-tertiary">No matching playlists</div>
                            )}
                        </div>

                        {/* Input Section (Now Last/Bottom) */}
                        <div className="p-2 border-t border-white/10 bg-white/5 shrink-0 z-10">
                            <form onSubmit={handleCreatePlaylist} className="relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Create playlist..."
                                    className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                    value={newPlaylistName}
                                    onChange={(e) => setNewPlaylistName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            e.preventDefault();
                                            onToggle(); // Close dropdown
                                        }
                                        e.stopPropagation(); // Prevent bubbling to parent handlers
                                    }}
                                />
                                <button
                                    type="submit"
                                    className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 text-text-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!newPlaylistName.trim()}
                                    title="Create playlist"
                                >
                                    <Plus size={14} />
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </FloatingDropdownPortal>
        </div>
    );
};

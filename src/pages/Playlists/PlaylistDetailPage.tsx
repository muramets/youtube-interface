import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVideos } from '../../core/hooks/useVideos';

import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { ArrowLeft, PlaySquare } from 'lucide-react';
import { VideoGrid } from '../../features/Video/VideoGrid';
import { ZoomControls } from '../../features/Video/ZoomControls';
import { PlaylistExportControls } from '../../features/Playlists/components/PlaylistExportControls';
import { useFilterStore } from '../../core/stores/filterStore';
import { SortButton } from '../../features/Filter/SortButton';
import { usePlaylistDeltaStats, type PlaylistDeltaStats } from '../../features/Playlists/hooks/usePlaylistDeltaStats';
import type { Playlist } from '../../core/services/playlistService';

// Format number with K/M suffix
const formatDelta = (value: number | null): string | null => {
    if (value === null) return null;
    if (value >= 1_000_000) return `+${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `+${(value / 1_000).toFixed(1)}K`;
    return `+${value}`;
};

// Subtitle component with delta stats
const PlaylistSubtitle: React.FC<{
    videoCount: number;
    playlist: Playlist;
    deltaStats: PlaylistDeltaStats;
}> = ({ videoCount, playlist, deltaStats }) => {
    const { totals, isLoading } = deltaStats;
    const { delta24h, delta7d, delta30d } = totals;

    return (
        <span className="text-text-secondary text-sm">
            {videoCount} videos
            {!isLoading && delta24h !== null && (
                <> • <span className="text-green-400">{formatDelta(delta24h)}</span> views (24h)</>
            )}
            {!isLoading && delta7d !== null && (
                <> • <span className="text-green-400">{formatDelta(delta7d)}</span> views (7d)</>
            )}
            {!isLoading && delta30d !== null && (
                <> • <span className="text-green-400">{formatDelta(delta30d)}</span> views (30d)</>
            )}
            {playlist.updatedAt && playlist.updatedAt > playlist.createdAt && (
                <> • Updated {new Date(playlist.updatedAt).toLocaleDateString()}</>
            )}
            {' • '}Created {new Date(playlist.createdAt).toLocaleDateString()}
        </span>
    );
};

export const PlaylistDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, reorderPlaylistVideos, updatePlaylist, isLoading: isPlaylistsLoading } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos, isLoading: isVideosLoading } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlistVideoSortBy, setPlaylistVideoSortBy } = useFilterStore();
    const navigate = useNavigate();

    const playlist = playlists.find(p => p.id === id);

    // Local state for optimistic video order (prevents jitter on Firestore sync)
    const [localVideoOrder, setLocalVideoOrder] = React.useState<string[]>([]);

    // Sync localVideoOrder with playlist.videoIds (only if actually different)
    React.useEffect(() => {
        if (playlist?.videoIds) {
            setLocalVideoOrder(prev => {
                if (JSON.stringify(prev) !== JSON.stringify(playlist.videoIds)) {
                    return playlist.videoIds;
                }
                return prev;
            });
        }
    }, [playlist?.videoIds]);

    // Filter videos that are in the playlist
    // Use localVideoOrder for rendering to get immediate optimistic updates
    const basePlaylistVideos = useMemo(() => {
        if (localVideoOrder.length === 0) return [];
        return localVideoOrder
            .map(videoId => videos.find(v => v.id === videoId))
            .filter((v): v is NonNullable<typeof v> => v !== undefined);
    }, [localVideoOrder, videos]);

    // Delta statistics from trend data
    // We pass the BASE videos to ensure stats are fetched for all videos, regardless of sort
    const deltaStats = usePlaylistDeltaStats(basePlaylistVideos);

    // Apply sorting to the base videos
    const sortedPlaylistVideos = useMemo(() => {
        if (playlistVideoSortBy === 'views') {
            return [...basePlaylistVideos].sort((a, b) => {
                const viewsA = parseInt((a.mergedVideoData?.viewCount || a.viewCount)?.replace(/[^0-9]/g, '') || '0', 10);
                const viewsB = parseInt((b.mergedVideoData?.viewCount || b.viewCount)?.replace(/[^0-9]/g, '') || '0', 10);
                return viewsB - viewsA;
            });
        }

        if (playlistVideoSortBy === 'date') {
            return [...basePlaylistVideos].sort((a, b) => {
                const dateA = new Date(a.mergedVideoData?.publishedAt || a.publishedAt || 0).getTime();
                const dateB = new Date(b.mergedVideoData?.publishedAt || b.publishedAt || 0).getTime();
                return dateB - dateA;
            });
        }

        const getDelta = (vId: string, period: 'delta24h' | 'delta7d' | 'delta30d') => {
            const stats = deltaStats.perVideo.get(vId);
            return stats?.[period] ?? -Infinity; // Push nulls/undefined to bottom
        };

        if (playlistVideoSortBy === 'delta24h') {
            return [...basePlaylistVideos].sort((a, b) => getDelta(b.id, 'delta24h') - getDelta(a.id, 'delta24h'));
        }

        if (playlistVideoSortBy === 'delta7d') {
            return [...basePlaylistVideos].sort((a, b) => getDelta(b.id, 'delta7d') - getDelta(a.id, 'delta7d'));
        }

        if (playlistVideoSortBy === 'delta30d') {
            return [...basePlaylistVideos].sort((a, b) => getDelta(b.id, 'delta30d') - getDelta(a.id, 'delta30d'));
        }

        // 'default' = manual order
        return basePlaylistVideos;
    }, [basePlaylistVideos, playlistVideoSortBy, deltaStats]);

    // Alias for compatibility with rest of component
    const playlistVideos = sortedPlaylistVideos;

    // Lazy cleanup: auto-remove orphaned video IDs on playlist open
    const cleanupDoneRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!playlist || !user || !currentChannel) return;
        // Only run cleanup once per playlist (prevent re-running after our own update)
        if (cleanupDoneRef.current === playlist.id) return;

        const validVideoIds = playlist.videoIds.filter(vid => videos.some(v => v.id === vid));
        const orphanedCount = playlist.videoIds.length - validVideoIds.length;

        if (orphanedCount > 0) {
            cleanupDoneRef.current = playlist.id;
            // Silent fire-and-forget cleanup
            updatePlaylist({ playlistId: playlist.id, updates: { videoIds: validVideoIds } });
        }
    }, [playlist, videos, user, currentChannel, updatePlaylist]);

    const [selectedVideoIds, setSelectedVideoIds] = React.useState<Set<string>>(new Set());

    const handleToggleSelection = (id: string) => {
        setSelectedVideoIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleClearSelection = React.useCallback(() => {
        setSelectedVideoIds(new Set());
    }, []);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedVideoIds.size > 0) {
                handleClearSelection();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedVideoIds.size, handleClearSelection]);

    // Filter playlistVideos based on selection for export
    const selectedVideos = React.useMemo(() => {
        if (selectedVideoIds.size === 0) return [];
        return playlistVideos.filter(v => selectedVideoIds.has(v.id));
    }, [playlistVideos, selectedVideoIds]);

    const videosToExport = selectedVideoIds.size > 0 ? selectedVideos : playlistVideos;

    // Compute effective cover image (same logic as PlaylistCard)
    const effectiveCoverImage = useMemo(() => {
        if (!playlist) return '';

        // If playlist has an explicit cover that isn't a youtube thumbnail, keep it
        if (playlist.coverImage && !playlist.coverImage.includes('ytimg.com')) {
            return playlist.coverImage;
        }

        if (basePlaylistVideos.length === 0) return playlist.coverImage || '';

        // Use basePlaylistVideos instead of playlistVideos to ignore sorting
        const lastVideo = basePlaylistVideos[basePlaylistVideos.length - 1];

        if (lastVideo && playlist.coverImage !== lastVideo.thumbnail && playlist.coverImage !== lastVideo.customImage) {
            // Check if current cover belongs to any video in playlist
            const coverBelongsToPlaylist = basePlaylistVideos.some(v =>
                v.thumbnail === playlist.coverImage || v.customImage === playlist.coverImage
            );
            if (!coverBelongsToPlaylist) {
                return lastVideo.customImage || lastVideo.thumbnail;
            }
        }

        return playlist.coverImage || lastVideo?.customImage || lastVideo?.thumbnail || '';
    }, [playlist, basePlaylistVideos]);

    if (isPlaylistsLoading) {
        return (
            <div className="animate-fade-in flex flex-col h-full relative">
                <div className="pt-6 px-6 flex items-center gap-4 mb-0">
                    <div className="w-20 h-[45px] bg-bg-secondary rounded-lg animate-pulse" />
                    <div className="flex flex-col gap-2">
                        <div className="h-6 w-48 bg-bg-secondary rounded animate-pulse" />
                        <div className="h-4 w-32 bg-bg-secondary rounded animate-pulse" />
                    </div>
                </div>
                <VideoGrid isLoading={true} />
            </div>
        );
    }

    if (!playlist) {
        return (
            <div style={{ padding: '24px', textAlign: 'center' }}>
                <h2>Playlist not found</h2>
                <button onClick={() => navigate('/playlists')}>Back to Playlists</button>
            </div>
        );
    }



    const handlePlaylistReorder = (movedVideoId: string, targetVideoId: string) => {
        // Find these IDs in the current VISIBLE list (which might be sorted)
        const currentVisibleOrder = playlistVideos.map(v => v.id);
        const oldIndex = currentVisibleOrder.indexOf(movedVideoId);
        const newIndex = currentVisibleOrder.indexOf(targetVideoId);

        if (oldIndex === -1 || newIndex === -1 || !user || !currentChannel || !playlist) return;

        // If we are in a Sorted View (not 'default'), we need to capturing current order -> switch to default
        if (playlistVideoSortBy !== 'default') {
            // calculated new order based on VISIBLE list
            const newOrder = [...currentVisibleOrder];
            const [movedItem] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, movedItem);

            // 1. Optimistically update local order FIRST
            setLocalVideoOrder(newOrder);

            // 2. Switch UI to Manual Sort
            setPlaylistVideoSortBy('default');

            // 3. Persist this new "Manual" order
            reorderPlaylistVideos({ playlistId: playlist.id, newVideoIds: newOrder });
            return;
        }

        // Manual Mode: Standard Reorder
        // Calculate new order based on localVideoOrder (what we're currently showing)
        const localOldIndex = localVideoOrder.indexOf(movedVideoId);
        const localNewIndex = localVideoOrder.indexOf(targetVideoId);

        if (localOldIndex !== -1 && localNewIndex !== -1) {
            const newOrder = [...localVideoOrder];
            const [movedItem] = newOrder.splice(localOldIndex, 1);
            newOrder.splice(localNewIndex, 0, movedItem);

            // 1. Optimistically update local order FIRST (prevents jitter)
            setLocalVideoOrder(newOrder);

            // 2. Persist to Firestore
            reorderPlaylistVideos({ playlistId: playlist.id, newVideoIds: newOrder });
        }
    };



    return (
        <div className="animate-fade-in flex flex-col h-full relative pl-2">
            {/* Header */}
            <div className="pt-6 px-6 flex items-center gap-4 mb-3">
                <button
                    onClick={() => navigate('/playlists')}
                    className="bg-transparent border-none text-text-primary cursor-pointer flex items-center hover:text-text-secondary transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-4 flex-1">
                    <div className="w-20 h-[45px] bg-bg-secondary rounded-lg flex items-center justify-center overflow-hidden">
                        {effectiveCoverImage ? (
                            <img src={effectiveCoverImage} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <PlaySquare size={24} className="text-text-secondary" />
                        )}
                    </div>
                    <div>
                        <h1 className="m-0 text-2xl font-bold text-text-primary">{playlist.name}</h1>
                        <PlaylistSubtitle
                            videoCount={playlistVideos.length}
                            playlist={playlist}
                            deltaStats={deltaStats}
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {selectedVideoIds.size > 0 && (
                        <button
                            onClick={handleClearSelection}
                            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors border-none cursor-pointer flex items-center gap-2"
                        >
                            <span>{selectedVideoIds.size} selected</span>
                            <span className="text-white/60">×</span>
                        </button>
                    )}

                    <SortButton
                        sortOptions={[
                            { label: 'Manual Order', value: 'default' },
                            { label: 'Most Viewed', value: 'views' },
                            ...(deltaStats.totals.delta24h !== null ? [{ label: 'Views (24h)', value: 'delta24h' }] : []),
                            ...(deltaStats.totals.delta7d !== null ? [{ label: 'Views (7d)', value: 'delta7d' }] : []),
                            ...(deltaStats.totals.delta30d !== null ? [{ label: 'Views (30d)', value: 'delta30d' }] : []),
                            { label: 'Newest First', value: 'date' },
                        ]}
                        activeSort={playlistVideoSortBy}
                        onSortChange={(val) => setPlaylistVideoSortBy(val as 'views' | 'date' | 'delta24h' | 'delta7d' | 'delta30d' | 'default')}
                    />
                    <PlaylistExportControls
                        videos={videosToExport}
                        playlistName={playlist.name}
                    />
                </div>
            </div>

            {/* Reusable Video Grid */}
            <VideoGrid
                videos={playlistVideos}
                onVideoMove={handlePlaylistReorder}
                disableChannelFilter={true}
                playlistId={playlist.id}
                isLoading={isVideosLoading}
                onSetAsCover={(videoId) => {
                    const video = playlistVideos.find(v => v.id === videoId);
                    if (video && user && currentChannel) {
                        updatePlaylist({
                            playlistId: playlist.id,
                            updates: {
                                coverImage: video.customImage || video.thumbnail
                            }
                        });
                    }
                }}
                selectedIds={selectedVideoIds}
                onToggleSelection={handleToggleSelection}
                videoDeltaStats={deltaStats.perVideo}
            />

            {/* Floating Zoom Controls */}
            <ZoomControls />

            {playlistVideos.length === 0 && (
                <div className="text-center text-text-secondary mt-12">
                    <p>No videos in this playlist yet.</p>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-3 px-4 py-2 rounded-full border-none bg-bg-secondary text-text-primary cursor-pointer hover:bg-hover-bg transition-colors"
                    >
                        Go to Home to add videos
                    </button>
                </div>
            )}
        </div>
    );
};

import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVideos } from '../../core/hooks/useVideos';

import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { ArrowLeft, PlaySquare } from 'lucide-react';
import { VideoGrid } from '../../features/Video/VideoGrid';
import { ZoomControls } from '../../features/Video/ZoomControls';
import { PlaylistExportControls } from './components/PlaylistExportControls';
import { useFilterStore } from '../../core/stores/filterStore';
import { SortButton } from '../../features/Filter/SortButton';

export const PlaylistDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, reorderPlaylistVideos, updatePlaylist, isLoading: isPlaylistsLoading } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos, isLoading: isVideosLoading } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlistVideoSortBy, setPlaylistVideoSortBy } = useFilterStore();
    const navigate = useNavigate();

    const playlist = playlists.find(p => p.id === id);

    // Filter videos that are in the playlist
    // We map over playlist.videoIds to preserve order
    const playlistVideos = useMemo(() => {
        if (!playlist) return [];
        const filtered = playlist.videoIds
            .map(videoId => videos.find(v => v.id === videoId))
            .filter((v): v is NonNullable<typeof v> => v !== undefined);

        if (playlistVideoSortBy === 'views') {
            return [...filtered].sort((a, b) => {
                const viewsA = parseInt(a.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                const viewsB = parseInt(b.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                return viewsB - viewsA;
            });
        }

        if (playlistVideoSortBy === 'date') {
            return [...filtered].sort((a, b) => {
                const dateA = new Date(a.publishedAt || 0).getTime();
                const dateB = new Date(b.publishedAt || 0).getTime();
                return dateB - dateA;
            });
        }

        // 'default' = manual order (as is from playlist.videoIds)
        return filtered;
    }, [playlist, videos, playlistVideoSortBy]);

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

        if (playlistVideos.length === 0) return playlist.coverImage || '';

        const lastVideo = playlistVideos[playlistVideos.length - 1];
        if (lastVideo && playlist.coverImage !== lastVideo.thumbnail && playlist.coverImage !== lastVideo.customImage) {
            // Check if current cover belongs to any video in playlist
            const coverBelongsToPlaylist = playlistVideos.some(v =>
                v.thumbnail === playlist.coverImage || v.customImage === playlist.coverImage
            );
            if (!coverBelongsToPlaylist) {
                return lastVideo.customImage || lastVideo.thumbnail;
            }
        }

        return playlist.coverImage || lastVideo?.customImage || lastVideo?.thumbnail || '';
    }, [playlist, playlistVideos]);

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

        if (oldIndex === -1 || newIndex === -1 || !user || !currentChannel) return;

        // If we are in a Sorted View (not 'default'), we need to capturing current order -> switch to default
        if (playlistVideoSortBy !== 'default') {
            // calculated new order based on VISIBLE list
            const newOrder = [...currentVisibleOrder];
            const [movedItem] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, movedItem);

            // 1. Switch UI to Manual Sort
            setPlaylistVideoSortBy('default');

            // 2. Persist this new "Manual" order
            reorderPlaylistVideos({ playlistId: playlist.id, newVideoIds: newOrder });
            return;
        }

        // Manual Mode: Standard Reorder
        // We must map visual indices back to original full ID list if we were filtering,
        // but here playlistVideos corresponds to playlist.videoIds (filtered by existence).
        // Safest is to operate on the FULL playlist.videoIds list using the IDs.

        const originalOldIndex = playlist.videoIds.indexOf(movedVideoId);
        const originalNewIndex = playlist.videoIds.indexOf(targetVideoId);

        if (originalOldIndex !== -1 && originalNewIndex !== -1) {
            const fullOrder = [...playlist.videoIds];
            const [movedItem] = fullOrder.splice(originalOldIndex, 1);
            fullOrder.splice(originalNewIndex, 0, movedItem);
            reorderPlaylistVideos({ playlistId: playlist.id, newVideoIds: fullOrder });
        }
    };



    return (
        <div className="animate-fade-in flex flex-col h-full relative">
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
                        <span className="text-text-secondary text-sm">
                            {playlistVideos.length} videos
                            {playlist.updatedAt && playlist.updatedAt > playlist.createdAt && (
                                <> • Updated {new Date(playlist.updatedAt).toLocaleDateString()}</>
                            )}
                            {' • '}Created {new Date(playlist.createdAt).toLocaleDateString()}
                        </span>
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
                            { label: 'Newest First', value: 'date' },
                        ]}
                        activeSort={playlistVideoSortBy}
                        onSortChange={(val) => setPlaylistVideoSortBy(val as 'default' | 'views' | 'date')}
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

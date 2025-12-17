import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVideos } from '../../hooks/useVideos';

import { usePlaylists } from '../../hooks/usePlaylists';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { ArrowLeft, PlaySquare } from 'lucide-react';
import { VideoGrid } from '../Video/VideoGrid';
import { ZoomControls } from '../Video/ZoomControls';

export const PlaylistDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, reorderPlaylistVideos, isLoading: isPlaylistsLoading } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos, isLoading: isVideosLoading } = useVideos(user?.uid || '', currentChannel?.id || '');
    const navigate = useNavigate();

    const playlist = playlists.find(p => p.id === id);

    // Filter videos that are in the playlist
    // We map over playlist.videoIds to preserve order
    const playlistVideos = useMemo(() => {
        if (!playlist) return [];
        return playlist.videoIds
            .map(videoId => videos.find(v => v.id === videoId))
            .filter((v): v is NonNullable<typeof v> => v !== undefined);
    }, [playlist, videos]);

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
        // Find these IDs in the original playlist.videoIds list to handle the move safely
        const originalOldIndex = playlist.videoIds.indexOf(movedVideoId);
        const originalNewIndex = playlist.videoIds.indexOf(targetVideoId);

        if (originalOldIndex !== -1 && originalNewIndex !== -1 && user && currentChannel) {
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
                <div className="flex items-center gap-4">
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
            </div>

            {/* Reusable Video Grid */}
            <VideoGrid
                videos={playlistVideos}
                onVideoMove={handlePlaylistReorder}
                disableChannelFilter={true}
                playlistId={playlist.id}
                isLoading={isVideosLoading}
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

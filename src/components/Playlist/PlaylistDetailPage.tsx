import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVideos } from '../../context/VideosContext';
import { usePlaylists } from '../../context/PlaylistsContext';
import { ArrowLeft, PlaySquare } from 'lucide-react';
import { VideoGrid } from '../Video/VideoGrid';
import { ZoomControls } from '../Video/ZoomControls';

export const PlaylistDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { playlists, reorderPlaylistVideos } = usePlaylists();
    const { videos } = useVideos();
    const navigate = useNavigate();

    const playlist = playlists.find(p => p.id === id);

    if (!playlist) {
        return (
            <div style={{ padding: '24px', textAlign: 'center' }}>
                <h2>Playlist not found</h2>
                <button onClick={() => navigate('/playlists')}>Back to Playlists</button>
            </div>
        );
    }

    // Filter videos that are in the playlist
    // We map over playlist.videoIds to preserve order
    const playlistVideos = playlist.videoIds
        .map(videoId => videos.find(v => v.id === videoId))
        .filter((v): v is NonNullable<typeof v> => v !== undefined);

    const handlePlaylistReorder = (oldIndex: number, newIndex: number) => {
        if (oldIndex !== -1 && newIndex !== -1) {
            // We need to be careful here: playlistVideos might be shorter than playlist.videoIds if some videos were deleted but not removed from playlist.
            // But reorderPlaylistVideos expects a list of IDs.
            // The indices passed from VideoGrid correspond to the `playlistVideos` array.

            // Let's map the indices back to the video IDs.
            const movedVideoId = playlistVideos[oldIndex].id;
            const targetVideoId = playlistVideos[newIndex].id;

            // Now find these IDs in the original playlist.videoIds list to handle the move safely
            const originalOldIndex = playlist.videoIds.indexOf(movedVideoId);
            const originalNewIndex = playlist.videoIds.indexOf(targetVideoId);

            if (originalOldIndex !== -1 && originalNewIndex !== -1) {
                const fullOrder = [...playlist.videoIds];
                const [movedItem] = fullOrder.splice(originalOldIndex, 1);
                fullOrder.splice(originalNewIndex, 0, movedItem);
                reorderPlaylistVideos(playlist.id, fullOrder);
            }
        }
    };

    return (
        <div className="animate-fade-in flex flex-col h-full relative">
            {/* Header */}
            <div className="pt-6 px-6 flex items-center gap-4 mb-0">
                <button
                    onClick={() => navigate('/playlists')}
                    className="bg-transparent border-none text-text-primary cursor-pointer flex items-center hover:text-text-secondary transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <div className="flex items-center gap-4">
                    <div className="w-20 h-[45px] bg-bg-secondary rounded-lg flex items-center justify-center overflow-hidden">
                        {playlist.coverImage ? (
                            <img src={playlist.coverImage} alt="" className="w-full h-full object-cover" />
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

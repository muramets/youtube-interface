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
            {/* Header - Fixed at top of main content area? Or just scroll with content? 
                 Home page has CategoryBar sticky. 
                 Let's make the header scrollable for now, but the ZoomControls will be fixed.
             */}
            <div style={{ padding: '24px 24px 0 24px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '0' }}>
                <button
                    onClick={() => navigate('/playlists')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <ArrowLeft size={24} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                        width: '80px',
                        height: '45px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                    }}>
                        {playlist.coverImage ? (
                            <img src={playlist.coverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <PlaySquare size={24} color="var(--text-secondary)" />
                        )}
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '24px' }}>{playlist.name}</h1>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
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
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '48px' }}>
                    <p>No videos in this playlist yet.</p>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            marginTop: '12px',
                            padding: '8px 16px',
                            borderRadius: '18px',
                            border: 'none',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                        }}
                    >
                        Go to Home to add videos
                    </button>
                </div>
            )}
        </div>
    );
};

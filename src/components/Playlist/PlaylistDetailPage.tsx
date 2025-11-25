import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import { SortableVideoCard } from '../Video/SortableVideoCard';
import { ArrowLeft, PlaySquare } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';

export const PlaylistDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { playlists, videos, reorderPlaylistVideos } = useVideo();
    const navigate = useNavigate();

    const playlist = playlists.find(p => p.id === id);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

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

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id && over && id) {
            const oldIndex = playlist.videoIds.indexOf(active.id as string);
            const newIndex = playlist.videoIds.indexOf(over.id as string);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrder = [...playlist.videoIds];
                const [movedItem] = newOrder.splice(oldIndex, 1);
                newOrder.splice(newIndex, 0, movedItem);
                reorderPlaylistVideos(id, newOrder);
            }
        }
    };

    return (
        <div className="animate-fade-in" style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
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
                        justifyContent: 'center'
                    }}>
                        {playlist.coverImage ? (
                            <img src={playlist.coverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
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

            {/* Video Grid */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={playlistVideos} strategy={rectSortingStrategy}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                        gap: '24px'
                    }}>
                        {playlistVideos.map((video) => (
                            <SortableVideoCard
                                key={video.id}
                                video={video}
                                playlistId={id}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

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

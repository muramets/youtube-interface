import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlaySquare, MoreVertical } from 'lucide-react';
import type { Playlist } from '../../context/VideoContext';
import { PlaylistMenu } from './PlaylistMenu';
import './PlaylistsPage.css';

interface PlaylistCardProps {
    playlist: Playlist;
    navigate: (path: string) => void;
    handleMenuClick: (e: React.MouseEvent, id: string) => void;
    menuButtonRefs: React.MutableRefObject<{ [key: string]: HTMLButtonElement | null }>;
    openMenuId: string | null;
    setOpenMenuId: (id: string | null) => void;
    handleEdit: (e: React.MouseEvent, playlist: Playlist) => void;
    handleDeleteClick: (e: React.MouseEvent, id: string) => void;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
    playlist,
    navigate,
    handleMenuClick,
    menuButtonRefs,
    openMenuId,
    setOpenMenuId,
    handleEdit,
    handleDeleteClick
}) => {
    return (
        <div
            className="video-card-container playlist-card-container" // Reusing VideoCard container style for consistency
            onClick={() => navigate(`/playlists/${playlist.id}`)}
            style={{ padding: 0 }} // Override padding if needed, or keep consistent
        >
            <div className="video-card-hover-bg"></div>

            <div
                style={{
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    height: '100%'
                }}
            >
                {/* Cover Image Area */}
                <div style={{
                    aspectRatio: '16/9',
                    backgroundColor: 'var(--bg-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    borderRadius: '12px 12px 0 0',
                    overflow: 'hidden'
                }}>
                    {playlist.coverImage ? (
                        <img src={playlist.coverImage} alt={playlist.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <PlaySquare size={48} color="var(--text-secondary)" />
                    )}
                    <div style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        color: 'white',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                    }}>
                        {playlist.videoIds.length} videos
                    </div>
                </div>

                {/* Info Area */}
                <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--text-primary)' }}>{playlist.name}</h3>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {playlist.updatedAt && playlist.updatedAt > playlist.createdAt
                                ? `Updated ${new Date(playlist.updatedAt).toLocaleDateString()}`
                                : `Created ${new Date(playlist.createdAt).toLocaleDateString()}`
                            }
                        </p>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button
                            ref={el => { menuButtonRefs.current[playlist.id] = el; }}
                            onClick={(e) => handleMenuClick(e, playlist.id)}
                            className="playlist-menu-button"
                            onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on menu click
                        >
                            <MoreVertical size={20} />
                        </button>
                        <PlaylistMenu
                            isOpen={openMenuId === playlist.id}
                            onClose={() => setOpenMenuId(null)}
                            anchorEl={menuButtonRefs.current[playlist.id]}
                            onEdit={(e) => handleEdit(e, playlist)}
                            onDelete={(e) => handleDeleteClick(e, playlist.id)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

interface SortablePlaylistCardProps extends PlaylistCardProps {
    // No extra props needed currently
}

export const SortablePlaylistCard: React.FC<SortablePlaylistCardProps> = (props) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: props.playlist.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1000 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
        >
            <PlaylistCard {...props} />
        </div>
    );
};

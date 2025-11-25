import React, { useState, useRef } from 'react';
import { useVideo, type Playlist } from '../../context/VideoContext';
import { Plus, PlaySquare, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PlaylistEditModal } from './PlaylistEditModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { PlaylistMenu } from './PlaylistMenu';

export const PlaylistsPage: React.FC = () => {
    const { playlists, createPlaylist, deletePlaylist, updatePlaylist } = useVideo();
    const navigate = useNavigate();
    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, playlistId: string | null }>({ isOpen: false, playlistId: null });

    // Store refs for each playlist menu button
    const menuButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPlaylistName.trim()) {
            createPlaylist(newPlaylistName.trim());
            setNewPlaylistName('');
            setIsCreating(false);
        }
    };

    const handleMenuClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setOpenMenuId(openMenuId === id ? null : id);
    };

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteConfirmation({ isOpen: true, playlistId: id });
        setOpenMenuId(null);
    };

    const confirmDelete = () => {
        if (deleteConfirmation.playlistId) {
            deletePlaylist(deleteConfirmation.playlistId);
        }
        setDeleteConfirmation({ isOpen: false, playlistId: null });
    };

    const handleEdit = (e: React.MouseEvent, playlist: Playlist) => {
        e.stopPropagation();
        setEditingPlaylist(playlist);
        setOpenMenuId(null);
    };

    return (
        <div style={{ padding: '24px' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>Your Playlists</h1>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '24px'
            }}>
                {/* Create Playlist Card */}
                <div
                    className="hover-bg"
                    style={{
                        border: '2px dashed var(--border)',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '200px',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                    }}
                    onClick={() => setIsCreating(true)}
                >
                    {isCreating ? (
                        <form onSubmit={handleCreate} onClick={e => e.stopPropagation()} style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Playlist Name"
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                style={{
                                    padding: '8px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--bg-primary)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setIsCreating(false); }}
                                    style={{ padding: '6px 12px', borderRadius: '18px', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '6px 12px', borderRadius: '18px', border: 'none', background: '#3ea6ff', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    ) : (
                        <>
                            <Plus size={48} />
                            <span style={{ marginTop: '12px', fontWeight: '500' }}>Create New Playlist</span>
                        </>
                    )}
                </div>

                {/* Playlist Cards */}
                {playlists.map(playlist => (
                    <div
                        key={playlist.id}
                        className="hover-bg"
                        style={{
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative'
                        }}
                        onClick={() => navigate(`/playlists/${playlist.id}`)}
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
                                    Created {new Date(playlist.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <button
                                    ref={el => { menuButtonRefs.current[playlist.id] = el; }}
                                    onClick={(e) => handleMenuClick(e, playlist.id)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        padding: '4px'
                                    }}
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
                ))}
            </div>

            {editingPlaylist && (
                <PlaylistEditModal
                    isOpen={!!editingPlaylist}
                    onClose={() => setEditingPlaylist(null)}
                    onSave={updatePlaylist}
                    playlist={editingPlaylist}
                />
            )}

            <ConfirmationModal
                isOpen={deleteConfirmation.isOpen}
                onClose={() => setDeleteConfirmation({ isOpen: false, playlistId: null })}
                onConfirm={confirmDelete}
                title="Delete Playlist"
                message="Are you sure you want to delete this playlist? This action cannot be undone."
                confirmLabel="Delete"
            />
        </div>
    );
};

import React, { useState, useRef } from 'react';
import { useVideo, type Playlist } from '../../context/VideoContext';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PlaylistEditModal } from './PlaylistEditModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';

import './PlaylistsPage.css';

import { SortablePlaylistCard } from './PlaylistCard';

export const PlaylistsPage: React.FC = () => {
    const { playlists, createPlaylist, deletePlaylist, updatePlaylist, reorderPlaylists } = useVideo();
    const navigate = useNavigate();
    const [isCreating, setIsCreating] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, playlistId: string | null }>({ isOpen: false, playlistId: null });

    // Store refs for each playlist menu button
    const menuButtonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

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

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = playlists.findIndex((p) => p.id === active.id);
            const newIndex = playlists.findIndex((p) => p.id === over.id);
            reorderPlaylists(arrayMove(playlists, oldIndex, newIndex));
        }
    };

    return (
        <div className="animate-fade-in" style={{ padding: '24px' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>Your Playlists</h1>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
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

                    <SortableContext
                        items={playlists.map(p => p.id)}
                        strategy={rectSortingStrategy}
                    >
                        {playlists.map(playlist => (
                            <SortablePlaylistCard
                                key={playlist.id}
                                playlist={playlist}
                                navigate={navigate}
                                handleMenuClick={handleMenuClick}
                                menuButtonRefs={menuButtonRefs}
                                openMenuId={openMenuId}
                                setOpenMenuId={setOpenMenuId}
                                handleEdit={handleEdit}
                                handleDeleteClick={handleDeleteClick}
                            />
                        ))}
                    </SortableContext>
                </div>
            </DndContext>

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

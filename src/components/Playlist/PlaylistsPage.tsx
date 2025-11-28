import React, { useState, useRef } from 'react';
import { useVideo, type Playlist } from '../../context/VideoContext';
import { useNavigate } from 'react-router-dom';
import { PlaylistEditModal } from './PlaylistEditModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { FilterSortDropdown } from '../Shared/FilterSortDropdown';
import { AddContentMenu } from '../Shared/AddContentMenu';
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
    const { playlists, deletePlaylist, updatePlaylist, reorderPlaylists, searchQuery, videos } = useVideo();
    const navigate = useNavigate();
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, playlistId: string | null }>({ isOpen: false, playlistId: null });
    const [sortBy, setSortBy] = useState<'default' | 'views' | 'updated' | 'created'>('default');

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
        if (searchQuery || sortBy !== 'default') return;

        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = playlists.findIndex((p) => p.id === active.id);
            const newIndex = playlists.findIndex((p) => p.id === over.id);
            reorderPlaylists(arrayMove(playlists, oldIndex, newIndex));
        }
    };

    const filteredPlaylists = React.useMemo(() => {
        let result = playlists.filter(playlist => {
            if (!searchQuery) return true;
            return playlist.name.toLowerCase().includes(searchQuery.toLowerCase());
        });

        if (sortBy === 'views') {
            result = [...result].sort((a, b) => {
                const getViews = (p: Playlist) => p.videoIds.reduce((acc, vidId) => {
                    const video = videos.find(v => v.id === vidId);
                    const views = parseInt(video?.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                    return acc + views;
                }, 0);
                return getViews(b) - getViews(a);
            });
        } else if (sortBy === 'updated') {
            result = [...result].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        } else if (sortBy === 'created') {
            result = [...result].sort((a, b) => b.createdAt - a.createdAt);
        }

        return result;
    }, [playlists, searchQuery, sortBy, videos]);

    const sortOptions = [
        { label: 'Default (Manual)', value: 'default' },
        { label: 'Total Views', value: 'views' },
        { label: 'Date Updated', value: 'updated' },
        { label: 'Date Created', value: 'created' },
    ];

    return (
        <div className="animate-fade-in" style={{ padding: '24px 24px 24px 0px' }}>
            <div className="flex items-center justify-between mb-6">
                <h1 style={{ fontSize: '24px', margin: 0 }}>Your Playlists</h1>
                <div className="flex items-center gap-1">
                    <AddContentMenu directPlaylist={true} />
                    <FilterSortDropdown
                        sortOptions={sortOptions}
                        activeSort={sortBy}
                        onSortChange={(val) => setSortBy(val as any)}
                        showPlaylistFilter={false}
                    />
                </div>
            </div>

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
                    <SortableContext
                        items={filteredPlaylists.map(p => p.id)}
                        strategy={rectSortingStrategy}
                    >
                        {filteredPlaylists.map(playlist => (
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

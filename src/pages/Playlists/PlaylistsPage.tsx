import React, { useState } from 'react';
import { useVideos } from '../../core/hooks/useVideos';

import { useFilterStore } from '../../core/stores/filterStore';
import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { type Playlist } from '../../core/services/playlistService';
import { useNavigate } from 'react-router-dom';
import { PlaylistEditModal } from '../../features/Playlist/PlaylistEditModal';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { FilterSortDropdown } from '../../features/Filter/FilterSortDropdown';
import { AddContentMenu } from '../../components/ui/organisms/AddContentMenu';
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
import { SortablePlaylistCard } from '../../features/Playlist/PlaylistCard';
import { PlaylistsPageSkeleton } from './PlaylistsPageSkeleton';

export const PlaylistsPage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, deletePlaylist, updatePlaylist, reorderPlaylists, isLoading } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { searchQuery, playlistsSortBy, setPlaylistsSortBy } = useFilterStore();
    const navigate = useNavigate();
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, playlistId: string | null }>({ isOpen: false, playlistId: null });

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
        if (deleteConfirmation.playlistId && user && currentChannel) {
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
        if (searchQuery || playlistsSortBy !== 'default' || !user || !currentChannel) return;

        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = playlists.findIndex((p) => p.id === active.id);
            const newIndex = playlists.findIndex((p) => p.id === over.id);
            const newOrder = arrayMove(playlists, oldIndex, newIndex).map(p => p.id);
            // Optimistic update handled by store if we implemented it, or we just call reorder
            // Wait, reorderPlaylists in store takes newOrder string[]?
            // Let's check store signature.
            // reorderPlaylists: (userId, channelId, newOrder) => Promise<void>
            reorderPlaylists(newOrder);
        }
    };

    const filteredPlaylists = React.useMemo(() => {
        let result = playlists.filter(playlist => {
            if (!searchQuery) return true;
            return playlist.name.toLowerCase().includes(searchQuery.toLowerCase());
        });

        if (playlistsSortBy === 'views') {
            result = [...result].sort((a, b) => {
                const getViews = (p: Playlist) => p.videoIds.reduce((acc, vidId) => {
                    const video = videos.find(v => v.id === vidId);
                    const views = parseInt(video?.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
                    return acc + views;
                }, 0);
                return getViews(b) - getViews(a);
            });
        } else if (playlistsSortBy === 'updated') {
            result = [...result].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        } else if (playlistsSortBy === 'created') {
            result = [...result].sort((a, b) => b.createdAt - a.createdAt);
        }

        return result;
    }, [playlists, searchQuery, playlistsSortBy, videos]);

    const sortOptions = [
        { label: 'Default (Manual)', value: 'default' },
        { label: 'Total Views', value: 'views' },
        { label: 'Date Updated', value: 'updated' },
        { label: 'Date Created', value: 'created' },
    ];

    if (isLoading) {
        return <PlaylistsPageSkeleton />;
    }

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between pl-0 pr-6 py-3 sticky top-0 bg-bg-primary z-10">
                <h1 className="text-xl font-medium m-0">Your Playlists</h1>
                <div className="flex items-center gap-1">
                    <AddContentMenu directPlaylist={true} />
                    <FilterSortDropdown
                        sortOptions={sortOptions}
                        activeSort={playlistsSortBy}
                        onSortChange={(val) => setPlaylistsSortBy(val as 'default' | 'views' | 'updated' | 'created')}
                        showPlaylistFilter={false}
                    />
                </div>
            </div>

            <div className="p-6 pl-0 pt-2">

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
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
                        onSave={(id, updates) => {
                            if (user && currentChannel) {
                                updatePlaylist({ playlistId: id, updates });
                            }
                            return Promise.resolve();
                        }}
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
        </div>
    );
};

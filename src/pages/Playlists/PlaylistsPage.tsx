import React, { useState, useCallback, useMemo } from 'react';
import { useVideos } from '../../core/hooks/useVideos';
import { useFilterStore } from '../../core/stores/filterStore';
import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { type Playlist } from '../../core/services/playlistService';
import { useNavigate } from 'react-router-dom';
import { PlaylistEditModal } from '../../features/Playlists/modals/PlaylistEditModal';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { FilterSortDropdown } from '../../features/Filter/FilterSortDropdown';
import { AddContentMenu } from '../../components/ui/organisms/AddContentMenu';
import { FolderPlus } from 'lucide-react';
import {
    DndContext,
    pointerWithin,
    DragOverlay,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { PlaylistCard } from '../../features/Playlists/components/PlaylistCard';
import { PlaylistsPageSkeleton } from './PlaylistsPageSkeleton';

// New grouping imports
import { useCollapsedGroups } from '../../core/hooks/useCollapsedGroups';
import { usePlaylistsGrouping } from '../../features/Playlists/hooks/usePlaylistsGrouping';
import { usePlaylistDnD } from '../../features/Playlists/hooks/usePlaylistDnD';
import { PlaylistGroup } from '../../features/Playlists/components/PlaylistGroup';
import { GroupSettingsModal } from '../../features/Playlists/modals/GroupSettingsModal';

export const PlaylistsPage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const {
        playlists,
        deletePlaylist,
        updatePlaylist,
        isLoading,
        groupOrder,
        reorderGroupOrder,
        reorderPlaylistsInGroup,
        movePlaylistToGroup,
        renameGroup,
        deleteGroup,
        updateCache,
    } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlistsSortBy, setPlaylistsSortBy } = useFilterStore();
    const navigate = useNavigate();

    // UI State
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean, playlistId: string | null }>({ isOpen: false, playlistId: null });
    const [groupModalState, setGroupModalState] = useState<{ isOpen: boolean, groupName: string | null }>({ isOpen: false, groupName: null });

    // Collapsed groups persistence
    const { isGroupCollapsed, toggleGroup } = useCollapsedGroups('playlists-collapsed-groups', false);

    // Filter and sort playlists
    const filteredPlaylists = useMemo(() => {
        let result = playlists;

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
    }, [playlists, playlistsSortBy, videos]);



    // Grouping logic
    const { groupedPlaylists } = usePlaylistsGrouping(filteredPlaylists, groupOrder, playlistsSortBy);

    // DnD is only enabled (sorting shouldn't block drag start)
    const isDragEnabled = true;

    // DnD handlers
    const handleReorderGroups = useCallback((newOrder: string[]) => {
        reorderGroupOrder(newOrder);
    }, [reorderGroupOrder]);

    const handleReorderPlaylists = useCallback((orderedIds: string[]) => {
        reorderPlaylistsInGroup(orderedIds);
    }, [reorderPlaylistsInGroup]);

    const handleMovePlaylist = useCallback((id: string, newGroup: string, orderedIds: string[]) => {
        movePlaylistToGroup({ playlistId: id, newGroup, orderedIds });
    }, [movePlaylistToGroup]);

    const {
        sensors,
        active,
        handleDragStart,
        handleDragOver,
        handleDragEnd,
        optimisticGroupedPlaylists
    } = usePlaylistDnD({
        groupedPlaylists,
        onReorderGroups: handleReorderGroups,
        onReorderPlaylists: handleReorderPlaylists,
        onMovePlaylist: handleMovePlaylist,
        sortBy: playlistsSortBy,
        onSortModeSwitch: useCallback((optimisticData?: Playlist[]) => {
            console.log('[PlaylistsPage] ========== MODE SWITCH REQUEST ==========');

            // React 18 Auto-Batching:
            // This ensures updateCache and setPlaylistsSortBy trigger a SINGLE render
            // This prevents the "render waterfall" where data is sorted by date before switching to manual
            if (optimisticData) {
                console.log('[PlaylistsPage] Applying optimistic data before switch');
                updateCache(optimisticData);
            }

            console.log('[PlaylistsPage] Switching from', playlistsSortBy, 'to default');
            setPlaylistsSortBy('default');
        }, [setPlaylistsSortBy, playlistsSortBy, updateCache]),
    });

    // Menu handlers
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

    const handleGroupEdit = useCallback((groupName: string) => {
        setGroupModalState({ isOpen: true, groupName });
    }, []);

    const handleGroupSave = useCallback(async (name: string, originalName: string | null) => {
        if (originalName) {
            // Rename existing group
            await renameGroup({ oldName: originalName, newName: name });
        } else {
            // Create new group - just add to order, playlists can be moved into it
            const newOrder = [...groupOrder, name];
            await reorderGroupOrder(newOrder);
        }
    }, [renameGroup, groupOrder, reorderGroupOrder]);

    const handleGroupDelete = useCallback(async (groupName: string) => {
        await deleteGroup(groupName);
    }, [deleteGroup]);

    const sortOptions = [
        { label: 'Default (Manual)', value: 'default' },
        { label: 'Total Views', value: 'views' },
        { label: 'Date Updated', value: 'updated' },
        { label: 'Date Created', value: 'created' },
    ];

    if (isLoading) {
        return <PlaylistsPageSkeleton />;
    }

    // Find active playlist for drag overlay
    const activePlaylist = active.playlist;

    return (
        <div className="animate-fade-in pl-2">
            <div className="flex items-center justify-between pr-6 py-3 sticky top-0 bg-bg-primary z-10">
                <h1 className="text-xl font-medium m-0">Your Playlists</h1>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setGroupModalState({ isOpen: true, groupName: null })}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-secondary hover:text-primary hover:bg-hover-bg rounded-lg transition-colors"
                        title="Create Group"
                    >
                        <FolderPlus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Group</span>
                    </button>
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
                    collisionDetection={pointerWithin}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={optimisticGroupedPlaylists.map(([name]) => `group-${name}`)}
                        strategy={verticalListSortingStrategy}
                        disabled={!isDragEnabled}
                    >
                        {optimisticGroupedPlaylists.map(([groupName, groupPlaylists]) => (
                            <PlaylistGroup
                                key={groupName}
                                groupName={groupName}
                                playlists={groupPlaylists}
                                isDragEnabled={isDragEnabled}
                                isCollapsed={isGroupCollapsed(groupName)}
                                onToggleCollapse={() => toggleGroup(groupName)}
                                onGroupEdit={handleGroupEdit}
                                navigate={navigate}
                                handleMenuClick={handleMenuClick}
                                openMenuId={openMenuId}
                                setOpenMenuId={setOpenMenuId}
                                handleEdit={handleEdit}
                                handleDeleteClick={handleDeleteClick}
                                hideHeader={optimisticGroupedPlaylists.length === 1 && groupName === 'Ungrouped'}
                            />
                        ))}
                    </SortableContext>

                    {/* Drag Overlay */}
                    <DragOverlay dropAnimation={null}>
                        {active.id && activePlaylist ? (
                            <div className="opacity-90 pointer-events-none shadow-2xl">
                                <PlaylistCard
                                    playlist={activePlaylist}
                                    navigate={() => { }}
                                    handleMenuClick={() => { }}
                                    openMenuId={null}
                                    setOpenMenuId={() => { }}
                                    handleEdit={() => { }}
                                    handleDeleteClick={() => { }}
                                />
                            </div>
                        ) : active.group ? (
                            <div className="bg-bg-secondary/90 backdrop-blur-md p-4 rounded-lg border border-border shadow-2xl">
                                <span className="text-xl font-semibold">{active.group}</span>
                            </div>
                        ) : null}
                    </DragOverlay>
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

                <GroupSettingsModal
                    isOpen={groupModalState.isOpen}
                    onClose={() => setGroupModalState({ isOpen: false, groupName: null })}
                    groupName={groupModalState.groupName}
                    onSave={handleGroupSave}
                    onDelete={groupModalState.groupName ? handleGroupDelete : undefined}
                />
            </div>
        </div>
    );
};

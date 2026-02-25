import React, { useState, useCallback, useMemo } from 'react';
import { useVideos } from '../../core/hooks/useVideos';
import { useFilterStore } from '../../core/stores/filterStore';
import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { type Playlist } from '../../core/services/playlistService';
import { VideoService } from '../../core/services/videoService';
import { useNavigate } from 'react-router-dom';
import { PlaylistEditModal } from '../../features/Playlists/modals/PlaylistEditModal';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { FilterSortDropdown } from '../../features/Filter/FilterSortDropdown';
import { AddContentMenu } from '../../components/ui/organisms/AddContentMenu';
import { FolderPlus } from 'lucide-react';
import {
    DndContext,
    closestCorners,
    pointerWithin,
    DragOverlay,
    MeasuringStrategy,
    type CollisionDetection,
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

// Cross-playlist selection
import { useVideoSelectionStore, selectTotalCount, selectAllSelectedIds } from '../../core/stores/videoSelectionStore';
import { VideoSelectionFloatingBar } from '../../features/Video/components/VideoSelectionFloatingBar';
import { useSelectionContextBridge } from '../../features/Video/hooks/useSelectionContextBridge';
import { useAddToCanvas } from '../../features/Video/hooks/useAddToCanvas';

// using Always ensures that when we mutate the DOM (Live Pattern), dnd-kit
// immediately remeasures the containers, preventing stale transforms/flying cards.
const DND_MEASURING_CONFIG = {
    droppable: {
        strategy: MeasuringStrategy.Always,
    },
};

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
        batchNormalizeOrders,
        renameGroup,
        deleteGroup,
        updateCache,
    } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlistsSortBy, setPlaylistsSortBy, savePageState, loadPageState } = useFilterStore();
    const navigate = useNavigate();

    // Per-page state persistence: load on enter, save on leave
    React.useEffect(() => {
        loadPageState('playlists-list');
        return () => savePageState('playlists-list');
    }, [loadPageState, savePageState]);

    // ── Cross-playlist selection ─────────────────────────────────────
    const totalSelected = useVideoSelectionStore(selectTotalCount);
    const allSelectedIds = useVideoSelectionStore(selectAllSelectedIds);
    const clearAll = useVideoSelectionStore(s => s.clearAll);
    useSelectionContextBridge();

    // Escape clears all selections
    React.useEffect(() => {
        if (totalSelected === 0) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                clearAll();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [totalSelected, clearAll]);

    const handleAddToCanvas = useAddToCanvas();

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
        onBatchNormalizeOrders: batchNormalizeOrders,
        sortBy: playlistsSortBy,
        onSortModeSwitch: useCallback((optimisticData?: Playlist[]) => {
            // React 18 Auto-Batching:
            // This ensures updateCache and setPlaylistsSortBy trigger a SINGLE render
            // This prevents the "render waterfall" where data is sorted by date before switching to manual
            if (optimisticData) {
                updateCache(optimisticData);
            }

            setPlaylistsSortBy('default');
        }, [setPlaylistsSortBy, updateCache]),
    });

    // Custom collision detection: smooth for groups, precise for playlists
    const collisionDetection: CollisionDetection = useCallback((args) => {
        const activeId = String(args.active.id);
        // Groups need closestCorners for smooth "parting" animation with variable heights
        if (activeId.startsWith('group-')) {
            return closestCorners(args);
        }
        // Playlists need pointerWithin to avoid cross-group interference
        return pointerWithin(args);
    }, []);

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

    const confirmDelete = async () => {
        if (!deleteConfirmation.playlistId || !user || !currentChannel) {
            setDeleteConfirmation({ isOpen: false, playlistId: null });
            return;
        }

        const playlistId = deleteConfirmation.playlistId;
        const playlist = playlists.find(p => p.id === playlistId);

        // 1. Optimistic UI: remove playlist from cache immediately
        updateCache(playlists.filter(p => p.id !== playlistId));
        setDeleteConfirmation({ isOpen: false, playlistId: null });

        // 2. Background cleanup (fire-and-forget — Firestore subscription will reconcile)
        const uid = user.uid;
        const chId = currentChannel.id;

        (async () => {
            try {
                // Smart orphan cleanup
                if (playlist && playlist.videoIds.length > 0) {
                    const otherPlaylists = playlists.filter(p => p.id !== playlistId);

                    await Promise.all(playlist.videoIds.map(async (videoId) => {
                        const isInOtherPlaylist = otherPlaylists.some(p => p.videoIds.includes(videoId));
                        if (isInOtherPlaylist) return;

                        const video = videos.find(v => v.id === videoId);
                        if (!video || !video.isCustom) return;

                        if (!video.publishedVideoId) {
                            await VideoService.deleteVideo(uid, chId, videoId);
                        } else {
                            await VideoService.updateVideo(uid, chId, videoId, {
                                isPlaylistOnly: false,
                                addedToHomeAt: Date.now(),
                            });
                        }
                    }));
                }

                // Delete the playlist doc from Firestore
                await deletePlaylist(playlistId);
            } catch (error) {
                console.error('[PlaylistsPage] Background cleanup failed:', error);
            }
        })();
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
                    collisionDetection={collisionDetection}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    measuring={DND_MEASURING_CONFIG}
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
                    message="Are you sure you want to delete this playlist? Custom videos without a YouTube link that aren't in other playlists will be permanently deleted. Custom videos with a YouTube link will be moved to your Home page."
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

            {/* Cross-playlist floating action bar */}
            <VideoSelectionFloatingBar
                selectedIds={allSelectedIds}
                onClearSelection={clearAll}
                onAddToCanvas={handleAddToCanvas}
            />
        </div>
    );
};

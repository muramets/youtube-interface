// =============================================================================
// MUSIC PAGE: Main library page with track list, filters, and player
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus, Search, Settings, Upload, Music, Heart, ArrowLeft, ListMusic, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useMusicStore } from '../../core/stores/musicStore';
import { useTrackDisplay, type DisplayItem } from './hooks/useTrackDisplay';
import { TrackCard } from './components/TrackCard';
import { TrackGroupCard } from './components/TrackGroupCard';
import { UploadTrackModal } from './modals/UploadTrackModal';
import { MusicSettingsModal } from './modals/MusicSettingsModal';
import { TrackService } from '../../core/services/trackService';
import type { Track } from '../../core/types/track';
import { deleteTrackFolder } from '../../core/services/storageService';
import { Button } from '../../components/ui/atoms';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { MusicFilterBar } from './components/MusicFilterBar';
import { MusicErrorBoundary } from './components/MusicErrorBoundary';
import { TrackCardGhost } from './components/TrackCardGhost';
import { SortButton } from '../../features/Filter/SortButton';
import { useFilterStore } from '../../core/stores/filterStore';
import type { SharedLibraryEntry } from '../../core/types/musicSharing';
import { Share2 } from 'lucide-react';

// -----------------------------------------------------------------------------
// Sortable wrapper for playlist drag reorder — mirrors TrackGroupCard pattern
// -----------------------------------------------------------------------------
const SortablePlaylistTrackItem: React.FC<{
    track: Track;
    selectedTrackId: string | null;
    userId: string;
    channelId: string;
    onSelect: (trackId: string | null) => void;
    onDelete?: (trackId: string) => void;
    onEdit?: (track: Track) => void;
}> = React.memo(({ track, selectedTrackId, userId, channelId, onSelect, onDelete, onEdit }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: track.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center">
            {/* Drag handle */}
            <div
                {...attributes}
                {...listeners}
                className="flex-shrink-0 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-secondary transition-colors"
            >
                <GripVertical size={14} />
            </div>
            <div className="flex-1 min-w-0">
                <TrackCard
                    track={track}
                    isSelected={selectedTrackId === track.id}
                    userId={userId}
                    channelId={channelId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    disableDrag
                />
            </div>
        </div>
    );
});

export const MusicPage: React.FC = () => {
    "use no memo"; // useVirtualizer returns non-memoizable functions
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const ownTracks = useMusicStore(s => s.tracks);
    const sharedTracks = useMusicStore(s => s.sharedTracks);
    const isLoading = useMusicStore(s => s.isLoading);
    const subscribe = useMusicStore(s => s.subscribe);
    const loadSettings = useMusicStore(s => s.loadSettings);
    const selectedTrackId = useMusicStore(s => s.selectedTrackId);
    const setSelectedTrackId = useMusicStore(s => s.setSelectedTrackId);
    const playingTrackId = useMusicStore(s => s.playingTrackId);
    const genreFilter = useMusicStore(s => s.genreFilter);
    const setGenreFilter = useMusicStore(s => s.setGenreFilter);
    const toggleTagFilter = useMusicStore(s => s.toggleTagFilter);
    const setBpmFilter = useMusicStore(s => s.setBpmFilter);
    const clearFilters = useMusicStore(s => s.clearFilters);
    const tagFilters = useMusicStore(s => s.tagFilters);
    const bpmFilter = useMusicStore(s => s.bpmFilter);
    const ownGenres = useMusicStore(s => s.genres);
    const sharedGenres = useMusicStore(s => s.sharedGenres);
    const ownTags = useMusicStore(s => s.tags);
    const sharedTags = useMusicStore(s => s.sharedTags);
    const categoryOrder = useMusicStore(s => s.categoryOrder);
    const featuredCategories = useMusicStore(s => s.featuredCategories);
    const sortableCategories = useMusicStore(s => s.sortableCategories);
    const ownPlaylists = useMusicStore(s => s.musicPlaylists);
    const sharedPlaylists = useMusicStore(s => s.sharedPlaylists);
    const activePlaylistId = useMusicStore(s => s.activePlaylistId);
    const reorderPlaylistTracks = useMusicStore(s => s.reorderPlaylistTracks);
    const setActivePlaylist = useMusicStore(s => s.setActivePlaylist);
    const sharedLibraries = useMusicStore(s => s.sharedLibraries);
    const activeLibrarySource = useMusicStore(s => s.activeLibrarySource);
    const setActiveLibrarySource = useMusicStore(s => s.setActiveLibrarySource);
    const loadSharedLibraries = useMusicStore(s => s.loadSharedLibraries);

    const { musicSortBy, musicSortAsc, setMusicSortBy, setMusicSortAsc } = useFilterStore();

    const [showUpload, setShowUpload] = useState(false);
    const [editingTrack, setEditingTrack] = useState<Track | null>(null);
    const [showSettings, setShowSettings] = useState<'genres' | 'tags' | 'share' | null>(null);

    // Scroll container ref for virtualizer
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const location = useLocation();
    const navigate = useNavigate();

    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    // Sync activePlaylistId from URL
    useEffect(() => {
        const path = location.pathname;
        if (path === '/music/liked') {
            setActivePlaylist('liked');
        } else if (path.startsWith('/music/playlist/')) {
            const id = path.split('/music/playlist/')[1];
            if (id) setActivePlaylist(id);
        } else {
            setActivePlaylist(null);
        }
    }, [location.pathname, setActivePlaylist]);

    // Subscribe to tracks
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubscribe = subscribe(userId, channelId);
        loadSettings(userId, channelId);
        return unsubscribe;
    }, [userId, channelId, subscribe, loadSettings]);

    // Load shared libraries for the current channel
    useEffect(() => {
        if (!userId || !channelId) return;
        loadSharedLibraries(userId, channelId);
    }, [userId, channelId, loadSharedLibraries]);

    // Subscribe to shared library tracks once shared libraries metadata is loaded
    const subscribeSharedLibraryTracks = useMusicStore(s => s.subscribeSharedLibraryTracks);
    useEffect(() => {
        const unsub = subscribeSharedLibraryTracks();
        return unsub;
    }, [sharedLibraries, subscribeSharedLibraryTracks]);

    // Determine if in read-only mode (viewing shared library)
    const isReadOnly = activeLibrarySource !== null;

    // ── View-layer source switching ──────────────────────────────────────
    // Own tracks are always subscribed. Shared tracks are populated by
    // subscribeSharedLibraryTracks() in the store. MusicPage picks which
    // source to display based on activeLibrarySource.
    const tracks = useMemo(
        () => activeLibrarySource ? sharedTracks : ownTracks,
        [activeLibrarySource, sharedTracks, ownTracks]
    );
    const genres = useMemo(
        () => activeLibrarySource ? sharedGenres : ownGenres,
        [activeLibrarySource, sharedGenres, ownGenres]
    );
    const tags = useMemo(
        () => activeLibrarySource ? sharedTags : ownTags,
        [activeLibrarySource, sharedTags, ownTags]
    );
    const musicPlaylists = useMemo(
        () => activeLibrarySource ? sharedPlaylists : ownPlaylists,
        [activeLibrarySource, sharedPlaylists, ownPlaylists]
    );

    // ── Filter, sort, group, queue ───────────────────────────────────────
    const { filteredTracks, displayItems, bpmRange, hasActiveFilters, hasLikedTracks } =
        useTrackDisplay({ tracks, tags, musicPlaylists, activePlaylistId });

    const handleDeleteTrack = useCallback(async (trackId: string) => {
        if (!userId || !channelId) return;

        try {
            // Auto-cleanup: if this track is in a group, check remaining members
            const track = tracks.find((t) => t.id === trackId);
            if (track?.groupId) {
                const remaining = tracks.filter(
                    (t) => t.groupId === track.groupId && t.id !== trackId
                );
                // If only 1 track remains, remove its groupId
                if (remaining.length === 1) {
                    await TrackService.updateTrack(userId, channelId, remaining[0].id, {
                        groupId: undefined,
                    });
                }
            }

            await deleteTrackFolder(userId, channelId, trackId);
            await TrackService.deleteTrack(userId, channelId, trackId);
        } catch (error) {
            console.error('[Music] Failed to delete track:', error);
        }
    }, [userId, channelId, tracks]);

    const handleEditTrack = useCallback((track: Track) => {
        setEditingTrack(track);
    }, []);

    // -------------------------------------------------------------------------
    // Virtualizer — only mount visible rows in the DOM
    // -------------------------------------------------------------------------
    const TRACK_ROW_HEIGHT = 88; // px — py-4 (32px) + h-14 cover (56px)

    // getItemKey: cache measured heights by item key (track.id / groupId)
    // instead of index. When items shift after grouping/ungrouping, the
    // correct cached size follows the item — no need for measure() resets.
    const getItemKey = useCallback((index: number) => {
        const item = displayItems[index];
        return item.type === 'group' ? item.groupId : item.track.id;
    }, [displayItems]);

    // eslint-disable-next-line react-hooks/incompatible-library -- opted out via "use no memo"
    const virtualizer = useVirtualizer({
        count: displayItems.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => TRACK_ROW_HEIGHT,
        overscan: 8,
        getItemKey,
    });

    // Is the playlist in drag-reorder mode?
    const isPlaylistDragMode = !!(
        activePlaylistId &&
        activePlaylistId !== 'liked' &&
        musicSortBy === 'playlistOrder' &&
        !isReadOnly
    );

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 px-6 pt-6 pb-4">
                {/* Library Switcher (shown when shared libraries exist) */}
                {/* Library Switcher — animated slide-down via CSS Grid 0fr→1fr */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: sharedLibraries.length > 0 && !activePlaylistId ? '1fr' : '0fr',
                        transition: 'grid-template-rows 0.25s ease-out',
                    }}
                >
                    <div style={{ overflow: 'hidden' }}>
                        <div className="flex items-center gap-1.5 mb-4 p-1 bg-white/[0.04] rounded-xl w-fit">
                            <button
                                onClick={() => setActiveLibrarySource(null)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!activeLibrarySource
                                    ? 'bg-white/[0.1] text-text-primary shadow-sm'
                                    : 'text-text-secondary hover:text-text-primary'
                                    }`}
                            >
                                My Library
                            </button>
                            {sharedLibraries.map((lib: SharedLibraryEntry) => (
                                <button
                                    key={lib.ownerChannelId}
                                    onClick={() => setActiveLibrarySource(lib)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${activeLibrarySource?.ownerChannelId === lib.ownerChannelId
                                        ? 'bg-white/[0.1] text-text-primary shadow-sm'
                                        : 'text-text-secondary hover:text-text-primary'
                                        }`}
                                >
                                    <Share2 size={11} />
                                    {lib.ownerChannelName}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        {activePlaylistId ? (
                            <>
                                <button
                                    onClick={() => navigate('/music')}
                                    className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition-colors"
                                >
                                    <ArrowLeft size={20} className="text-text-secondary" />
                                </button>
                                <div>
                                    <h1 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                                        {activePlaylistId === 'liked' ? (
                                            <><Heart size={18} className="text-red-400 fill-red-400" /> Liked Tracks</>
                                        ) : (
                                            <><ListMusic size={18} className="text-text-secondary" /> {musicPlaylists.find(p => p.id === activePlaylistId)?.name || 'Playlist'}</>
                                        )}
                                    </h1>
                                    <p className="text-xs text-text-secondary">
                                        {filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}
                                        {hasActiveFilters && ` · filtered`}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                                    <Music size={20} className="text-text-secondary" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-semibold text-text-primary">Music Library</h1>
                                    <p className="text-xs text-text-secondary">
                                        {tracks.length} track{tracks.length !== 1 ? 's' : ''}
                                        {hasActiveFilters && ` · ${filteredTracks.length} shown`}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {musicSortBy.startsWith('tag:') && (() => {
                            const catName = musicSortBy.slice(4);
                            const catTags = tags.filter(t => (t.category || 'Uncategorized') === catName);
                            const top3 = (musicSortAsc ? catTags : [...catTags].reverse()).slice(0, 3).map(t => t.name);
                            return top3.length > 0 ? (
                                <span className="text-[11px] text-text-tertiary whitespace-nowrap">
                                    {top3.join(' › ')}{catTags.length > 3 ? ' …' : ''}
                                </span>
                            ) : null;
                        })()}
                        <div className={`flex items-center rounded-full overflow-hidden transition-colors ${musicSortBy !== 'default' && musicSortBy !== 'playlistOrder' ? 'bg-hover-bg' : ''}`}>
                            <SortButton
                                sortOptions={[
                                    { label: activePlaylistId && activePlaylistId !== 'liked' ? 'Date Added' : 'Added to Library', value: 'default' },
                                    ...(activePlaylistId && activePlaylistId !== 'liked' ? [{ label: 'Playlist Order', value: 'playlistOrder' }] : []),
                                    ...(hasLikedTracks ? [{ label: 'Liked', value: 'liked' }] : []),
                                    ...sortableCategories.map(cat => ({ label: cat, value: `tag:${cat}` }))
                                ]}
                                activeSort={musicSortBy}
                                onSortChange={setMusicSortBy}
                                buttonClassName="w-[34px] h-[34px] flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 bg-transparent text-text-primary hover:text-white"
                            />
                            {musicSortBy !== 'playlistOrder' && (
                                <>
                                    <div className="w-[1px] h-[16px] bg-white/15" />
                                    <PortalTooltip content={
                                        musicSortBy === 'default'
                                            ? (musicSortAsc ? 'Oldest First' : 'Newest First')
                                            : (musicSortAsc ? 'Ascending' : 'Descending')
                                    }>
                                        <button
                                            onClick={() => setMusicSortAsc(!musicSortAsc)}
                                            className="w-[30px] h-[34px] flex items-center justify-center border-none cursor-pointer bg-transparent text-text-primary hover:text-white transition-colors"
                                        >
                                            {musicSortAsc ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                        </button>
                                    </PortalTooltip>
                                </>
                            )}
                        </div>
                        {!isReadOnly && (
                            <>
                                <PortalTooltip content={<span className="whitespace-nowrap">Manage genres & tags</span>} enterDelay={500} disabled={!!showSettings} noAnimation>
                                    <button
                                        onClick={() => setShowSettings('tags')}
                                        className="p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-hover-bg transition-colors"
                                    >
                                        <Settings size={18} />
                                    </button>
                                </PortalTooltip>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<Upload size={16} />}
                                    onClick={() => setShowUpload(true)}
                                >
                                    Upload
                                </Button>
                            </>
                        )}
                        {isReadOnly && activeLibrarySource && (
                            <span className="text-xs text-text-tertiary flex items-center gap-1.5">
                                <Share2 size={12} />
                                Shared from {activeLibrarySource.ownerChannelName} · Read-only
                            </span>
                        )}
                    </div>
                </div>

                <MusicFilterBar
                    genres={genres}
                    tags={tags}
                    categoryOrder={categoryOrder}
                    featuredCategories={featuredCategories}
                    genreFilter={genreFilter}
                    tagFilters={tagFilters}
                    bpmFilter={bpmFilter}
                    bpmRange={bpmRange}
                    hasActiveFilters={hasActiveFilters}
                    setGenreFilter={setGenreFilter}
                    toggleTagFilter={toggleTagFilter}
                    setBpmFilter={setBpmFilter}
                    clearFilters={clearFilters}
                />
            </div>

            {/* Track list */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-6 pb-6"
                onClick={() => setSelectedTrackId(null)}
            >
                <MusicErrorBoundary>
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="bg-white/[0.04] rounded-xl p-4 animate-pulse"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-12 h-12 bg-white/10 rounded-lg" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-3 bg-white/10 rounded w-2/3" />
                                            <div className="h-2 bg-white/10 rounded w-1/3" />
                                        </div>
                                    </div>
                                    <div className="mt-3 h-8 bg-white/[0.05] rounded" />
                                </div>
                            ))}
                        </div>
                    ) : filteredTracks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                            {tracks.length === 0 ? (
                                <>
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center mb-4">
                                        <Music size={28} className="text-indigo-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-text-primary mb-1">
                                        No tracks yet
                                    </h3>
                                    <p className="text-sm text-text-secondary mb-4 max-w-[300px]">
                                        Upload your first track to start building your music library
                                    </p>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        leftIcon={<Plus size={16} />}
                                        onClick={() => setShowUpload(true)}
                                    >
                                        Upload Track
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Search size={24} className="text-text-tertiary mb-3" />
                                    <h3 className="text-sm text-text-secondary">
                                        No tracks match your filters
                                    </h3>
                                    <button
                                        onClick={clearFilters}
                                        className="mt-2 text-xs text-[var(--primary-button-bg)] hover:underline"
                                    >
                                        Clear filters
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <PlaylistSortableList
                            isPlaylistDragMode={isPlaylistDragMode}
                            displayItems={displayItems}
                            filteredTracks={filteredTracks}
                            virtualizer={virtualizer}
                            selectedTrackId={selectedTrackId}
                            userId={userId}
                            channelId={channelId}
                            isReadOnly={isReadOnly}
                            activePlaylistId={activePlaylistId}
                            setSelectedTrackId={setSelectedTrackId}
                            handleDeleteTrack={handleDeleteTrack}
                            handleEditTrack={handleEditTrack}
                            reorderPlaylistTracks={reorderPlaylistTracks}
                        />
                    )}
                </MusicErrorBoundary>
            </div>

            {playingTrackId && <div className="h-[76px] flex-shrink-0" />}

            {/* Modals */}
            <UploadTrackModal
                isOpen={showUpload || !!editingTrack}
                onClose={() => { setShowUpload(false); setEditingTrack(null); }}
                userId={userId}
                channelId={channelId}
                editTrack={editingTrack}
                initialTab={editingTrack ? 'library' : 'track'}
            />
            <MusicSettingsModal
                isOpen={!!showSettings}
                onClose={() => setShowSettings(null)}
                userId={userId}
                channelId={channelId}
                initialTab={showSettings || undefined}
            />
        </div>
    );
};

// -----------------------------------------------------------------------------
// PlaylistSortableList: switches between virtualizer and DnD sortable modes
// -----------------------------------------------------------------------------
// DisplayItem type imported from useTrackDisplay

interface PlaylistSortableListProps {
    isPlaylistDragMode: boolean;
    displayItems: DisplayItem[];
    filteredTracks: Track[];
    virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
    selectedTrackId: string | null;
    userId: string;
    channelId: string;
    isReadOnly: boolean;
    activePlaylistId: string | null;
    setSelectedTrackId: (id: string | null) => void;
    handleDeleteTrack: (id: string) => void;
    handleEditTrack: (track: Track) => void;
    reorderPlaylistTracks: (userId: string, channelId: string, playlistId: string, orderedTrackIds: string[]) => Promise<void>;
}

const PlaylistSortableList: React.FC<PlaylistSortableListProps> = ({
    isPlaylistDragMode,
    displayItems,
    filteredTracks,
    virtualizer,
    selectedTrackId,
    userId,
    channelId,
    isReadOnly,
    activePlaylistId,
    setSelectedTrackId,
    handleDeleteTrack,
    handleEditTrack,
    reorderPlaylistTracks,
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
    );

    const sortableIds = useMemo(
        () => filteredTracks.map(t => t.id),
        [filteredTracks],
    );

    const [activeDragTrack, setActiveDragTrack] = useState<Track | null>(null);

    const handleSortStart = useCallback((event: DragStartEvent) => {
        const track = filteredTracks.find(t => t.id === event.active.id);
        setActiveDragTrack(track ?? null);
    }, [filteredTracks]);

    const handleSortEnd = useCallback((event: DragEndEvent) => {
        setActiveDragTrack(null);
        const { active, over } = event;
        if (!over || active.id === over.id || !activePlaylistId) return;

        const oldIdx = filteredTracks.findIndex(t => t.id === active.id);
        const newIdx = filteredTracks.findIndex(t => t.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return;

        const reordered = arrayMove(filteredTracks, oldIdx, newIdx);
        reorderPlaylistTracks(userId, channelId, activePlaylistId, reordered.map(t => t.id));
    }, [filteredTracks, activePlaylistId, userId, channelId, reorderPlaylistTracks]);

    const handleSortCancel = useCallback(() => {
        setActiveDragTrack(null);
    }, []);

    // ---- Playlist drag-reorder mode: flat list with SortableContext, no virtualizer ----
    if (isPlaylistDragMode) {
        return (
            <div className="pt-3">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleSortStart}
                    onDragEnd={handleSortEnd}
                    onDragCancel={handleSortCancel}
                >
                    <SortableContext
                        items={sortableIds}
                        strategy={verticalListSortingStrategy}
                    >
                        {filteredTracks.map(track => (
                            <SortablePlaylistTrackItem
                                key={track.id}
                                track={track}
                                selectedTrackId={selectedTrackId}
                                userId={userId}
                                channelId={channelId}
                                onSelect={setSelectedTrackId}
                                onDelete={isReadOnly ? undefined : handleDeleteTrack}
                                onEdit={isReadOnly ? undefined : handleEditTrack}
                            />
                        ))}
                    </SortableContext>
                    <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                        {activeDragTrack && <TrackCardGhost track={activeDragTrack} />}
                    </DragOverlay>
                </DndContext>
            </div>
        );
    }

    // ---- Normal mode: virtualized list (groups, siblings, singles) ----
    return (
        <div
            className="pt-3 relative w-full"
            style={{ height: virtualizer.getTotalSize() + 12 }}
        >
            {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = displayItems[virtualRow.index];
                return (
                    <div
                        key={item.type === 'group' ? item.groupId : item.track.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        className={
                            item.type === 'sibling' && item.siblingPosition !== 'middle'
                                ? 'overflow-hidden rounded-lg'
                                : undefined
                        }
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                        }}
                    >
                        {/* Sibling stripe — rendered at wrapper level for pixel-perfect continuity */}
                        {item.type === 'sibling' && (
                            <div
                                className="absolute left-0 top-0 bottom-0 w-[3px] z-10 pointer-events-none"
                                style={{ backgroundColor: item.siblingColor }}
                            />
                        )}
                        {item.type === 'group' ? (
                            <TrackGroupCard
                                tracks={item.tracks}
                                selectedTrackId={selectedTrackId}
                                userId={userId}
                                channelId={channelId}
                                onSelect={setSelectedTrackId}
                                onDelete={isReadOnly ? undefined : handleDeleteTrack}
                                onEdit={isReadOnly ? undefined : handleEditTrack}
                            />
                        ) : (
                            <TrackCard
                                track={item.track}
                                isSelected={selectedTrackId === item.track.id}
                                userId={userId}
                                channelId={channelId}
                                onSelect={setSelectedTrackId}
                                onDelete={isReadOnly ? undefined : handleDeleteTrack}
                                onEdit={isReadOnly ? undefined : handleEditTrack}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

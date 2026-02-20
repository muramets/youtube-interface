// =============================================================================
// MUSIC PAGE: Main library page with track list, filters, and player.
// Business logic, store subscriptions, and derived state live in useMusicPageData.
// =============================================================================

import React, { useCallback, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Track } from '../../core/types/track';
import { TrackListSkeleton } from './components/track/TrackCardSkeleton';
import { UploadTrackModal } from './modals/UploadTrackModal';
import { MusicSettingsModal } from './modals/MusicSettingsModal';
import { MusicFilterBar } from './components/MusicFilterBar';
import { MusicErrorBoundary } from './components/MusicErrorBoundary';
import { PlaylistSortableList } from './components/PlaylistSortableList';
import { MusicLibrarySwitcher } from './components/MusicLibrarySwitcher';
import { MusicLibraryHeader } from './components/MusicLibraryHeader';
import { TrackListEmpty } from './components/TrackListEmpty';
import { useMusicPageData } from './hooks/useMusicPageData';

const TRACK_ROW_HEIGHT = 88; // px — py-4 (32px) + h-14 cover (56px)

export const MusicPage: React.FC = () => {
    "use no memo"; // useVirtualizer returns non-memoizable functions

    // ── Data / logic from hook ───────────────────────────────────────────────
    const {
        userId, channelId,
        showSkeleton, playingTrackId,
        tracks, genres, tags, allPlaylists, sourceNameMap,
        filteredTracks, displayItems, bpmRange,
        activePlaylistId, playlistAllSources, isReadOnly, trackSource,
        sharedPlaylistIds, activeLibrarySource, sharedLibraries,
        selectedTrackId,
        genreFilters, tagFilters, bpmFilter,
        musicSortBy, musicSortAsc, sortableCategories,
        hasActiveFilters, hasLikedTracks,
        categoryOrder, featuredCategories, sharedCategoryOrder, sharedFeaturedCategories,
        setSelectedTrackId, setActiveLibrarySource, setPlaylistAllSources,
        setMusicSortBy, setMusicSortAsc,
        toggleMusicGenreFilter, toggleMusicTagFilter, setMusicBpmFilter, clearMusicFilters,
        reorderPlaylistTracks, handleDeleteTrack, isLoadTimedOut,
    } = useMusicPageData();

    // ── Local UI state ───────────────────────────────────────────────────────
    const [showUpload, setShowUpload] = useState(false);
    const [editingTrack, setEditingTrack] = useState<Track | null>(null);
    const [showSettings, setShowSettings] = useState<'genres' | 'tags' | 'share' | null>(null);

    const navigate = useNavigate();

    const handleEditTrack = useCallback((track: Track) => {
        setEditingTrack(track);
    }, []);

    // ── Virtualizer ──────────────────────────────────────────────────────────
    const scrollContainerRef = useRef<HTMLDivElement>(null);

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

    const isPlaylistDragMode = !!(
        activePlaylistId &&
        activePlaylistId !== 'liked' &&
        musicSortBy === 'playlistOrder' &&
        !isReadOnly
    );

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 px-6 pt-6 pb-4">
                <MusicLibrarySwitcher
                    sharedLibraries={sharedLibraries}
                    activePlaylistId={activePlaylistId}
                    sharedPlaylistIds={sharedPlaylistIds}
                    playlistAllSources={playlistAllSources}
                    activeLibrarySource={activeLibrarySource}
                    setPlaylistAllSources={setPlaylistAllSources}
                    setActiveLibrarySource={setActiveLibrarySource}
                />
                <MusicLibraryHeader
                    activePlaylistId={activePlaylistId}
                    allPlaylists={allPlaylists}
                    isReadOnly={isReadOnly}
                    activeLibrarySource={activeLibrarySource}
                    showSkeleton={showSkeleton}
                    tracks={tracks}
                    filteredTracks={filteredTracks}
                    hasActiveFilters={hasActiveFilters}
                    musicSortBy={musicSortBy}
                    musicSortAsc={musicSortAsc}
                    sortableCategories={sortableCategories}
                    hasLikedTracks={hasLikedTracks}
                    tags={tags}
                    navigate={navigate}
                    setMusicSortBy={setMusicSortBy}
                    setMusicSortAsc={setMusicSortAsc}
                    setShowSettings={setShowSettings}
                    setShowUpload={setShowUpload}
                    showSettings={!!showSettings}
                />
                <MusicFilterBar
                    genres={genres}
                    tags={tags}
                    categoryOrder={activeLibrarySource ? sharedCategoryOrder : categoryOrder}
                    featuredCategories={activeLibrarySource ? sharedFeaturedCategories : featuredCategories}
                    genreFilters={genreFilters}
                    tagFilters={tagFilters}
                    bpmFilter={bpmFilter}
                    bpmRange={bpmRange}
                    hasActiveFilters={hasActiveFilters}
                    toggleGenreFilter={toggleMusicGenreFilter}
                    toggleTagFilter={toggleMusicTagFilter}
                    setBpmFilter={setMusicBpmFilter}
                    clearFilters={clearMusicFilters}
                    isLoading={showSkeleton}
                />
            </div>

            {/* Track list */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-6 pb-6"
                onClick={() => setSelectedTrackId(null)}
            >
                <MusicErrorBoundary>
                    {/* ── Crossfade: skeleton ↔ content ──────────────────────────────────────
                        Both layers stay in the DOM simultaneously during the transition.
                        This eliminates the single blank frame that happens when React
                        unmounts the skeleton and mounts the content div at opacity:0.
                        Skeleton: relative when loading, absolute overlay when fading out.
                        Content:  opacity-0 + pointer-events-none while loading, then fades in.
                    ─────────────────────────────────────────────────────────────────────── */}
                    <div className="relative">
                        {/* SKELETON LAYER — replaced by error state if load times out */}
                        {isLoadTimedOut ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center mb-4">
                                    <WifiOff size={24} className="text-text-tertiary" />
                                </div>
                                <h3 className="text-base font-medium text-text-primary mb-1">Could not load tracks</h3>
                                <p className="text-sm text-text-secondary mb-4 max-w-xs">
                                    Check your connection and try again.
                                </p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white/[0.06] text-text-primary hover:bg-white/10 transition-colors"
                                >
                                    <RefreshCw size={14} />
                                    Retry
                                </button>
                            </div>
                        ) : (
                            <div
                                className={`transition-opacity duration-300 ${showSkeleton
                                    ? 'opacity-100'
                                    : 'opacity-0 absolute inset-0 pointer-events-none'
                                    }`}
                                aria-hidden={!showSkeleton}
                            >
                                <TrackListSkeleton count={8} />
                            </div>
                        )}

                        {/* CONTENT LAYER — hidden while loading OR timed out */}
                        <div
                            className={`transition-opacity duration-300 ${showSkeleton || isLoadTimedOut ? 'opacity-0 absolute inset-0 pointer-events-none' : 'opacity-100'
                                }`}
                        >
                            {!showSkeleton && filteredTracks.length === 0 ? (
                                <TrackListEmpty
                                    hasAnyTracks={tracks.length > 0}
                                    onUpload={() => setShowUpload(true)}
                                    onClearFilters={clearMusicFilters}
                                />
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
                                    trackSource={trackSource}
                                    sourceNameMap={sourceNameMap}
                                />
                            )}
                        </div>
                    </div>
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

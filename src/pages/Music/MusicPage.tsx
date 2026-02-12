// =============================================================================
// MUSIC PAGE: Main library page with track list, filters, and player
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Settings, Upload, Music, Heart, ArrowLeft, ListMusic, ArrowUp, ArrowDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useMusicStore } from '../../core/stores/musicStore';
import { TrackCard } from './components/TrackCard';
import { UploadTrackModal } from './modals/UploadTrackModal';
import { MusicSettingsModal } from './modals/MusicSettingsModal';
import { TrackService } from '../../core/services/trackService';
import type { Track } from '../../core/types/track';
import { deleteTrackFolder } from '../../core/services/storageService';
import { Button } from '../../components/ui/atoms';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { MusicFilterBar } from './components/MusicFilterBar';
import { MusicErrorBoundary } from './components/MusicErrorBoundary';
import { SortButton } from '../../features/Filter/SortButton';
import { useFilterStore } from '../../core/stores/filterStore';

export const MusicPage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const {
        tracks,
        isLoading,
        subscribe,
        loadSettings,
        selectedTrackId,
        setSelectedTrackId,
        playingTrackId,
        searchQuery,
        genreFilter,
        setGenreFilter,
        tagFilters,
        toggleTagFilter,
        bpmFilter,
        setBpmFilter,
        clearFilters,
        genres,
        tags,
        categoryOrder,
        featuredCategories,
        sortableCategories,
        musicPlaylists,
        activePlaylistId,
        setActivePlaylist,
    } = useMusicStore();

    const { musicSortBy, musicSortAsc, setMusicSortBy, setMusicSortAsc } = useFilterStore();

    const [showUpload, setShowUpload] = useState(false);
    const [editingTrack, setEditingTrack] = useState<Track | null>(null);
    const [showSettings, setShowSettings] = useState<'genres' | 'tags' | null>(null);

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

    // Filtered & sorted tracks
    const filteredTracks = useMemo(() => {
        let result = [...tracks];

        // Playlist / Liked pre-filter
        if (activePlaylistId === 'liked') {
            result = result.filter(t => t.liked);
        } else if (activePlaylistId) {
            const playlist = musicPlaylists.find(p => p.id === activePlaylistId);
            if (playlist) {
                const trackIdSet = new Set(playlist.trackIds);
                result = result.filter(t => trackIdSet.has(t.id));
                // Preserve playlist order
                result.sort((a, b) => playlist.trackIds.indexOf(a.id) - playlist.trackIds.indexOf(b.id));
            }
        }

        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    t.artist?.toLowerCase().includes(q) ||
                    t.tags.some((tag) => tag.toLowerCase().includes(q))
            );
        }

        // Genre filter
        if (genreFilter) {
            result = result.filter((t) => t.genre === genreFilter);
        }

        // Tag filters (track.tags and tagFilters are both ID-based)
        if (tagFilters.length > 0) {
            result = result.filter((t) =>
                tagFilters.every((tagId) => t.tags.includes(tagId))
            );
        }

        // BPM filter
        if (bpmFilter) {
            result = result.filter((t) => {
                if (t.bpm == null) return false;
                return t.bpm >= bpmFilter[0] && t.bpm <= bpmFilter[1];
            });
        }

        // Sort by newest first (only when not in a playlist, which preserves playlist order)
        if (!activePlaylistId || activePlaylistId === 'liked') {
            // Tag-based sorting: group by tag position within a category
            if (musicSortBy.startsWith('tag:')) {
                const categoryName = musicSortBy.slice(4);
                const categoryTags = tags.filter(t => (t.category || 'Uncategorized') === categoryName);
                result.sort((a, b) => {
                    // Find the best (lowest index) matching tag for each track
                    let idxA = Infinity;
                    let idxB = Infinity;
                    for (let i = 0; i < categoryTags.length; i++) {
                        if (a.tags.includes(categoryTags[i].id) && i < idxA) idxA = i;
                        if (b.tags.includes(categoryTags[i].id) && i < idxB) idxB = i;
                    }
                    // Apply asc/desc
                    const dir = musicSortAsc ? 1 : -1;
                    if (idxA !== idxB) return (idxA - idxB) * dir;
                    // Secondary sort: newest first
                    return b.createdAt - a.createdAt;
                });
            } else {
                result.sort((a, b) => b.createdAt - a.createdAt);
            }
        }

        return result;
    }, [tracks, searchQuery, genreFilter, tagFilters, bpmFilter, activePlaylistId, musicPlaylists, musicSortBy, musicSortAsc, tags]);

    // Compute BPM range from available tracks
    const bpmRange = useMemo(() => {
        const bpms = tracks.map(t => t.bpm).filter((b): b is number => b != null);
        if (bpms.length === 0) return { min: 60, max: 180 };
        return { min: Math.min(...bpms), max: Math.max(...bpms) };
    }, [tracks]);

    const hasActiveFilters = !!(searchQuery || genreFilter || tagFilters.length > 0 || bpmFilter);

    const handleDeleteTrack = async (trackId: string) => {
        if (!userId || !channelId) return;

        try {
            await deleteTrackFolder(userId, channelId, trackId);
            await TrackService.deleteTrack(userId, channelId, trackId);
        } catch (error) {
            console.error('[Music] Failed to delete track:', error);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 px-6 pt-6 pb-4">
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
                        {sortableCategories.length > 0 && (
                            <div className={`flex items-center rounded-full overflow-hidden transition-colors ${musicSortBy !== 'default' ? 'bg-hover-bg' : ''}`}>
                                <SortButton
                                    sortOptions={[
                                        { label: 'Default', value: 'default' },
                                        ...sortableCategories.map(cat => ({ label: cat, value: `tag:${cat}` }))
                                    ]}
                                    activeSort={musicSortBy}
                                    onSortChange={setMusicSortBy}
                                    buttonClassName="w-[34px] h-[34px] flex items-center justify-center transition-colors border-none cursor-pointer relative flex-shrink-0 bg-transparent text-text-primary hover:text-white"
                                />
                                {musicSortBy !== 'default' && (
                                    <>
                                        <div className="w-[1px] h-[16px] bg-white/15" />
                                        <PortalTooltip content={musicSortAsc ? 'Ascending' : 'Descending'}>
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
                        )}
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

            {/* Track grid */}
            <div className="flex-1 overflow-y-auto px-6 pb-6" onClick={() => setSelectedTrackId(null)}>
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
                        <div className="flex flex-col gap-0.5 pt-3">
                            {filteredTracks.map((track) => (
                                <TrackCard
                                    key={track.id}
                                    track={track}
                                    isSelected={selectedTrackId === track.id}
                                    userId={userId}
                                    channelId={channelId}
                                    onSelect={setSelectedTrackId}
                                    onDelete={(id) => handleDeleteTrack(id)}
                                    onEdit={(t) => setEditingTrack(t)}
                                />
                            ))}
                        </div>
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

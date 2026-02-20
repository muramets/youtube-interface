// =============================================================================
// MusicLibraryHeader — title row + sort controls + action buttons.
// Renders two variants: playlist view (with back button) and library root.
// =============================================================================

import React from 'react';
import { ArrowLeft, Heart, ListMusic, Music, ArrowUp, ArrowDown, Settings, Upload, Share2 } from 'lucide-react';
import { Button } from '../../../components/ui/atoms';
import { PortalTooltip } from '../../../components/ui/atoms/PortalTooltip';
import { SortButton } from '../../../features/Filter/SortButton';
import type { Track } from '../../../core/types/track';
import type { MusicTag } from '../../../core/types/track';
import type { MusicPlaylist } from '../../../core/types/musicPlaylist';
import type { SharedLibraryEntry } from '../../../core/types/musicSharing';

interface MusicLibraryHeaderProps {
    // Context
    activePlaylistId: string | null;
    allPlaylists: MusicPlaylist[];
    isReadOnly: boolean;
    activeLibrarySource: SharedLibraryEntry | null;
    // Skeleton / counts
    showSkeleton: boolean;
    tracks: Pick<Track, 'id' | 'duration'>[];
    filteredTracks: Pick<Track, 'id' | 'duration'>[];
    hasActiveFilters: boolean;
    // Sort
    musicSortBy: string;
    musicSortAsc: boolean;
    sortableCategories: string[];
    hasLikedTracks: boolean;
    tags: MusicTag[];
    // Callbacks
    navigate: (path: string) => void;
    setMusicSortBy: (v: string) => void;
    setMusicSortAsc: (v: boolean) => void;
    setShowSettings: (v: 'genres' | 'tags' | 'share' | null) => void;
    setShowUpload: (v: boolean) => void;
    showSettings: boolean;
}

/** Small hint showing the first 3 tag values in the currently active tag-sort category. */
const SortCategoryHint: React.FC<{ musicSortBy: string; musicSortAsc: boolean; tags: MusicTag[] }> = ({
    musicSortBy,
    musicSortAsc,
    tags,
}) => {
    if (!musicSortBy.startsWith('tag:')) return null;
    const catName = musicSortBy.slice(4);
    const catTags = tags.filter(t => (t.category || 'Uncategorized') === catName);
    const top3 = (musicSortAsc ? catTags : [...catTags].reverse()).slice(0, 3).map(t => t.name);
    if (top3.length === 0) return null;
    return (
        <span className="text-[11px] text-text-tertiary whitespace-nowrap">
            {top3.join(' › ')}{catTags.length > 3 ? ' …' : ''}
        </span>
    );
};

/** Formats total seconds into human-readable duration: "1h 23m" or "45m 12s" */
const formatDuration = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};


const CountSkeleton: React.FC = () => (
    <span className="inline-block h-3 w-20 bg-bg-secondary rounded relative overflow-hidden">
        <span
            className="shimmer-overlay"
            style={{ backgroundSize: '200% 100%' }}
        />
    </span>
);

export const MusicLibraryHeader: React.FC<MusicLibraryHeaderProps> = ({
    activePlaylistId,
    allPlaylists,
    isReadOnly,
    activeLibrarySource,
    showSkeleton,
    tracks,
    filteredTracks,
    hasActiveFilters,
    musicSortBy,
    musicSortAsc,
    sortableCategories,
    hasLikedTracks,
    tags,
    navigate,
    setMusicSortBy,
    setMusicSortAsc,
    setShowSettings,
    setShowUpload,
    showSettings,
}) => (
    <div className="flex items-center justify-between mb-5">
        {/* Left: title / back button + track count */}
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
                                <><ListMusic size={18} className="text-text-secondary" /> {allPlaylists.find(p => p.id === activePlaylistId)?.name || 'Playlist'}</>
                            )}
                        </h1>
                        <p className="text-xs text-text-secondary">
                            <span className="relative inline-block min-w-[80px]">
                                <span className={`transition-opacity duration-300 whitespace-nowrap ${showSkeleton ? 'opacity-0' : 'opacity-100'}`}>
                                    {filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}
                                    {hasActiveFilters && ' · filtered'}
                                    {filteredTracks.length > 0 && ` · ${formatDuration(filteredTracks.reduce((sum, t) => sum + (t.duration ?? 0), 0))}`}
                                </span>
                                <span className={`transition-opacity duration-300 absolute inset-0 flex items-center ${showSkeleton ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <CountSkeleton />
                                </span>
                            </span>
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
                            <span className="relative inline-block min-w-[80px]">
                                <span className={`transition-opacity duration-300 whitespace-nowrap ${showSkeleton ? 'opacity-0' : 'opacity-100'}`}>
                                    {tracks.length} track{tracks.length !== 1 ? 's' : ''}{hasActiveFilters && ` · ${filteredTracks.length} shown`}
                                    {tracks.length > 0 && ` · ${formatDuration(tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0))}`}
                                </span>
                                <span className={`transition-opacity duration-300 absolute inset-0 flex items-center ${showSkeleton ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                    <CountSkeleton />
                                </span>
                            </span>
                        </p>
                    </div>
                </>
            )}
        </div>

        {/* Right: sort + actions */}
        <div className="flex items-center gap-2">
            <SortCategoryHint musicSortBy={musicSortBy} musicSortAsc={musicSortAsc} tags={tags} />
            <div className={`flex items-center rounded-full overflow-hidden transition-colors ${musicSortBy !== 'default' && musicSortBy !== 'playlistOrder' ? 'bg-hover-bg' : ''}`}>
                <SortButton
                    sortOptions={[
                        { label: activePlaylistId && activePlaylistId !== 'liked' ? 'Date Added' : 'Added to Library', value: 'default' },
                        ...(activePlaylistId && activePlaylistId !== 'liked' ? [{ label: 'Playlist Order', value: 'playlistOrder' }] : []),
                        ...(hasLikedTracks ? [{ label: 'Liked', value: 'liked' }] : []),
                        ...sortableCategories.map(cat => ({ label: cat, value: `tag:${cat}` })),
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
                    <PortalTooltip
                        content={<span className="whitespace-nowrap">Manage genres &amp; tags</span>}
                        enterDelay={500}
                        disabled={showSettings}
                        noAnimation
                    >
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
);

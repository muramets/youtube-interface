import React, { useMemo, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVideos } from '../../core/hooks/useVideos';

import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { ArrowLeft, PlaySquare, Trophy, Trash2, Check, Eye, EyeOff } from 'lucide-react';
import { VideoGrid } from '../../features/Video/VideoGrid';
import { ZoomControls } from '../../features/Video/ZoomControls';
import { PlaylistExportControls } from '../../features/Playlists/components/PlaylistExportControls';
import { useFilterStore } from '../../core/stores/filterStore';
import { SortButton } from '../../features/Filter/SortButton';
import { usePlaylistDeltaStats, type PlaylistDeltaStats } from '../../features/Playlists/hooks/usePlaylistDeltaStats';
import type { Playlist } from '../../core/services/playlistService';
import { usePickTheWinner } from '../../features/Playlists/hooks/usePickTheWinner';
import { usePlaylistRankings } from '../../features/Playlists/hooks/usePlaylistRankings';
import { PickTheWinnerBar } from '../../features/Playlists/components/PickTheWinnerBar';
import type { VideoCardAnonymizeData } from '../../features/Video/VideoCard';
import { useSettings } from '../../core/hooks/useSettings';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';

// Format number with K/M suffix
const formatDelta = (value: number | null): string | null => {
    if (value === null) return null;
    if (value >= 1_000_000) return `+${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `+${(value / 1_000).toFixed(1)}K`;
    return `+${value}`;
};

// Subtitle component with delta stats
const PlaylistSubtitle: React.FC<{
    videoCount: number;
    playlist: Playlist;
    deltaStats: PlaylistDeltaStats;
}> = ({ videoCount, playlist, deltaStats }) => {
    const { totals, isLoading } = deltaStats;
    const { delta24h, delta7d, delta30d } = totals;

    return (
        <span className="text-text-secondary text-sm">
            {videoCount} videos
            {!isLoading && delta24h !== null && (
                <> • <span className="text-green-400">{formatDelta(delta24h)}</span> views (24h)</>
            )}
            {!isLoading && delta7d !== null && (
                <> • <span className="text-green-400">{formatDelta(delta7d)}</span> views (7d)</>
            )}
            {!isLoading && delta30d !== null && (
                <> • <span className="text-green-400">{formatDelta(delta30d)}</span> views (30d)</>
            )}
            {playlist.updatedAt && playlist.updatedAt > playlist.createdAt && (
                <> • Updated {new Date(playlist.updatedAt).toLocaleDateString()}</>
            )}
            {' • '}Created {new Date(playlist.createdAt).toLocaleDateString()}
        </span>
    );
};

export const PlaylistDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, reorderPlaylistVideos, updatePlaylist, isLoading: isPlaylistsLoading } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos, isLoading: isVideosLoading, removeVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { playlistVideoSortBy, setPlaylistVideoSortBy } = useFilterStore();
    const navigate = useNavigate();
    const { pickerSettings } = useSettings();

    const playlist = playlists.find(p => p.id === id);

    // Pick the Winner
    const picker = usePickTheWinner(playlist?.videoIds?.length ?? 0);
    const { rankings, saveRanking, deleteRanking } = usePlaylistRankings(
        user?.uid || '',
        currentChannel?.id || '',
        id || ''
    );

    // Hide/Delete Losers state
    const [hideLosers, setHideLosers] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const isViewingRanking = playlistVideoSortBy.startsWith('ranking-');

    // Anonymization data for Pick the Winner
    const anonymizeData: VideoCardAnonymizeData | undefined = useMemo(() => {
        if (!picker.isActive || !currentChannel) return undefined;
        return {
            channelTitle: currentChannel.name || 'My Channel',
            channelAvatar: currentChannel.avatar || '',
            viewCountLabel: '✦✦✦ views',
        };
    }, [picker.isActive, currentChannel]);

    // Ranking overlay getter
    const getRankingOverlay = useCallback((videoId: string): number | null => {
        if (!picker.isActive) return null;
        return picker.getRank(videoId);
    }, [picker]);

    // Sort change handler with pick-winner support
    const handleSortChange = useCallback((val: string) => {
        if (val === 'pick-winner') {
            picker.activate();
            return;
        }
        if (picker.isActive) {
            picker.deactivate();
        }
        setPlaylistVideoSortBy(val as 'views' | 'date' | 'delta24h' | 'delta7d' | 'delta30d' | 'default');
    }, [picker, setPlaylistVideoSortBy]);

    // Save ranking handler
    const handleSaveRanking = useCallback((name: string) => {
        saveRanking(name, picker.rankedVideoIds);
        picker.deactivate();
    }, [saveRanking, picker]);

    // Custom section for SortButton
    const sortCustomSection = useMemo(() => (
        <>
            <div className="border-t border-[#333333] mt-1 pt-1">
                <button
                    onClick={() => handleSortChange('pick-winner')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border-none cursor-pointer ${picker.isActive ? 'bg-amber-500/20 text-amber-300' : 'text-[#AAAAAA] hover:bg-[#161616] hover:text-white bg-transparent'}`}
                >
                    <Trophy size={14} />
                    Pick the Winner
                </button>
            </div>
            {rankings.length > 0 && (
                <div className="border-t border-[#333333] mt-1 pt-1">
                    <div className="px-3 py-1.5 text-xs font-bold text-[#666666] uppercase tracking-wider">
                        Saved Rankings
                    </div>
                    {rankings.map(ranking => (
                        <button
                            key={ranking.id}
                            onClick={() => handleSortChange(ranking.id)}
                            className={`group/ranking w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border-none cursor-pointer ${playlistVideoSortBy === ranking.id
                                ? 'bg-[#333333] text-white'
                                : 'text-[#AAAAAA] hover:bg-[#161616] hover:text-white bg-transparent'
                                }`}
                        >
                            <Trophy size={14} className="text-amber-400 flex-shrink-0" />
                            <span className="truncate flex-1">{ranking.name}</span>
                            <span className="relative flex-shrink-0 w-[22px] h-[22px] flex items-center justify-center">
                                {playlistVideoSortBy === ranking.id && (
                                    <Check size={14} className="transition-opacity group-hover/ranking:opacity-0" />
                                )}
                                <span
                                    role="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (playlistVideoSortBy === ranking.id) {
                                            setPlaylistVideoSortBy('default');
                                        }
                                        deleteRanking(ranking.id);
                                    }}
                                    className="absolute inset-0 flex items-center justify-center rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover/ranking:opacity-100"
                                >
                                    <Trash2 size={14} />
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </>
    ), [picker.isActive, rankings, playlistVideoSortBy, handleSortChange, deleteRanking, setPlaylistVideoSortBy]);

    // Local state for optimistic video order (prevents jitter on Firestore sync)
    const [localVideoOrder, setLocalVideoOrder] = React.useState<string[]>([]);

    // Sync localVideoOrder with playlist.videoIds (only if actually different)
    React.useEffect(() => {
        if (playlist?.videoIds) {
            setLocalVideoOrder(prev => {
                if (JSON.stringify(prev) !== JSON.stringify(playlist.videoIds)) {
                    return playlist.videoIds;
                }
                return prev;
            });
        }
    }, [playlist?.videoIds]);

    // Filter videos that are in the playlist
    // Use localVideoOrder for rendering to get immediate optimistic updates
    const basePlaylistVideos = useMemo(() => {
        if (localVideoOrder.length === 0) return [];
        return localVideoOrder
            .map(videoId => videos.find(v => v.id === videoId))
            .filter((v): v is NonNullable<typeof v> => v !== undefined);
    }, [localVideoOrder, videos]);

    // Delta statistics from trend data
    // We pass the BASE videos to ensure stats are fetched for all videos, regardless of sort
    const deltaStats = usePlaylistDeltaStats(basePlaylistVideos);

    // Apply sorting to the base videos
    const sortedPlaylistVideos = useMemo(() => {
        if (playlistVideoSortBy === 'views') {
            return [...basePlaylistVideos].sort((a, b) => {
                const viewsA = parseInt((a.mergedVideoData?.viewCount || a.viewCount)?.replace(/[^0-9]/g, '') || '0', 10);
                const viewsB = parseInt((b.mergedVideoData?.viewCount || b.viewCount)?.replace(/[^0-9]/g, '') || '0', 10);
                return viewsB - viewsA;
            });
        }

        if (playlistVideoSortBy === 'date') {
            return [...basePlaylistVideos].sort((a, b) => {
                const dateA = new Date(a.mergedVideoData?.publishedAt || a.publishedAt || 0).getTime();
                const dateB = new Date(b.mergedVideoData?.publishedAt || b.publishedAt || 0).getTime();
                return dateB - dateA;
            });
        }

        const getDelta = (vId: string, period: 'delta24h' | 'delta7d' | 'delta30d') => {
            const stats = deltaStats.perVideo.get(vId);
            return stats?.[period] ?? -Infinity; // Push nulls/undefined to bottom
        };

        if (playlistVideoSortBy === 'delta24h') {
            return [...basePlaylistVideos].sort((a, b) => getDelta(b.id, 'delta24h') - getDelta(a.id, 'delta24h'));
        }

        if (playlistVideoSortBy === 'delta7d') {
            return [...basePlaylistVideos].sort((a, b) => getDelta(b.id, 'delta7d') - getDelta(a.id, 'delta7d'));
        }

        if (playlistVideoSortBy === 'delta30d') {
            return [...basePlaylistVideos].sort((a, b) => getDelta(b.id, 'delta30d') - getDelta(a.id, 'delta30d'));
        }

        // 'default' = manual order
        return basePlaylistVideos;
    }, [basePlaylistVideos, playlistVideoSortBy, deltaStats]);

    // Apply saved ranking sort
    const rankedPlaylistVideos = useMemo(() => {
        if (!playlistVideoSortBy.startsWith('ranking-')) return sortedPlaylistVideos;
        const ranking = rankings.find(r => r.id === playlistVideoSortBy);
        if (!ranking) return sortedPlaylistVideos;

        // Apply ranking order, gracefully skipping deleted videos
        const videoMap = new Map(basePlaylistVideos.map(v => [v.id, v]));
        const ordered = ranking.videoOrder
            .map(vid => videoMap.get(vid))
            .filter((v): v is NonNullable<typeof v> => v !== undefined);

        // Add any videos not in the ranking (new additions) at the end
        const rankedSet = new Set(ranking.videoOrder);
        const unranked = basePlaylistVideos.filter(v => !rankedSet.has(v.id));

        return [...ordered, ...unranked];
    }, [sortedPlaylistVideos, playlistVideoSortBy, rankings, basePlaylistVideos]);

    // Apply hide losers filter
    const filteredPlaylistVideos = useMemo(() => {
        if (!hideLosers || !isViewingRanking) return rankedPlaylistVideos;
        return rankedPlaylistVideos.slice(0, pickerSettings.winnerCount);
    }, [rankedPlaylistVideos, hideLosers, isViewingRanking, pickerSettings.winnerCount]);

    // Alias for compatibility with rest of component
    const playlistVideos = filteredPlaylistVideos;

    // Lazy cleanup: auto-remove orphaned video IDs on playlist open
    const cleanupDoneRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!playlist || !user || !currentChannel) return;
        // Only run cleanup once per playlist (prevent re-running after our own update)
        if (cleanupDoneRef.current === playlist.id) return;

        const validVideoIds = playlist.videoIds.filter(vid => videos.some(v => v.id === vid));
        const orphanedCount = playlist.videoIds.length - validVideoIds.length;

        if (orphanedCount > 0) {
            cleanupDoneRef.current = playlist.id;
            // Silent fire-and-forget cleanup
            updatePlaylist({ playlistId: playlist.id, updates: { videoIds: validVideoIds } });
        }
    }, [playlist, videos, user, currentChannel, updatePlaylist]);

    const [selectedVideoIds, setSelectedVideoIds] = React.useState<Set<string>>(new Set());

    const handleToggleSelection = (id: string) => {
        // In Pick the Winner mode, intercept clicks
        if (picker.isActive) {
            picker.handleVideoClick(id);
            return;
        }
        setSelectedVideoIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleClearSelection = React.useCallback(() => {
        setSelectedVideoIds(new Set());
    }, []);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedVideoIds.size > 0) {
                handleClearSelection();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedVideoIds.size, handleClearSelection]);

    // Filter playlistVideos based on selection for export
    const selectedVideos = React.useMemo(() => {
        if (selectedVideoIds.size === 0) return [];
        return playlistVideos.filter(v => selectedVideoIds.has(v.id));
    }, [playlistVideos, selectedVideoIds]);

    const videosToExport = selectedVideoIds.size > 0 ? selectedVideos : playlistVideos;

    // Compute effective cover image (same logic as PlaylistCard)
    const effectiveCoverImage = useMemo(() => {
        if (!playlist) return '';

        // If playlist has an explicit cover that isn't a youtube thumbnail, keep it
        if (playlist.coverImage && !playlist.coverImage.includes('ytimg.com')) {
            return playlist.coverImage;
        }

        if (basePlaylistVideos.length === 0) return playlist.coverImage || '';

        // Use basePlaylistVideos instead of playlistVideos to ignore sorting
        const lastVideo = basePlaylistVideos[basePlaylistVideos.length - 1];

        if (lastVideo && playlist.coverImage !== lastVideo.thumbnail && playlist.coverImage !== lastVideo.customImage) {
            // Check if current cover belongs to any video in playlist
            const coverBelongsToPlaylist = basePlaylistVideos.some(v =>
                v.thumbnail === playlist.coverImage || v.customImage === playlist.coverImage
            );
            if (!coverBelongsToPlaylist) {
                return lastVideo.customImage || lastVideo.thumbnail;
            }
        }

        return playlist.coverImage || lastVideo?.customImage || lastVideo?.thumbnail || '';
    }, [playlist, basePlaylistVideos]);

    if (isPlaylistsLoading) {
        return (
            <div className="animate-fade-in flex flex-col h-full relative">
                <div className="pt-6 px-6 flex items-center gap-4 mb-0">
                    <div className="w-20 h-[45px] bg-bg-secondary rounded-lg animate-pulse" />
                    <div className="flex flex-col gap-2">
                        <div className="h-6 w-48 bg-bg-secondary rounded animate-pulse" />
                        <div className="h-4 w-32 bg-bg-secondary rounded animate-pulse" />
                    </div>
                </div>
                <VideoGrid isLoading={true} />
            </div>
        );
    }

    if (!playlist) {
        return (
            <div style={{ padding: '24px', textAlign: 'center' }}>
                <h2>Playlist not found</h2>
                <button onClick={() => navigate('/playlists')}>Back to Playlists</button>
            </div>
        );
    }



    const handlePlaylistReorder = (movedVideoId: string, targetVideoId: string) => {
        // Find these IDs in the current VISIBLE list (which might be sorted)
        const currentVisibleOrder = playlistVideos.map(v => v.id);
        const oldIndex = currentVisibleOrder.indexOf(movedVideoId);
        const newIndex = currentVisibleOrder.indexOf(targetVideoId);

        if (oldIndex === -1 || newIndex === -1 || !user || !currentChannel || !playlist) return;

        // If we are in a Sorted View (not 'default'), we need to capturing current order -> switch to default
        if (playlistVideoSortBy !== 'default') {
            // calculated new order based on VISIBLE list
            const newOrder = [...currentVisibleOrder];
            const [movedItem] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, movedItem);

            // 1. Optimistically update local order FIRST
            setLocalVideoOrder(newOrder);

            // 2. Switch UI to Manual Sort
            setPlaylistVideoSortBy('default');

            // 3. Persist this new "Manual" order
            reorderPlaylistVideos({ playlistId: playlist.id, newVideoIds: newOrder });
            return;
        }

        // Manual Mode: Standard Reorder
        // Calculate new order based on localVideoOrder (what we're currently showing)
        const localOldIndex = localVideoOrder.indexOf(movedVideoId);
        const localNewIndex = localVideoOrder.indexOf(targetVideoId);

        if (localOldIndex !== -1 && localNewIndex !== -1) {
            const newOrder = [...localVideoOrder];
            const [movedItem] = newOrder.splice(localOldIndex, 1);
            newOrder.splice(localNewIndex, 0, movedItem);

            // 1. Optimistically update local order FIRST (prevents jitter)
            setLocalVideoOrder(newOrder);

            // 2. Persist to Firestore
            reorderPlaylistVideos({ playlistId: playlist.id, newVideoIds: newOrder });
        }
    };

    return (
        <>
            <div className="animate-fade-in flex flex-col h-full relative pl-2">
                {/* Pick the Winner Bar */}
                {picker.isActive && (
                    <PickTheWinnerBar
                        ranked={picker.progress.ranked}
                        total={picker.progress.total}
                        isComplete={picker.isComplete}
                        onSave={handleSaveRanking}
                        onDiscard={picker.deactivate}
                    />
                )}

                {/* Header */}
                <div className={`pt-6 px-6 flex items-center gap-4 mb-3 ${picker.isActive ? 'pt-3' : ''}`}>
                    <button
                        onClick={() => navigate('/playlists')}
                        className="bg-transparent border-none text-text-primary cursor-pointer flex items-center hover:text-text-secondary transition-colors"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div className="flex items-center gap-4 flex-1">
                        <div className="w-20 h-[45px] bg-bg-secondary rounded-lg flex items-center justify-center overflow-hidden">
                            {effectiveCoverImage ? (
                                <img src={effectiveCoverImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <PlaySquare size={24} className="text-text-secondary" />
                            )}
                        </div>
                        <div>
                            <h1 className="m-0 text-2xl font-bold text-text-primary">{playlist.name}</h1>
                            <PlaylistSubtitle
                                videoCount={playlistVideos.length}
                                playlist={playlist}
                                deltaStats={deltaStats}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {selectedVideoIds.size > 0 && (
                            <button
                                onClick={handleClearSelection}
                                className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors border-none cursor-pointer flex items-center gap-2"
                            >
                                <span>{selectedVideoIds.size} selected</span>
                                <span className="text-white/60">×</span>
                            </button>
                        )}

                        {isViewingRanking && (
                            <>
                                <PortalTooltip content={hideLosers ? 'Show all videos' : `Hide all except top ${pickerSettings.winnerCount}`}>
                                    <button
                                        onClick={() => setHideLosers(prev => !prev)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border-none cursor-pointer flex items-center gap-1.5 ${hideLosers
                                            ? 'bg-amber-500/20 text-amber-300'
                                            : 'bg-white/10 hover:bg-white/20 text-white'
                                            }`}
                                    >
                                        {hideLosers ? <EyeOff size={14} /> : <Eye size={14} />}
                                        {hideLosers ? 'Show All' : 'Hide Losers'}
                                    </button>
                                </PortalTooltip>
                                <PortalTooltip content={`Delete custom drafts ranked below top ${pickerSettings.winnerCount}. YouTube videos will be hidden, not deleted.`}>
                                    <button
                                        onClick={() => setDeleteConfirmOpen(true)}
                                        className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors border-none cursor-pointer flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400"
                                    >
                                        <Trash2 size={14} />
                                        Clean Up Losers
                                    </button>
                                </PortalTooltip>
                            </>
                        )}

                        <SortButton
                            sortOptions={[
                                { label: 'Manual Order', value: 'default' },
                                { label: 'Most Viewed', value: 'views' },
                                ...(deltaStats.totals.delta24h !== null ? [{ label: 'Views (24h)', value: 'delta24h' }] : []),
                                ...(deltaStats.totals.delta7d !== null ? [{ label: 'Views (7d)', value: 'delta7d' }] : []),
                                ...(deltaStats.totals.delta30d !== null ? [{ label: 'Views (30d)', value: 'delta30d' }] : []),
                                { label: 'Newest First', value: 'date' },
                            ]}
                            activeSort={playlistVideoSortBy}
                            onSortChange={handleSortChange}
                            customSection={sortCustomSection}
                        />
                        <PlaylistExportControls
                            videos={videosToExport}
                            playlistName={playlist.name}
                        />
                    </div>
                </div>

                {/* Reusable Video Grid */}
                <VideoGrid
                    videos={playlistVideos}
                    onVideoMove={handlePlaylistReorder}
                    disableChannelFilter={true}
                    playlistId={playlist.id}
                    isLoading={isVideosLoading}
                    onSetAsCover={(videoId) => {
                        const video = playlistVideos.find(v => v.id === videoId);
                        if (video && user && currentChannel) {
                            updatePlaylist({
                                playlistId: playlist.id,
                                updates: {
                                    coverImage: video.customImage || video.thumbnail
                                }
                            });
                        }
                    }}
                    selectedIds={selectedVideoIds}
                    onToggleSelection={handleToggleSelection}
                    videoDeltaStats={deltaStats.perVideo}
                    getRankingOverlay={getRankingOverlay}
                    anonymizeData={anonymizeData}
                    isSelectionMode={picker.isActive || selectedVideoIds.size > 0}
                />

                {/* Floating Zoom Controls */}
                <ZoomControls />

                {playlistVideos.length === 0 && (
                    <div className="text-center text-text-secondary mt-12">
                        <p>No videos in this playlist yet.</p>
                        <button
                            onClick={() => navigate('/')}
                            className="mt-3 px-4 py-2 rounded-full border-none bg-bg-secondary text-text-primary cursor-pointer hover:bg-hover-bg transition-colors"
                        >
                            Go to Home to add videos
                        </button>
                    </div>
                )}
            </div>

            {/* Clean Up Losers Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={async () => {
                    const ranking = rankings.find(r => r.id === playlistVideoSortBy);
                    if (!ranking) return;
                    const winnerIds = new Set(ranking.videoOrder.slice(0, pickerSettings.winnerCount));
                    const loserIds = ranking.videoOrder.filter(vid => !winnerIds.has(vid));

                    // Only delete pure custom videos (no YouTube link)
                    const videosMap = new Map(videos.map(v => [v.id, v]));
                    const toDelete = loserIds.filter(vid => {
                        const v = videosMap.get(vid);
                        return v?.isCustom && !v.publishedVideoId;
                    });

                    // Optimistic: hide & close immediately
                    setHideLosers(true);
                    setDeleteConfirmOpen(false);

                    // Fire-and-forget deletions in background
                    if (toDelete.length > 0) {
                        Promise.all(toDelete.map(vid => removeVideo(vid)));
                    }
                }}
                title="Clean Up Losers"
                message={<>
                    <p>Videos ranked below top {pickerSettings.winnerCount}:</p>
                    <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                        <li><strong>Custom drafts</strong> (without YouTube URL) will be <strong>permanently deleted</strong></li>
                        <li><strong>YouTube videos</strong> and custom videos with a published URL will be <strong>hidden</strong></li>
                    </ul>
                    <p>Deletion cannot be undone.</p>
                </>}
                confirmLabel="Clean Up"
            />
        </>
    );
};

// =============================================================================
// MUSIC SIDEBAR SECTION
// =============================================================================
// Expandable sidebar section for Music, analogous to TrendsSidebarSection.
// Shows: Music header → ♥ Liked → Playlist Groups → Ungrouped Playlists → + New
// Shared libraries: shows owner's playlists under "SHARED WITH ME"
// =============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDndContext } from '@dnd-kit/core';
import { Music, Plus, ChevronDown, ChevronRight, Heart, Share2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { MusicPlaylistItem } from './MusicPlaylistItem';
import { MusicPlaylistSkeleton } from './MusicPlaylistSkeleton';
import { SidebarDivider } from '../../../components/Layout/Sidebar';
import { CreateMusicPlaylistModal } from '../modals/CreateMusicPlaylistModal';
import { MusicPlaylistService } from '../../../core/services/musicPlaylistService';
import type { MusicPlaylist } from '../../../core/types/musicPlaylist';

// ---------------------------------------------------------------------------
// LikedPlaylistRow — a regular sidebar item. Dropping on Liked is forbidden, so
// no useDroppable here to avoid false `over` detections and sidebar jitter.
// pointer-events disabled during drag to prevent cursor-pointer/drag cursor flicker.
// ---------------------------------------------------------------------------
const LikedPlaylistRow: React.FC<{ isActive: boolean; likedCount: number; onClick: () => void }> = ({ isActive, likedCount, onClick }) => {
    return (
        <li
            onClick={onClick}
            className={`flex items-center cursor-pointer p-2 rounded-lg transition-all duration-200 select-none animate-fade-in-down ${isActive ? 'bg-black/10 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
            style={{ animationDelay: '0ms', animationFillMode: 'both' }}
        >
            <div className={`w-6 h-6 rounded-full mr-3 flex items-center justify-center ${isActive ? 'bg-red-500/20 ring-2 ring-red-400/30' : 'bg-black/5 dark:bg-white/5'}`}>
                <Heart size={14} className={isActive ? 'text-red-400 fill-red-400' : 'text-red-400/60 fill-red-400/60'} />
            </div>
            <span className={`text-sm flex-1 overflow-hidden whitespace-nowrap transition-colors ${isActive ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                Liked
            </span>
            <div className="ml-2 flex items-center justify-center shrink-0 w-4">
                <span className="text-[10px] text-text-tertiary leading-none">{likedCount}</span>
            </div>
        </li>
    );
};

export const MusicSidebarSection: React.FC<{ expanded: boolean }> = ({ expanded }) => {
    const { active: dndActive } = useDndContext();
    const isDragging = !!dndActive;
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const {
        tracks,
        sharedTracks,
        musicPlaylists,
        playlistGroupOrder,
        subscribePlaylists,
        loadPlaylistSettings,
        subscribeSharedLibraries,
    } = useMusicStore();

    const setActivePlaylist = useMusicStore(s => s.setActivePlaylist);
    const activePlaylistId = useMusicStore(s => s.activePlaylistId);
    const activeLibrarySource = useMusicStore(s => s.activeLibrarySource);
    const playlistAllSources = useMusicStore(s => s.playlistAllSources);
    const sharedLibraries = useMusicStore(s => s.sharedLibraries);
    const setActiveLibrarySource = useMusicStore(s => s.setActiveLibrarySource);
    const setPlaylistAllSources = useMusicStore(s => s.setPlaylistAllSources);
    /** True while own playlists' first Firestore snapshot hasn't arrived yet */
    const isPlaylistsLoading = useMusicStore(s => s.isPlaylistsLoading);

    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    // Subscribe to own playlists (loading state managed in store: isPlaylistsLoading)
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsub = subscribePlaylists(userId, channelId);
        loadPlaylistSettings(userId, channelId);
        return unsub;
    }, [userId, channelId, subscribePlaylists, loadPlaylistSettings]);

    // Load shared libraries for the current channel
    useEffect(() => {
        if (!userId || !channelId) return;
        return subscribeSharedLibraries(userId, channelId);
    }, [userId, channelId, subscribeSharedLibraries]);

    // Per-channel playlist map for the "Shared With Me" section.
    // pendingSharedChannels tracks channels whose first snapshot hasn't arrived yet
    // — so the skeleton shows in the interim, even with Firestore local cache.
    const [playlistsByChannel, setPlaylistsByChannel] = useState<Record<string, MusicPlaylist[]>>({});
    const [pendingSharedChannels, setPendingSharedChannels] = useState<Set<string>>(new Set());

    // On channel switch: reset both maps so the sidebar shows a clean loading state.
    // Intentional setState-in-effect: this effect exists solely to reset derived UI state
    // to a clean slate before the new channel's Firestore subscriptions deliver.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlaylistsByChannel({});
        setPendingSharedChannels(new Set());
    }, [channelId]);

    // Subscribe to playlists for each shared library.
    // Mark every channel as pending BEFORE subscribing; clear when first snapshot arrives.
    useEffect(() => {
        if (!sharedLibraries.length) return;

        // Mark all channels as pending (skeleton visible) before any subscription fires.
        // Intentional setState-in-effect: we must set the pending set synchronously before
        // the subscriptions open, so the skeleton appears immediately — not after the first
        // snapshot arrives. Callbacks below handle all subsequent setState calls.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingSharedChannels(new Set(sharedLibraries.map(l => l.ownerChannelId)));

        const unsubs = sharedLibraries.map(lib => {
            return MusicPlaylistService.subscribeToPlaylists(
                lib.ownerUserId,
                lib.ownerChannelId,
                (playlists) => {
                    setPlaylistsByChannel(prev => ({ ...prev, [lib.ownerChannelId]: playlists }));
                    setPendingSharedChannels(prev => {
                        const next = new Set(prev);
                        next.delete(lib.ownerChannelId);
                        return next;
                    });
                },
            );
        });

        return () => {
            unsubs.forEach(unsub => unsub());
            // Keep stale playlist data — prevents blank flash when channel switch triggers
            // a brief empty state before new subscriptions deliver.
        };
    }, [sharedLibraries]);

    // Persist collapse state
    const [isContentExpanded, setIsContentExpanded] = useState(() => {
        const saved = localStorage.getItem('music-section-expanded');
        return saved !== null ? saved === 'true' : true;
    });
    useEffect(() => {
        localStorage.setItem('music-section-expanded', String(isContentExpanded));
    }, [isContentExpanded]);

    // Track if we're on Music page
    const isOnMusicPage = location.pathname.startsWith('/music');

    // Liked count
    const likedCount = useMemo(() =>
        tracks.filter(t => t.liked).length,
        [tracks]);

    /**
     * Returns the number of tracks in a playlist that are visible given the
     * current library context:
     *  - If "All" sources is selected, counts only tracks that physically exist in the global track state (own or shared)
     *  - Own tracks (no trackSource entry) → always counted
     *  - Shared tracks → counted only when viewing their origin channel
     */
    const getEffectiveCount = useCallback((playlist: MusicPlaylist): number => {
        const activeChannelId = activeLibrarySource?.ownerChannelId;

        if (playlistAllSources) {
            return playlist.trackIds.filter(trackId =>
                tracks.some(t => t.id === trackId) || sharedTracks.some(t => t.id === trackId)
            ).length;
        }

        return playlist.trackIds.filter(trackId => {
            const source = playlist.trackSources?.[trackId];
            if (!source) return true; // own track, always visible
            return source.ownerChannelId === activeChannelId;
        }).length;
    }, [activeLibrarySource, playlistAllSources, tracks, sharedTracks]);

    // Group playlists by group field
    const groupedPlaylists = useMemo(() => {
        const groups: Record<string, typeof musicPlaylists> = {};

        // Init ordered groups
        playlistGroupOrder.forEach(g => { groups[g] = []; });

        // Distribute playlists
        const sorted = [...musicPlaylists].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
        sorted.forEach(p => {
            const groupName = p.group || 'Ungrouped';
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(p);
        });

        // Sort: ordered groups first, then alphabetical, Ungrouped last
        return Object.entries(groups).sort(([a], [b]) => {
            const idxA = playlistGroupOrder.indexOf(a);
            const idxB = playlistGroupOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            if (a === 'Ungrouped') return 1;
            if (b === 'Ungrouped') return -1;
            return a.localeCompare(b);
        });
    }, [musicPlaylists, playlistGroupOrder]);

    // Collapsed group state — persisted to localStorage
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('music-collapsed-groups');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });
    const toggleGroup = (group: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group);
            else next.add(group);
            localStorage.setItem('music-collapsed-groups', JSON.stringify([...next]));
            return next;
        });
    };

    const handleMusicClick = () => {
        setActivePlaylist(null);
        navigate('/music');
    };

    const handlePlaylistClick = (playlistId: string) => {
        // Only restore subview state for subview→subview transitions
        // (e.g. coming from a shared playlist). For library→subview,
        // setActivePlaylist handles the swap and needs activeLibrarySource intact.
        const s = useMusicStore.getState();
        if (s.activePlaylistId !== null) {
            setActiveLibrarySource(s.subviewSource);
            setPlaylistAllSources(s.subviewAllSources);
        }
        setActivePlaylist(playlistId);
        navigate(`/music/playlist/${playlistId}`);
    };

    const handleLikedClick = () => {
        const s = useMusicStore.getState();
        if (s.activePlaylistId !== null) {
            setActiveLibrarySource(s.subviewSource);
            setPlaylistAllSources(s.subviewAllSources);
        }
        setActivePlaylist('liked');
        navigate('/music/liked');
    };

    // Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);

    const handleCreatePlaylist = async (name: string, group?: string) => {
        if (!userId || !channelId) return;
        const { createPlaylist } = useMusicStore.getState();
        await createPlaylist(userId, channelId, name, group);
        setShowCreateModal(false);
    };

    // Existing groups for group selector
    const existingGroups = useMemo(() => {
        const groups = new Set<string>();
        musicPlaylists.forEach(p => { if (p.group) groups.add(p.group); });
        return Array.from(groups);
    }, [musicPlaylists]);

    if (!expanded) return null;

    return (
        <div className={`mt-2 ${isDragging ? 'pointer-events-none' : ''}`}>
            <SidebarDivider />
            <div>
                {/* Music Header */}
                <div
                    className={`w-full flex items-center justify-between py-2.5 px-3 mb-1 rounded-lg transition-all duration-200 group ${isOnMusicPage && activePlaylistId === null
                        ? 'bg-sidebar-active text-text-primary'
                        : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary'
                        }`}
                >
                    {/* Main Click Target */}
                    <div
                        className="flex items-center gap-6 flex-1 cursor-pointer"
                        onClick={handleMusicClick}
                    >
                        <Music
                            size={24}
                            strokeWidth={isOnMusicPage && activePlaylistId === null ? 2.5 : 1.5}
                            fill={isOnMusicPage && activePlaylistId === null ? 'currentColor' : 'none'}
                            className="transition-all"
                        />
                        <span className={`text-sm ${isOnMusicPage && activePlaylistId === null ? 'font-medium' : 'font-normal'}`}>
                            Music
                        </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                        {/* Toggle Collapse */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsContentExpanded(!isContentExpanded);
                            }}
                            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
                        >
                            {isContentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>

                        {/* Add Playlist */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowCreateModal(true);
                            }}
                            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
                            title="New playlist"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {isContentExpanded && (
                    <div className="pl-3 pb-2">
                        {isPlaylistsLoading ? (
                            /* Skeleton replaces the entire list including the Liked row.
                               GroupRowSkeleton matches Liked's dimensions (w-6 h-6 circle + name + w-4 count). */
                            <ul className="space-y-0.5">
                                <MusicPlaylistSkeleton count={5} variant="grouped" />
                            </ul>
                        ) : (
                            <ul className="space-y-0.5">
                                {/* ♥ Liked — channel-level sizing */}
                                <LikedPlaylistRow
                                    isActive={isOnMusicPage && activePlaylistId === 'liked'}
                                    likedCount={likedCount}
                                    onClick={handleLikedClick}
                                />

                                {/* Grouped Playlists */}
                                {groupedPlaylists.map(([groupName, playlists], groupIdx) => {
                                    if (playlists.length === 0) return null;

                                    // Ungrouped playlists — each item animates in with stagger
                                    if (groupName === 'Ungrouped') {
                                        return playlists.map((playlist, itemIdx) => (
                                            <li
                                                key={playlist.id}
                                                className="animate-fade-in-down"
                                                style={{ animationDelay: `${itemIdx * 35}ms`, animationFillMode: 'both' }}
                                            >
                                                <MusicPlaylistItem
                                                    id={playlist.id}
                                                    name={playlist.name}
                                                    trackCount={getEffectiveCount(playlist)}
                                                    isActive={isOnMusicPage && activePlaylistId === playlist.id}
                                                    onClick={() => handlePlaylistClick(playlist.id)}
                                                    color={playlist.color}
                                                    playlist={playlist}
                                                    existingGroups={existingGroups}
                                                />
                                            </li>
                                        ));
                                    }

                                    // Named group — whole li (header + children) animates as a unit
                                    const isCollapsed = collapsedGroups.has(groupName);
                                    return (
                                        <li
                                            key={groupName}
                                            className="animate-fade-in-down"
                                            style={{ animationDelay: `${groupIdx * 35}ms`, animationFillMode: 'both' }}
                                        >
                                            {/* Group Header — same size as TrendsChannelItem */}
                                            <div
                                                onClick={() => toggleGroup(groupName)}
                                                className="flex items-center cursor-pointer p-2 rounded-lg transition-all duration-200 select-none hover:bg-black/5 dark:hover:bg-white/5"
                                            >
                                                <div className="w-6 h-6 rounded-full mr-3 flex items-center justify-center bg-black/5 dark:bg-white/5">
                                                    <ChevronDown
                                                        size={14}
                                                        className={`transition-transform duration-200 text-text-tertiary ${isCollapsed ? '-rotate-90' : ''
                                                            }`}
                                                    />
                                                </div>
                                                <span className="text-sm flex-1 overflow-hidden whitespace-nowrap text-text-secondary">
                                                    {groupName}
                                                </span>
                                                <div className="ml-2 flex items-center justify-center shrink-0 w-4">
                                                    <span className="text-[10px] text-text-tertiary leading-none">
                                                        {playlists.length}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Group Playlists */}
                                            {!isCollapsed && (
                                                <ul className="space-y-0.5">
                                                    {playlists.map(playlist => (
                                                        <MusicPlaylistItem
                                                            key={playlist.id}
                                                            id={playlist.id}
                                                            name={playlist.name}
                                                            trackCount={getEffectiveCount(playlist)}
                                                            isActive={isOnMusicPage && activePlaylistId === playlist.id}
                                                            onClick={() => handlePlaylistClick(playlist.id)}
                                                            color={playlist.color}
                                                            indent
                                                            playlist={playlist}
                                                            existingGroups={existingGroups}
                                                        />
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}

                {/* Shared Libraries — owner's playlists under "SHARED WITH ME" */}
                {isContentExpanded && sharedLibraries.length > 0 && (
                    <div className="pl-3 pb-2">
                        <div className="flex items-center gap-1.5 px-2 pt-3 pb-1">
                            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Shared with me</span>
                        </div>
                        <ul className="space-y-0.5">
                            {/* Shared library entries — one per shared channel, collapsible */}
                            {sharedLibraries.map(lib => {
                                const isSharedCollapsed = collapsedGroups.has(`shared:${lib.ownerChannelId}`);
                                return (
                                    <li key={lib.ownerChannelId}>
                                        {/* Channel Header — collapsible like playlist groups */}
                                        <div
                                            onClick={() => {
                                                // Only toggle collapse — never activate the library on header click
                                                toggleGroup(`shared:${lib.ownerChannelId}`);
                                            }}
                                            className={`flex items-center cursor-pointer p-2 rounded-lg transition-all duration-200 select-none hover:bg-white/5`}
                                        >
                                            <div className="w-6 h-6 rounded-full mr-3 flex items-center justify-center bg-white/5">
                                                <Share2 size={12} className="text-text-tertiary" />
                                            </div>
                                            <span className="text-sm flex-1 overflow-hidden whitespace-nowrap truncate transition-colors text-text-secondary">
                                                {lib.ownerChannelName}
                                            </span>
                                            {/* Chevron — visible while loading (no count) and when playlists exist (with count) */}
                                            {(pendingSharedChannels.has(lib.ownerChannelId) ||
                                                (playlistsByChannel[lib.ownerChannelId]?.length ?? 0) > 0) && (
                                                    <div className="ml-2 flex items-center gap-1 shrink-0">
                                                        {!pendingSharedChannels.has(lib.ownerChannelId) && (
                                                            <span className="text-[10px] text-text-tertiary leading-none">
                                                                {playlistsByChannel[lib.ownerChannelId]?.length ?? 0}
                                                            </span>
                                                        )}
                                                        <ChevronDown
                                                            size={12}
                                                            className={`transition-transform duration-200 text-text-tertiary ${isSharedCollapsed ? '-rotate-90' : ''
                                                                }`}
                                                        />
                                                    </div>
                                                )}
                                        </div>

                                        {/* Owner's playlists — collapsible */}
                                        {!isSharedCollapsed && (
                                            pendingSharedChannels.has(lib.ownerChannelId) ? (
                                                <MusicPlaylistSkeleton count={3} />
                                            ) : (playlistsByChannel[lib.ownerChannelId]?.length ?? 0) > 0 ? (
                                                <ul className="space-y-0.5">
                                                    {playlistsByChannel[lib.ownerChannelId].map((playlist: MusicPlaylist, idx: number) => (
                                                        <li
                                                            key={`shared-${playlist.id}`}
                                                            className="animate-fade-in-down"
                                                            style={{ animationDelay: `${idx * 35}ms`, animationFillMode: 'both' }}
                                                        >
                                                            <MusicPlaylistItem
                                                                id={playlist.id}
                                                                name={playlist.name}
                                                                trackCount={getEffectiveCount(playlist)}
                                                                isActive={isOnMusicPage && activePlaylistId === playlist.id}
                                                                onClick={() => {
                                                                    // Save current subview state before overriding with shared lib context.
                                                                    // Shared playlists hide the switcher, so this override shouldn't
                                                                    // pollute the persisted subview selection for own playlists.
                                                                    const s = useMusicStore.getState();
                                                                    useMusicStore.setState({
                                                                        subviewSource: s.activeLibrarySource,
                                                                        subviewAllSources: s.playlistAllSources,
                                                                    });
                                                                    setActiveLibrarySource(lib);
                                                                    setPlaylistAllSources(false);
                                                                    handlePlaylistClick(playlist.id);
                                                                }}
                                                                color={playlist.color}
                                                                indent
                                                                playlist={playlist}
                                                                existingGroups={[]}
                                                                canEdit={lib.permissions?.canEdit ?? false}
                                                                canDelete={lib.permissions?.canDelete ?? false}
                                                                ownerUserId={lib.ownerUserId}
                                                                ownerChannelId={lib.ownerChannelId}
                                                            />
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : null
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {/* Create Playlist Modal */}
            <CreateMusicPlaylistModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onConfirm={handleCreatePlaylist}
                existingGroups={existingGroups}
            />
        </div >
    );
};

// =============================================================================
// MUSIC SIDEBAR SECTION
// =============================================================================
// Expandable sidebar section for Music, analogous to TrendsSidebarSection.
// Shows: Music header → ♥ Liked → Playlist Groups → Ungrouped Playlists → + New
// =============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { Music, Plus, ChevronDown, ChevronRight, Heart } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMusicStore } from '../../../core/stores/musicStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { MusicPlaylistItem } from './MusicPlaylistItem';
import { SidebarDivider } from '../../../components/Layout/Sidebar';
import { CreateMusicPlaylistModal } from '../modals/CreateMusicPlaylistModal';

export const MusicSidebarSection: React.FC<{ expanded: boolean }> = ({ expanded }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    const {
        tracks,
        musicPlaylists,
        activePlaylistId,
        playlistGroupOrder,
        subscribePlaylists,
        loadPlaylistSettings,
        setActivePlaylist,
    } = useMusicStore();

    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    // Subscribe to playlists
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsub = subscribePlaylists(userId, channelId);
        loadPlaylistSettings(userId, channelId);
        return unsub;
    }, [userId, channelId, subscribePlaylists, loadPlaylistSettings]);

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
        setActivePlaylist(playlistId);
        navigate(`/music/playlist/${playlistId}`);
    };

    const handleLikedClick = () => {
        setActivePlaylist('liked');
        navigate('/music/liked');
    };

    // Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);

    const handleCreatePlaylist = async (name: string, group?: string) => {
        if (!userId || !channelId) return;
        const { createPlaylist } = useMusicStore.getState();
        const playlist = await createPlaylist(userId, channelId, name, group);
        setActivePlaylist(playlist.id);
        navigate(`/music/playlist/${playlist.id}`);
    };

    // Existing groups for group selector
    const existingGroups = useMemo(() => {
        const groups = new Set<string>();
        musicPlaylists.forEach(p => { if (p.group) groups.add(p.group); });
        return Array.from(groups);
    }, [musicPlaylists]);

    if (!expanded) return null;

    return (
        <div className="mt-2">
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
                            className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
                        >
                            {isContentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>

                        {/* Add Playlist */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowCreateModal(true);
                            }}
                            className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
                            title="New playlist"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {isContentExpanded && (
                    <div className="pl-3 pb-2">
                        <ul className="space-y-0.5">
                            {/* ♥ Liked — channel-level sizing */}
                            <li
                                onClick={handleLikedClick}
                                className={`flex items-center cursor-pointer p-2 rounded-lg transition-all duration-200 select-none ${isOnMusicPage && activePlaylistId === 'liked'
                                    ? 'bg-white/10'
                                    : 'hover:bg-white/5'
                                    }`}
                            >
                                <div className={`w-6 h-6 rounded-full mr-3 flex items-center justify-center ${isOnMusicPage && activePlaylistId === 'liked'
                                    ? 'bg-red-500/20 ring-2 ring-red-400/30'
                                    : 'bg-white/5'
                                    }`}>
                                    <Heart
                                        size={14}
                                        className={isOnMusicPage && activePlaylistId === 'liked'
                                            ? 'text-red-400 fill-red-400'
                                            : 'text-red-400/60 fill-red-400/60'
                                        }
                                    />
                                </div>
                                <span className={`text-sm flex-1 overflow-hidden whitespace-nowrap transition-colors ${isOnMusicPage && activePlaylistId === 'liked'
                                    ? 'text-text-primary font-medium'
                                    : 'text-text-secondary'
                                    }`}>
                                    Liked
                                </span>
                                <div className="ml-2 flex items-center justify-center shrink-0 w-4">
                                    <span className="text-[10px] text-text-tertiary leading-none">
                                        {likedCount}
                                    </span>
                                </div>
                            </li>

                            {/* Grouped Playlists */}
                            {groupedPlaylists.map(([groupName, playlists]) => {
                                if (playlists.length === 0) return null;

                                // Ungrouped playlists (no group header)
                                if (groupName === 'Ungrouped') {
                                    return playlists.map(playlist => (
                                        <MusicPlaylistItem
                                            key={playlist.id}
                                            id={playlist.id}
                                            name={playlist.name}
                                            trackCount={playlist.trackIds.length}
                                            isActive={isOnMusicPage && activePlaylistId === playlist.id}
                                            onClick={() => handlePlaylistClick(playlist.id)}
                                            color={playlist.color}
                                            playlist={playlist}
                                            existingGroups={existingGroups}
                                        />
                                    ));
                                }

                                // Named group with collapsible header — channel-level sizing
                                const isCollapsed = collapsedGroups.has(groupName);
                                return (
                                    <li key={groupName}>
                                        {/* Group Header — same size as TrendsChannelItem */}
                                        <div
                                            onClick={() => toggleGroup(groupName)}
                                            className="flex items-center cursor-pointer p-2 rounded-lg transition-all duration-200 select-none hover:bg-white/5"
                                        >
                                            <div className="w-6 h-6 rounded-full mr-3 flex items-center justify-center bg-white/5">
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
                                                        trackCount={playlist.trackIds.length}
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
        </div>
    );
};

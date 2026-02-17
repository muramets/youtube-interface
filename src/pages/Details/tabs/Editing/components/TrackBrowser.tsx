import React, { useEffect, useMemo, useState } from 'react';
import { Search, PanelRightClose } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { useMusicStore, selectAllTracks, selectAllPlaylists } from '../../../../../core/stores/musicStore';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useTrackFilters } from '../../../../../core/hooks/useTrackFilters';
import { CompactFilterBar } from './CompactFilterBar';
import { TrackBrowserItem } from './TrackBrowserItem';
import { PlaylistBrowserItem } from './PlaylistBrowserItem';

type BrowserTab = 'tracks' | 'playlists';

export const TrackBrowser: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const allTracks = useMusicStore(selectAllTracks);
    const allPlaylists = useMusicStore(selectAllPlaylists);
    const subscribe = useMusicStore((s) => s.subscribe);
    const subscribePlaylists = useMusicStore((s) => s.subscribePlaylists);
    const loadSettings = useMusicStore((s) => s.loadSettings);
    const loadSharedLibraries = useMusicStore((s) => s.loadSharedLibraries);
    const subscribeSharedLibraryTracks = useMusicStore((s) => s.subscribeSharedLibraryTracks);
    const sharedLibraries = useMusicStore((s) => s.sharedLibraries);
    const timelineTracks = useEditingStore((s) => s.tracks);
    const toggleBrowser = useEditingStore((s) => s.toggleBrowser);

    const userId = user?.uid || '';
    const channelId = currentChannel?.id || '';

    // Ensure own tracks + playlists are loaded
    useEffect(() => {
        if (!userId || !channelId) return;
        const unsubTracks = subscribe(userId, channelId);
        const unsubPlaylists = subscribePlaylists(userId, channelId);
        loadSettings(userId, channelId);
        return () => { unsubTracks(); unsubPlaylists(); };
    }, [userId, channelId, subscribe, subscribePlaylists, loadSettings]);

    // Load shared library metadata
    useEffect(() => {
        if (!userId || !channelId) return;
        loadSharedLibraries(userId, channelId);
    }, [userId, channelId, loadSharedLibraries]);

    // Subscribe to shared library tracks/playlists at store level
    useEffect(() => {
        const unsub = subscribeSharedLibraryTracks();
        return unsub;
    }, [sharedLibraries, subscribeSharedLibraryTracks]);

    const [activeTab, setActiveTab] = useState<BrowserTab>('tracks');
    const [searchQuery, setSearchQuery] = useState('');

    // Independent filter state via shared hook
    const filters = useTrackFilters(allTracks, searchQuery);

    // Track IDs already on timeline (for highlighting)
    const timelineTrackIds = useMemo(
        () => new Set(timelineTracks.map((t) => t.trackId)),
        [timelineTracks]
    );

    // Filtered playlists by search query
    const filteredPlaylists = useMemo(() => {
        if (!searchQuery.trim()) return allPlaylists;
        const q = searchQuery.toLowerCase();
        return allPlaylists.filter((p) => p.name.toLowerCase().includes(q));
    }, [allPlaylists, searchQuery]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border">
                <h3 className="text-sm font-semibold text-text-primary">Browser</h3>
                <PortalTooltip content={<span className="whitespace-nowrap">Close panel</span>} side="bottom" align="right" enterDelay={500}>
                    <button
                        onClick={toggleBrowser}
                        className="p-1 rounded hover:bg-hover text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <PanelRightClose size={16} />
                    </button>
                </PortalTooltip>
            </div>

            {/* Tab Switcher */}
            <div className="flex border-b border-border">
                <button
                    onClick={() => setActiveTab('tracks')}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${activeTab === 'tracks'
                        ? 'text-text-primary border-b-2 border-text-primary'
                        : 'text-text-tertiary hover:text-text-secondary'
                        }`}
                >
                    Tracks
                </button>
                <button
                    onClick={() => setActiveTab('playlists')}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${activeTab === 'playlists'
                        ? 'text-text-primary border-b-2 border-text-primary'
                        : 'text-text-tertiary hover:text-text-secondary'
                        }`}
                >
                    Playlists
                </button>
            </div>

            {/* Search */}
            <div className="px-3 pt-3 pb-1.5">
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={activeTab === 'tracks' ? 'Search tracks...' : 'Search playlists...'}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-input-bg border border-border text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-tertiary transition-colors"
                    />
                </div>
            </div>

            {/* Filter Bar (tracks only) */}
            {activeTab === 'tracks' && <CompactFilterBar {...filters} />}

            {/* Content List */}
            <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
                {activeTab === 'tracks' ? (
                    filters.filteredTracks.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
                            {allTracks.length === 0 ? 'No tracks in library' : 'No matches'}
                        </div>
                    ) : (
                        filters.filteredTracks.map((track) => (
                            <TrackBrowserItem
                                key={track.id}
                                track={track}
                                isOnTimeline={timelineTrackIds.has(track.id)}
                            />
                        ))
                    )
                ) : (
                    filteredPlaylists.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
                            {allPlaylists.length === 0 ? 'No playlists' : 'No matches'}
                        </div>
                    ) : (
                        filteredPlaylists.map((playlist) => (
                            <PlaylistBrowserItem
                                key={playlist.id}
                                playlist={playlist}
                                timelineTrackIds={timelineTrackIds}
                                browseTracks={allTracks}
                            />
                        ))
                    )
                )}
            </div>

            {/* Footer count */}
            <div className="px-3 py-2 border-t border-border text-[10px] text-text-tertiary text-center">
                {activeTab === 'tracks'
                    ? `${filters.filteredTracks.length} of ${allTracks.length} tracks`
                    : `${filteredPlaylists.length} of ${allPlaylists.length} playlists`
                }
            </div>
        </div>
    );
};

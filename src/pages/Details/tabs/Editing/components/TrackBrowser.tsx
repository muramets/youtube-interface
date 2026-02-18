import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, PanelRightClose, Share2 } from 'lucide-react';
import { PortalTooltip } from '../../../../../components/ui/atoms/PortalTooltip';
import { useMusicStore } from '../../../../../core/stores/musicStore';
import { useEditingStore } from '../../../../../core/stores/editingStore';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useTrackFilters } from '../../../../../core/hooks/useTrackFilters';
import { CompactFilterBar } from './CompactFilterBar';
import { TrackBrowserItem } from './TrackBrowserItem';
import { PlaylistBrowserItem } from './PlaylistBrowserItem';
import type { SharedLibraryEntry } from '../../../../../core/types/musicSharing';

/** Shared library tab button with truncation-aware tooltip */
const SharedLibraryTab: React.FC<{
    lib: SharedLibraryEntry;
    isActive: boolean;
    onClick: () => void;
}> = ({ lib, isActive, onClick }) => {
    const textRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    const checkTruncation = useCallback(() => {
        const el = textRef.current;
        if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
    }, []);

    useEffect(() => {
        checkTruncation();
        const observer = new ResizeObserver(checkTruncation);
        if (textRef.current) observer.observe(textRef.current);
        return () => observer.disconnect();
    }, [checkTruncation]);

    return (
        <PortalTooltip content={lib.ownerChannelName} enterDelay={300} triggerClassName="flex-1 min-w-0" disabled={!isTruncated}>
            <button
                onClick={onClick}
                className={`w-full px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${isActive
                    ? 'bg-white/[0.1] text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                    }`}
            >
                <Share2 size={9} className="flex-shrink-0" />
                <span ref={textRef} className="truncate">{lib.ownerChannelName}</span>
            </button>
        </PortalTooltip>
    );
};

type BrowserTab = 'tracks' | 'playlists';

export const TrackBrowser: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const ownTracks = useMusicStore((s) => s.tracks);
    const ownPlaylists = useMusicStore((s) => s.musicPlaylists);
    const sharedTracks = useMusicStore((s) => s.sharedTracks);
    const sharedPlaylists = useMusicStore((s) => s.sharedPlaylists);
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

    // Library source: null = own, SharedLibraryEntry = specific shared library
    const [librarySource, setLibrarySource] = useState<SharedLibraryEntry | null>(null);

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

    // Derive effective library source — auto-reset when shared libraries disappear
    const effectiveSource = useMemo(() => {
        if (sharedLibraries.length === 0) return null;
        return librarySource;
    }, [sharedLibraries.length, librarySource]);

    // Pick tracks based on library source
    const sourceTracks = useMemo(() => {
        if (!effectiveSource) return ownTracks;
        return sharedTracks;
    }, [effectiveSource, ownTracks, sharedTracks]);

    // Pick playlists based on library source
    const sourcePlaylists = useMemo(() => {
        if (!effectiveSource) return ownPlaylists;
        return sharedPlaylists;
    }, [effectiveSource, ownPlaylists, sharedPlaylists]);

    // Independent filter state via shared hook (operates on source-specific tracks)
    const filters = useTrackFilters(sourceTracks, searchQuery);

    // Track IDs already on timeline (for highlighting)
    const timelineTrackIds = useMemo(
        () => new Set(timelineTracks.map((t) => t.trackId)),
        [timelineTracks]
    );

    // Filtered playlists by search query
    const filteredPlaylists = useMemo(() => {
        if (!searchQuery.trim()) return sourcePlaylists;
        const q = searchQuery.toLowerCase();
        return sourcePlaylists.filter((p) => p.name.toLowerCase().includes(q));
    }, [sourcePlaylists, searchQuery]);

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

            {/* Library Switcher — animated slide-down via CSS Grid 0fr→1fr */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateRows: sharedLibraries.length > 0 ? '1fr' : '0fr',
                    transition: 'grid-template-rows 0.25s ease-out',
                }}
            >
                <div style={{ overflow: 'hidden' }}>
                    <div className="flex items-center gap-1 px-3 pt-2.5 pb-1">
                        <div className="flex items-center gap-0.5 p-0.5 bg-white/[0.04] rounded-lg w-full">
                            <button
                                onClick={() => setLibrarySource(null)}
                                className={`flex-1 min-w-0 px-2 py-1 rounded-md text-[10px] font-medium transition-all truncate ${!effectiveSource
                                    ? 'bg-white/[0.1] text-text-primary shadow-sm'
                                    : 'text-text-secondary hover:text-text-primary'
                                    }`}
                            >
                                My Library
                            </button>
                            {sharedLibraries.map((lib: SharedLibraryEntry) => (
                                <SharedLibraryTab
                                    key={lib.ownerChannelId}
                                    lib={lib}
                                    isActive={effectiveSource?.ownerChannelId === lib.ownerChannelId}
                                    onClick={() => setLibrarySource(lib)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
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
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-1.5">
                {activeTab === 'tracks' ? (
                    filters.filteredTracks.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
                            {sourceTracks.length === 0 ? 'No tracks in library' : 'No matches'}
                        </div>
                    ) : (
                        filters.filteredTracks.map((track) => (
                            <TrackBrowserItem
                                key={track.id}
                                track={track}
                                isOnTimeline={timelineTrackIds.has(track.id)}
                                browseTracks={filters.filteredTracks}
                            />
                        ))
                    )
                ) : (
                    filteredPlaylists.length === 0 ? (
                        <div className="flex items-center justify-center h-20 text-xs text-text-tertiary">
                            {sourcePlaylists.length === 0 ? 'No playlists' : 'No matches'}
                        </div>
                    ) : (
                        filteredPlaylists.map((playlist) => (
                            <PlaylistBrowserItem
                                key={playlist.id}
                                playlist={playlist}
                                timelineTrackIds={timelineTrackIds}
                                browseTracks={sourceTracks}
                            />
                        ))
                    )
                )}
            </div>

            {/* Footer count */}
            <div className="px-3 py-2 border-t border-border text-[10px] text-text-tertiary text-center">
                {activeTab === 'tracks'
                    ? `${filters.filteredTracks.length} of ${sourceTracks.length} tracks`
                    : `${filteredPlaylists.length} of ${sourcePlaylists.length} playlists`
                }
            </div>
        </div>
    );
};

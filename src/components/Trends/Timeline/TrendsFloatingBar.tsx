import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus, Plus, X, ChevronDown, Check, Globe, Home, ListVideo } from 'lucide-react';
import type { TrendNiche, TrendVideo } from '../../../types/trends';
import { useTrendStore, generateNicheColor } from '../../../stores/trendStore';
import { useAuth } from '../../../hooks/useAuth';
import { useChannelStore } from '../../../stores/channelStore';
import { usePlaylists } from '../../../hooks/usePlaylists';
import { useVideos } from '../../../hooks/useVideos';
import { useUIStore } from '../../../stores/uiStore';
import { VideoService } from '../../../services/videoService';
import { PlaylistService } from '../../../services/playlistService';
import { useSmartPosition } from './hooks/useSmartPosition';
import { FloatingNicheItem } from './FloatingNicheItem';

interface TrendsFloatingBarProps {
    video: TrendVideo;
    position: { x: number; y: number };
    onClose: () => void;
}

// Internal reusable portal dropdown
const FloatingDropdownPortal: React.FC<{
    isOpen: boolean;
    anchorRect: DOMRect | null;
    openAbove: boolean;
    width?: number;
    children: React.ReactNode;
}> = ({ isOpen, anchorRect, openAbove, width = 288, children }) => {
    if (!isOpen || !anchorRect) return null;

    const GAP = 8;
    const PADDING = 16;
    const screenWidth = window.innerWidth;

    // Horizontal: center or clamp
    let left = anchorRect.left;
    if (width === 256) { // Special case for smaller playlist dropdown to center it
        left = anchorRect.left + anchorRect.width / 2 - width / 2;
    }

    if (left + width > screenWidth - PADDING) {
        left = screenWidth - PADDING - width;
    }
    if (left < PADDING) {
        left = PADDING;
    }

    const top = openAbove ? anchorRect.top - GAP : anchorRect.bottom + GAP;

    return createPortal(
        <div
            className="fixed bg-bg-secondary/90 backdrop-blur-md border border-border rounded-xl shadow-lg overflow-hidden flex flex-col animate-fade-in z-[9999]"
            style={{
                left,
                top,
                width,
                transform: openAbove ? 'translateY(-100%)' : 'none',
                maxHeight: 280,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
};

export const TrendsFloatingBar: React.FC<TrendsFloatingBarProps> = ({
    video,
    position,
    onClose
}) => {
    const { niches, addNiche, assignVideoToNiche, removeVideoFromNiche, videoNicheAssignments } = useTrendStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, addVideoToPlaylist, removeVideoFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    // Resolve assigned niches (now array-based)
    const videoAssignments = videoNicheAssignments[video.id] || [];
    const assignedNicheIds = new Set(videoAssignments.map(a => a.nicheId));

    // Find display niche: highest view count, or earliest added if tied
    const displayNiche = useMemo(() => {
        if (videoAssignments.length === 0) return null;

        // Get niches with their view counts
        const nichesWithStats = videoAssignments
            .map(a => {
                const niche = niches.find(n => n.id === a.nicheId);
                return niche ? { niche, addedAt: a.addedAt } : null;
            })
            .filter((n): n is { niche: typeof niches[0], addedAt: number } => n !== null);

        if (nichesWithStats.length === 0) return null;

        // Sort by viewCount desc, then by addedAt asc (earliest first)
        nichesWithStats.sort((a, b) => {
            const viewDiff = (b.niche.viewCount || 0) - (a.niche.viewCount || 0);
            if (viewDiff !== 0) return viewDiff;
            return a.addedAt - b.addedAt; // Earlier added first
        });

        return nichesWithStats[0].niche;
    }, [videoAssignments, niches]);

    // Check if video is already in home
    const isAddedToHome = useMemo(() => {
        return homeVideos.some(v => v.id === video.id && !v.isPlaylistOnly);
    }, [homeVideos, video.id]);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [activeNicheMenuId, setActiveNicheMenuId] = useState<string | null>(null);
    const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
    const [newNicheName, setNewNicheName] = useState('');
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isGlobal, setIsGlobal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const barRef = useRef<HTMLDivElement>(null);
    const nicheButtonRef = useRef<HTMLButtonElement>(null);
    const playlistButtonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const playlistInputRef = useRef<HTMLInputElement>(null);

    // Smart Positioning Hook
    const { coords } = useSmartPosition({
        targetPos: position,
        elementRef: barRef,
        width: 300,
        offsetY: 60
    });

    // Unified Dropdown Direction
    const dropdownsOpenAbove = coords.y > window.innerHeight / 2;

    // Auto-focus inputs
    useEffect(() => {
        if (isDropdownOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isDropdownOpen]);

    useEffect(() => {
        if (isPlaylistDropdownOpen) setTimeout(() => playlistInputRef.current?.focus(), 50);
    }, [isPlaylistDropdownOpen]);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newNicheName.trim()) {
            const existingColors = niches.map(n => n.color);
            const newColor = generateNicheColor(existingColors);

            const newNiche: Omit<TrendNiche, 'createdAt' | 'viewCount'> = {
                id: crypto.randomUUID(),
                name: newNicheName.trim(),
                color: newColor,
                type: isGlobal ? 'global' : 'local',
                channelId: video.channelId // Always save origin channel
            };

            addNiche(newNiche);
            assignVideoToNiche(video.id, newNiche.id);

            setNewNicheName('');
            setIsDropdownOpen(false);
        }
    };

    const handleNicheToggle = (nicheId: string, isAssigned: boolean) => {
        if (isAssigned) {
            removeVideoFromNiche(video.id, nicheId);
        } else {
            assignVideoToNiche(video.id, nicheId);
        }
    };

    const handleQuickAction = async (action: () => Promise<void>) => {
        setIsProcessing(true);
        try {
            await action();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddToHome = async () => {
        if (!user || !currentChannel || isAddedToHome) return;

        await handleQuickAction(async () => {
            // @ts-ignore - TrendVideo may not have all VideoDetails fields
            await VideoService.addVideo(user.uid, currentChannel.id, {
                ...video,
                isPlaylistOnly: false,
                createdAt: Date.now()
            });
            showToast('Added to Home', 'success');
        });
    };

    const handleRemoveFromHome = async () => {
        if (!user || !currentChannel || !isAddedToHome) return;

        await handleQuickAction(async () => {
            await VideoService.deleteVideo(user.uid, currentChannel.id, video.id);
            showToast('Removed from Home', 'success');
        });
    };

    const handleHomeToggle = async () => {
        if (isAddedToHome) {
            await handleRemoveFromHome();
        } else {
            await handleAddToHome();
        }
    };

    const handlePlaylistToggle = async (playlistId: string, playlistName: string, isInPlaylist: boolean) => {
        if (!user || !currentChannel) return;

        await handleQuickAction(async () => {
            if (isInPlaylist) {
                // Remove from playlist
                await removeVideoFromPlaylist({ playlistId, videoId: video.id });
                showToast(`Removed from "${playlistName}"`, 'success');
            } else {
                // Add to playlist - ensure video exists in DB first
                const videoExists = homeVideos.some(v => v.id === video.id);
                if (!videoExists) {
                    // @ts-ignore
                    await VideoService.addVideo(user.uid, currentChannel.id, {
                        ...video,
                        isPlaylistOnly: true,
                        createdAt: Date.now()
                    });
                }
                await addVideoToPlaylist({ playlistId, videoId: video.id });
                showToast(`Added to "${playlistName}"`, 'success');
            }
        });
    };

    const handleCreatePlaylist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPlaylistName.trim() || !user || !currentChannel) return;

        await handleQuickAction(async () => {
            // Ensure video exists
            const videoExists = homeVideos.some(v => v.id === video.id);
            if (!videoExists) {
                // @ts-ignore
                await VideoService.addVideo(user.uid, currentChannel.id, {
                    ...video,
                    isPlaylistOnly: true,
                    createdAt: Date.now()
                });
            }

            const playlistId = `playlist-${Date.now()}`;
            await PlaylistService.createPlaylist(user.uid, currentChannel.id, {
                id: playlistId,
                name: newPlaylistName.trim(),
                videoIds: [video.id],
                createdAt: Date.now()
            });

            showToast(`Created "${newPlaylistName}"`, 'success');
            setNewPlaylistName('');
            setIsPlaylistDropdownOpen(false);
        });
    };

    // Compute last used timestamp for each niche
    const nicheLastUsed = useMemo(() => {
        const lastUsed = new Map<string, number>();
        // Iterate all assignments to find latest addedAt for each niche
        Object.values(videoNicheAssignments).flat().forEach(assignment => {
            const current = lastUsed.get(assignment.nicheId) || 0;
            if (assignment.addedAt > current) {
                lastUsed.set(assignment.nicheId, assignment.addedAt);
            }
        });
        return lastUsed;
    }, [videoNicheAssignments]);

    const filteredNiches = niches.filter(n => {
        if (!newNicheName) return true;
        return n.name.toLowerCase().includes(newNicheName.toLowerCase());
    }).sort((a, b) => {
        const timeA = nicheLastUsed.get(a.id) || 0;
        const timeB = nicheLastUsed.get(b.id) || 0;
        return timeB - timeA; // Most recently used first
    });

    // Check which playlists contain this video
    const getPlaylistContainsVideo = (playlist: { videoIds?: string[] }) => {
        return playlist.videoIds?.includes(video.id) || false;
    };

    return (
        <div
            ref={barRef}
            className="flex items-center gap-2 bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg rounded-full px-4 py-2 animate-fade-in fixed z-[1000]"
            style={{ left: coords.x, top: coords.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-3 pr-3 border-r border-white/10">
                <span className="text-sm font-medium text-white whitespace-nowrap max-w-[150px] truncate">
                    {video.title}
                </span>
                <button
                    onClick={onClose}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-text-secondary hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Niche Dropdown */}
            <div className="relative">
                <button
                    ref={nicheButtonRef}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                        setIsDropdownOpen(!isDropdownOpen);
                        setIsPlaylistDropdownOpen(false);
                    }}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
                        ${displayNiche ? 'bg-white/10 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}
                        ${isDropdownOpen ? 'ring-1 ring-white/30' : ''}
                    `}
                    style={{ backgroundColor: displayNiche?.color ? `${displayNiche.color}20` : undefined }}
                >
                    {displayNiche ? (
                        <>
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: displayNiche.color }} />
                            <span className="truncate max-w-[120px]">{displayNiche.name}</span>
                            {assignedNicheIds.size > 1 && (
                                <span className="text-[10px] text-text-secondary">+{assignedNicheIds.size - 1}</span>
                            )}
                        </>
                    ) : (
                        <>
                            <FolderPlus size={16} />
                            Assign Niche
                        </>
                    )}
                    <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? '' : 'rotate-180'}`} />
                </button>

                <FloatingDropdownPortal
                    isOpen={isDropdownOpen}
                    anchorRect={nicheButtonRef.current?.getBoundingClientRect() || null}
                    openAbove={dropdownsOpenAbove}
                >
                    <div data-portal-wrapper className="flex flex-col h-full">
                        {/* Header / Create */}
                        <div className="p-2 border-b border-white/10 bg-white/5">
                            <form onSubmit={handleCreateSubmit} className="relative flex flex-col gap-2">
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        placeholder="Search or create niche..."
                                        className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                        value={newNicheName}
                                        onChange={(e) => setNewNicheName(e.target.value)}
                                    />
                                    <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                                </div>
                                {newNicheName && (
                                    <div className="flex items-center justify-between px-1 gap-3">
                                        {/* Premium Sliding Pill Toggle */}
                                        <div className="relative flex bg-white/5 rounded-full p-0.5 border border-white/10 backdrop-blur-sm">
                                            {/* Sliding Indicator */}
                                            <div
                                                className="absolute top-0.5 h-[calc(100%-4px)] w-[calc(50%-2px)] bg-gradient-to-r from-white/25 to-white/15 rounded-full transition-all duration-300 ease-out shadow-sm"
                                                style={{
                                                    left: isGlobal ? 'calc(50% + 1px)' : '2px',
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setIsGlobal(false)}
                                                className={`relative z-10 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all duration-200 ${!isGlobal ? 'text-white font-medium' : 'text-text-secondary hover:text-white/70'}`}
                                            >
                                                <Home size={9} className="flex-shrink-0" />
                                                <span>Local</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsGlobal(true)}
                                                className={`relative z-10 flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full transition-all duration-200 ${isGlobal ? 'text-white font-medium' : 'text-text-secondary hover:text-white/70'}`}
                                            >
                                                <Globe size={9} className="flex-shrink-0" />
                                                <span>Global</span>
                                            </button>
                                        </div>
                                        <button
                                            type="submit"
                                            className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 hover:text-blue-300 transition-all border border-blue-500/20"
                                        >
                                            Create
                                        </button>
                                    </div>
                                )}
                            </form>
                        </div>
                        {/* List */}
                        <div className="overflow-y-auto custom-scrollbar p-1 flex-1">
                            {filteredNiches.map(niche => {
                                const isAssigned = assignedNicheIds.has(niche.id);
                                return (
                                    <FloatingNicheItem
                                        key={niche.id}
                                        niche={niche}
                                        isAssigned={isAssigned}
                                        isActive={activeNicheMenuId === niche.id}
                                        onToggle={() => handleNicheToggle(niche.id, isAssigned)}
                                        onToggleMenu={() => setActiveNicheMenuId(current => current === niche.id ? null : niche.id)}
                                        onCloseMenu={() => setActiveNicheMenuId(null)}
                                    />
                                );
                            })}
                            {filteredNiches.length === 0 && !newNicheName && (
                                <div className="text-center py-3 text-xs text-text-tertiary">No niches found</div>
                            )}
                        </div>
                    </div>
                </FloatingDropdownPortal>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-2 ml-1">
                {/* Home Button with Premium Badge */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleHomeToggle}
                    disabled={isProcessing}
                    className={`relative p-1.5 rounded-full transition-all ${isAddedToHome
                        ? 'text-white hover:bg-red-500/20 hover:text-red-300'
                        : 'text-text-secondary hover:text-white hover:bg-white/10'
                        } ${isProcessing ? 'opacity-50' : ''}`}
                    title={isAddedToHome ? 'Remove from Home' : 'Add to Home'}
                >
                    <Home size={16} />
                    {/* Checkmark Badge */}
                    {isAddedToHome && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                            <Check size={8} className="text-white" strokeWidth={3} />
                        </div>
                    )}
                </button>

                <div className="relative">
                    <button
                        ref={playlistButtonRef}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => {
                            setIsPlaylistDropdownOpen(!isPlaylistDropdownOpen);
                            setIsDropdownOpen(false);
                        }}
                        disabled={isProcessing}
                        className={`p-1.5 rounded-full transition-colors ${isPlaylistDropdownOpen ? 'bg-white text-black' : 'text-text-secondary hover:text-white hover:bg-white/10'} ${isProcessing ? 'opacity-50' : ''}`}
                        title="Add to Playlist"
                    >
                        <ListVideo size={16} />
                    </button>

                    <FloatingDropdownPortal
                        isOpen={isPlaylistDropdownOpen}
                        anchorRect={playlistButtonRef.current?.getBoundingClientRect() || null}
                        openAbove={dropdownsOpenAbove}
                        width={256}
                    >
                        <div data-portal-wrapper className="flex flex-col h-full">
                            <div className="p-2 border-b border-white/10">
                                <form onSubmit={handleCreatePlaylist} className="relative">
                                    <input
                                        ref={playlistInputRef}
                                        type="text"
                                        placeholder="Create playlist..."
                                        className="w-full bg-bg-primary text-white text-xs px-3 py-2 pl-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-text-secondary"
                                        value={newPlaylistName}
                                        onChange={(e) => setNewPlaylistName(e.target.value)}
                                    />
                                    <Plus size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                                </form>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar p-1 flex-1">
                                {playlists.map(playlist => {
                                    const isInPlaylist = getPlaylistContainsVideo(playlist);
                                    return (
                                        <button
                                            key={playlist.id}
                                            onClick={() => handlePlaylistToggle(playlist.id, playlist.name, isInPlaylist)}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors justify-between ${isInPlaylist ? 'text-white' : 'text-text-secondary hover:text-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <ListVideo size={14} />
                                                <span className="truncate">{playlist.name}</span>
                                            </div>
                                            {isInPlaylist && <Check size={12} className="text-green-400 flex-shrink-0" />}
                                        </button>
                                    );
                                })}
                                {playlists.length === 0 && (
                                    <div className="text-center py-3 text-xs text-text-tertiary">No playlists</div>
                                )}
                            </div>
                        </div>
                    </FloatingDropdownPortal>
                </div>
            </div>


        </div>
    );
};

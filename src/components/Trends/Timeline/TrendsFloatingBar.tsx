import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderPlus, Plus, X, ChevronDown, Check, Trash2, Globe, Home, ListVideo } from 'lucide-react';
import type { TrendNiche, TrendVideo } from '../../../types/trends';
import { useTrendStore, generateNicheColor } from '../../../stores/trendStore';
import { useAuth } from '../../../hooks/useAuth';
import { useChannelStore } from '../../../stores/channelStore';
import { usePlaylists } from '../../../hooks/usePlaylists';
import { VideoService } from '../../../services/videoService';
import { PlaylistService } from '../../../services/playlistService';

interface TrendsFloatingBarProps {
    video: TrendVideo;
    position: { x: number; y: number };
    onClose: () => void;
}

export const TrendsFloatingBar: React.FC<TrendsFloatingBarProps> = ({
    video,
    position,
    onClose
}) => {
    const { niches, addNiche, assignVideoToNiche, removeVideoFromNiche, videoNicheAssignments } = useTrendStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, createPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');

    // Determine effective niche
    // 1. Check local override
    // 2. Check video.nicheId (not yet in real data, but good for future)
    const assignedNicheId = videoNicheAssignments[video.id] || video.nicheId;
    const assignedNiche = niches.find(n => n.id === assignedNicheId);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
    const [newNicheName, setNewNicheName] = useState('');
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [isGlobal, setIsGlobal] = useState(false); // Toggle for Global vs Local niche creation
    const [isProcessing, setIsProcessing] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const playlistDropdownRef = useRef<HTMLDivElement>(null);
    const nicheButtonRef = useRef<HTMLButtonElement>(null);
    const playlistButtonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const playlistInputRef = useRef<HTMLInputElement>(null);
    const barRef = useRef<HTMLDivElement>(null);

    // Dropdown position states for portal rendering
    const [nicheDropdownPos, setNicheDropdownPos] = useState({ left: 0, top: 0 });
    const [playlistDropdownPos, setPlaylistDropdownPos] = useState({ left: 0, top: 0 });

    // Unified dropdown direction based on bar position (all dropdowns open same way)
    const [dropdownsOpenAbove, setDropdownsOpenAbove] = useState(true);

    // Smart Positioning
    const [coords, setCoords] = useState(position);

    // Use useLayoutEffect to prevent visual jump and ensure measurements are correct before paint
    React.useLayoutEffect(() => {
        if (!barRef.current) return;

        // Use offsetWidth/Height to get the layout size, ignoring transform scaling (e.g. animate-scale-in)
        // This prevents the bar from jumping if a re-render happens during animation
        const width = barRef.current.offsetWidth;
        const height = barRef.current.offsetHeight;
        const PADDING = 16;
        let { x, y } = position; // Initial viewport coords (x is center of click, y is top of click)

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // X Axis:
        // We want CENTER of bar to be at `x`.
        // So ideal Left = x - width/2.
        let left = x - width / 2;

        // Clamp Left
        // 1. Minimum PADDING from left edge
        if (left < PADDING) {
            left = PADDING;
        }
        // 2. Maximum PADDING from right edge
        // Right edge of bar = left + width. Must be <= screenWidth - PADDING
        else if (left + width > screenWidth - PADDING) {
            left = screenWidth - PADDING - width;
        }

        // Y Axis:
        // Ideal Top: Above the video (y - 60).
        let top = y - 60;

        // Check if top is clipped (above screen top)
        if (top < PADDING) {
            // Not enough space above? Try below.
            // y + buffer. Let's assume click was at Top of dot.
            // Dot is ~20-40px. Let's start 40px below y.
            const belowTop = y + 40;
            // Does it fit below?
            if (belowTop + height < screenHeight - PADDING) {
                top = belowTop;
            } else {
                // If it fits neither, prefer the one with MORE space visible or keep top clamped?
                // Default to clamped top if forced?
                top = Math.max(PADDING, top);
            }
        }

        setCoords({ x: left, y: top });

        // Unified dropdown direction: if bar is in top half of screen, open dropdowns below
        const barCenterY = top + height / 2;
        setDropdownsOpenAbove(barCenterY > screenHeight / 2);
    }, [position, isDropdownOpen, isPlaylistDropdownOpen]); // Re-run if size changes due to dropdowns

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                barRef.current &&
                !barRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                playlistDropdownRef.current &&
                !playlistDropdownRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        if (true) { // Always listen when mounted
            document.addEventListener('mousedown', handleClickOutside); // mousedown for faster feel than click
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // Focus input on dropdown open + calculate position for portal
    useEffect(() => {
        if (isDropdownOpen && nicheButtonRef.current) {
            const rect = nicheButtonRef.current.getBoundingClientRect();
            const DROPDOWN_WIDTH = 288; // w-72 = 18rem = 288px
            const GAP = 8;
            const PADDING = 16;

            // Horizontal: clamp to screen edges
            let left = rect.left;
            if (left + DROPDOWN_WIDTH > window.innerWidth - PADDING) {
                left = window.innerWidth - PADDING - DROPDOWN_WIDTH;
            }
            if (left < PADDING) {
                left = PADDING;
            }

            // Vertical: use unified direction from bar position
            const top = dropdownsOpenAbove ? rect.top - GAP : rect.bottom + GAP;

            setNicheDropdownPos({ left, top });
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isDropdownOpen, dropdownsOpenAbove]);

    // Focus playlist input + calculate position for portal
    useEffect(() => {
        if (isPlaylistDropdownOpen && playlistButtonRef.current) {
            const rect = playlistButtonRef.current.getBoundingClientRect();
            const DROPDOWN_WIDTH = 256; // w-64 = 16rem = 256px
            const GAP = 8;
            const PADDING = 16;

            // Horizontal: center on button, then clamp to screen edges  
            let left = rect.left + rect.width / 2 - DROPDOWN_WIDTH / 2;
            if (left + DROPDOWN_WIDTH > window.innerWidth - PADDING) {
                left = window.innerWidth - PADDING - DROPDOWN_WIDTH;
            }
            if (left < PADDING) {
                left = PADDING;
            }

            // Vertical: use unified direction from bar position
            const top = dropdownsOpenAbove ? rect.top - GAP : rect.bottom + GAP;

            setPlaylistDropdownPos({ left, top });
            setTimeout(() => playlistInputRef.current?.focus(), 50);
        }
    }, [isPlaylistDropdownOpen, dropdownsOpenAbove]);

    const handleAddToHome = async () => {
        if (!user || !currentChannel) return;
        setIsProcessing(true);
        try {
            // Convert TrendVideo to Video format if needed, or pass subset
            // Assuming TrendVideo matches compatible shape or we map it
            const videoData = {
                ...video,
                createdAt: Date.now(),
                isPlaylistOnly: false
            };
            // @ts-ignore - Assuming compatibility or ignoring minor mismatches for now
            await VideoService.addVideo(user.uid, currentChannel.id, videoData);
            // Close after success? Or show toast?
            onClose();
        } catch (error) {
            console.error("Failed to add to home", error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAddToPlaylist = async (playlistId: string) => {
        if (!user || !currentChannel) return;
        setIsProcessing(true);
        try {
            // Ensure video is in library first (hidden)
            const videoData = {
                ...video,
                createdAt: Date.now(),
                isPlaylistOnly: true
            };
            // @ts-ignore
            await VideoService.addVideo(user.uid, currentChannel.id, videoData);
            await PlaylistService.addVideoToPlaylist(user.uid, currentChannel.id, playlistId, video.id);
            setIsPlaylistDropdownOpen(false);
        } catch (error) {
            console.error("Failed to add to playlist", error);
            setIsProcessing(false); // Ensure processing state is reset on error
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCreatePlaylist = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPlaylistName.trim() && user && currentChannel) {
            setIsProcessing(true);
            try {
                const newId = await createPlaylist({ name: newPlaylistName, videoIds: [] });
                await handleAddToPlaylist(newId);
                setNewPlaylistName('');
            } catch (error) {
                console.error("Failed to create playlist", error);
                setIsProcessing(false);
            }
        }
    };

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
                channelId: isGlobal ? undefined : video.channelId
            };

            addNiche(newNiche);
            assignVideoToNiche(video.id, newNiche.id); // Auto-assign to newly created niche

            setNewNicheName('');
            setIsDropdownOpen(false);
        }
    };

    // Filter niches for suggestion
    const filteredNiches = niches.filter(n => {
        if (!newNicheName) return true;
        return n.name.toLowerCase().includes(newNicheName.toLowerCase());
    });

    // Positioning: coords are now used instead of raw position props
    const style: React.CSSProperties = {
        position: 'fixed',
        left: coords.x,
        top: coords.y, // Computed y includes offset
        // Removed translate(-50%) because we calculated 'left' manually
        zIndex: 1000,
    };

    return (
        <div
            ref={barRef}
            className="flex items-center gap-2 bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg rounded-full px-4 py-2 animate-scale-in"
            style={style}
        >
            <div className="flex items-center gap-3 pr-3 border-r border-white/10">
                <span className="text-sm font-medium text-white whitespace-nowrap max-w-[150px] truncate">
                    {video.title}
                </span>
                <button
                    onClick={onClose}
                    className="text-text-secondary hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Assign Niche Dropdown */}
            <div className="relative" ref={dropdownRef}>
                <button
                    ref={nicheButtonRef}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
                        ${assignedNiche ? 'bg-white/10 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}
                        ${isDropdownOpen ? 'ring-1 ring-white/30' : ''}
                    `}
                    style={{ backgroundColor: assignedNiche?.color ? `${assignedNiche.color}20` : undefined }}
                >
                    {assignedNiche ? (
                        <>
                            <>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: assignedNiche.color }} />
                                <span className="truncate max-w-[120px]">{assignedNiche.name}</span>
                            </>
                        </>
                    ) : (
                        <>
                            <FolderPlus size={16} />
                            Assign Niche
                        </>
                    )}
                    <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? '' : 'rotate-180'}`} />
                </button>

                {isDropdownOpen && createPortal(
                    <div
                        className="fixed w-72 bg-bg-secondary/90 backdrop-blur-md border border-border rounded-xl shadow-lg overflow-hidden flex flex-col animate-fade-in z-[9999] max-h-[280px]"
                        style={{
                            left: nicheDropdownPos.left,
                            top: nicheDropdownPos.top,
                            transform: dropdownsOpenAbove ? 'translateY(-100%)' : 'none'
                        }}
                    >

                        {/* Create New Header */}
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
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setIsGlobal(false)}
                                                className={`text-[10px] px-2 py-1 rounded transition-colors ${!isGlobal ? 'bg-white/20 text-white' : 'text-text-secondary hover:text-white'}`}
                                            >
                                                Local
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsGlobal(true)}
                                                className={`text-[10px] px-2 py-1 rounded transition-colors ${isGlobal ? 'bg-white/20 text-white' : 'text-text-secondary hover:text-white'}`}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <Globe size={10} />
                                                    Global
                                                </div>
                                            </button>
                                        </div>
                                        <button
                                            type="submit"
                                            className="text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            Create "{newNicheName}"
                                        </button>
                                    </div>
                                )}
                            </form>
                        </div>

                        {/* List */}
                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                            {filteredNiches.map(niche => (
                                <button
                                    key={niche.id}
                                    onClick={() => {
                                        if (assignedNicheId === niche.id) {
                                            // Handle unassignment or ignore
                                            // Maybe we want to unassign?
                                        } else {
                                            assignVideoToNiche(video.id, niche.id);
                                        }
                                        setIsDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors justify-between group"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: niche.color }} />
                                        <span className="truncate">{niche.name}</span>
                                        {niche.type === 'global' && <Globe size={10} className="text-text-tertiary" />}
                                    </div>
                                    {assignedNicheId === niche.id && <Check size={12} className="text-white flex-shrink-0" />}
                                </button>
                            ))}
                            {filteredNiches.length === 0 && !newNicheName && (
                                <div className="text-center py-3 text-xs text-text-tertiary">
                                    No niches found
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
            </div>

            {/* Quick Actions based on SuggestedTraffic */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-2 ml-1">
                <button
                    onClick={handleAddToHome}
                    disabled={isProcessing}
                    className={`p-1.5 rounded-full text-text-secondary hover:text-white hover:bg-white/10 transition-colors ${isProcessing ? 'opacity-50' : ''}`}
                    title="Add to Home"
                >
                    <Home size={16} className="flex-shrink-0" />
                </button>

                <div className="relative" ref={playlistDropdownRef}>
                    <button
                        ref={playlistButtonRef}
                        onClick={() => setIsPlaylistDropdownOpen(!isPlaylistDropdownOpen)}
                        disabled={isProcessing}
                        className={`p-1.5 rounded-full transition-colors ${isPlaylistDropdownOpen ? 'bg-white text-black' : 'text-text-secondary hover:text-white hover:bg-white/10'} ${isProcessing ? 'opacity-50' : ''}`}
                        title="Add to Playlist"
                    >
                        <ListVideo size={16} className="flex-shrink-0" />
                    </button>

                    {isPlaylistDropdownOpen && createPortal(
                        <div
                            className="fixed w-64 bg-bg-secondary/90 backdrop-blur-md border border-border rounded-xl shadow-lg overflow-hidden flex flex-col animate-fade-in z-[9999] max-h-[200px]"
                            style={{
                                left: playlistDropdownPos.left,
                                top: playlistDropdownPos.top,
                                transform: dropdownsOpenAbove ? 'translateY(-100%)' : 'none'
                            }}
                        >

                            {/* Create Playlist */}
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

                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                {playlists.map(playlist => (
                                    <button
                                        key={playlist.id}
                                        onClick={() => handleAddToPlaylist(playlist.id)}
                                        className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-white hover:bg-white/5 rounded-lg flex items-center gap-2 transition-colors"
                                    >
                                        <ListVideo size={14} />
                                        <span className="truncate">{playlist.name}</span>
                                    </button>
                                ))}
                                {playlists.length === 0 && (
                                    <div className="text-center py-3 text-xs text-text-tertiary">No playlists</div>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </div>

            {/* Remove Niche Action */}
            {assignedNicheId && (
                <button
                    onClick={() => removeVideoFromNiche(video.id)}
                    className="p-1.5 text-text-secondary hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors ml-1"
                    title="Remove from niche"
                >
                    <Trash2 size={14} />
                </button>
            )}

        </div>
    );
};

import React, { useState, useRef, useMemo } from 'react';
import { X, Check, Home, Trash2, RotateCcw } from 'lucide-react';
import type { TrendVideo } from '../../../core/types/trends';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useTrendStore } from '../../../core/stores/trendStore';
import { useVideos } from '../../../core/hooks/useVideos';
import { useUIStore } from '../../../core/stores/uiStore';
import { VideoService } from '../../../core/services/videoService';
import { useSmartPosition } from './hooks/useSmartPosition';
import { NicheSelector } from './components/NicheSelector';
import { PlaylistSelector } from './components/PlaylistSelector';
import { trendVideoToVideoDetails } from '../../../core/utils/videoAdapters';
import { ConfirmationModal } from '../../../components/Shared/ConfirmationModal';

interface TrendsFloatingBarProps {
    videos: TrendVideo[];
    position: { x: number; y: number };
    onClose: () => void;
    isDocked?: boolean;
    onActiveMenuChange?: (hasActiveMenu: boolean) => void;
}

export const TrendsFloatingBar: React.FC<TrendsFloatingBarProps> = ({
    videos,
    position,
    onClose,
    isDocked = false,
    onActiveMenuChange
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels, hideVideos, restoreVideos, trendsFilters } = useTrendStore();
    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    // State to coordinate which menu is open (mutually exclusive)
    const [activeMenu, setActiveMenu] = useState<'niche' | 'playlist' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Trash / Restore State
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    // Detect if we are in Trash Mode
    const isTrashMode = useMemo(() => {
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        const selectedNicheIds = (nicheFilter?.value as string[]) || [];
        return selectedNicheIds.includes('TRASH');
    }, [trendsFilters]);

    // Close menus when docking
    React.useEffect(() => {
        if (isDocked) {
            setActiveMenu(null);
        }
    }, [isDocked]);

    // Notify parent when activeMenu changes
    React.useEffect(() => {
        onActiveMenuChange?.(activeMenu !== null);
    }, [activeMenu, onActiveMenuChange]);

    const barRef = useRef<HTMLDivElement>(null);
    const isMultiSelect = videos.length > 1;
    const shouldDock = isMultiSelect || isDocked;

    // Handle clicks outside for single selection
    React.useEffect(() => {
        if (isConfirmOpen) return;

        const handleOutsideClick = () => {
            // Dropdown portals and the bar itself stop propagation of clicks,
            // so if this listener fires, it's truly outside.
            if (activeMenu) {
                setActiveMenu(null);
            } else if (!isMultiSelect) {
                onClose();
            }
        };

        document.addEventListener('click', handleOutsideClick);
        return () => {
            document.removeEventListener('click', handleOutsideClick);
        };
    }, [isMultiSelect, isConfirmOpen, activeMenu, onClose]);

    // Handle Keyboard Shortcuts
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isConfirmOpen) {
                    // Let confirmation modal handle its own Esc
                    return;
                }
                if (activeMenu) {
                    // First Esc: close the dropdown
                    e.stopPropagation();
                    setActiveMenu(null);
                } else {
                    // Second Esc: close floating bar (clear selection)
                    onClose();
                }
            } else if (e.key === 'Enter') {
                // Determine if we should handle Enter
                // 1. If confirm modal is open -> let it handle (it usually does)
                // 2. If dropdown is already open -> let it handle (e.g. form submission)
                // 3. If nothing open -> open niche selector
                if (isConfirmOpen) return;

                if (activeMenu) {
                    // Dropdowns might need Enter for their own logic (creating niche, etc.)
                    // so we don't interfere here.
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                setActiveMenu('niche');
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeMenu, isConfirmOpen, onClose]);

    // Smart Positioning Hook (only used for single selection or anchor)
    // We still run it to have coords ready for when we undock
    const { coords } = useSmartPosition({
        targetPos: position, // Should be the anchor position (click point)
        elementRef: barRef,
        width: 300,
        offsetY: 60
    });

    // Unified Dropdown Direction
    // For docked (bottom fixed), always open above
    // For floating (single), depend on position
    const dropdownsOpenAbove = shouldDock ? true : coords.y > window.innerHeight / 2;

    // Check if ALL videos are already in home
    const areAllAddedToHome = useMemo(() => {
        return videos.every(v => homeVideos.some(hv => hv.id === v.id && !hv.isPlaylistOnly));
    }, [homeVideos, videos]);

    const getChannelAvatar = (channelId: string) => {
        return channels.find(c => c.id === channelId)?.avatarUrl || '';
    };

    const handleQuickAction = async (action: () => Promise<void>) => {
        setIsProcessing(true);
        try {
            await action();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleHomeToggle = async () => {
        if (!user || !currentChannel) return;

        await handleQuickAction(async () => {
            // Logic: If ANY are missing from home, add those missing.
            // If ALL are in home, remove ALL.
            const shouldAdd = !areAllAddedToHome;

            if (shouldAdd) {
                await Promise.all(videos.map(async (video) => {
                    const isAdded = homeVideos.some(v => v.id === video.id && !v.isPlaylistOnly);
                    if (!isAdded) {
                        const videoDetails = trendVideoToVideoDetails(video, getChannelAvatar(video.channelId));
                        await VideoService.addVideo(user.uid, currentChannel!.id, {
                            ...videoDetails,
                            isPlaylistOnly: false,
                            createdAt: Date.now(),
                            addedToHomeAt: Date.now()
                        });
                    }
                }));
                showToast(isMultiSelect ? `${videos.length} videos added to Home` : 'Added to Home', 'success');
            } else {
                await Promise.all(videos.map(async (video) => {
                    await VideoService.deleteVideo(user.uid, currentChannel!.id, video.id);
                }));
                showToast(isMultiSelect ? `${videos.length} videos removed from Home` : 'Removed from Home', 'success');
            }
        });
    };

    const handleTrashAction = () => {
        if (isTrashMode) {
            // Restore
            restoreVideos(videos.map(v => v.id));
            showToast(isMultiSelect ? 'Videos restored' : 'Video restored', 'success');
        } else {
            // Hide
            const videosToHide = videos.map(v => ({
                id: v.id,
                channelId: v.channelId
            }));
            hideVideos(videosToHide);
            showToast(isMultiSelect ? 'Videos moved to Untracked' : 'Video moved to Untracked', 'success');
        }
        setIsConfirmOpen(false);
        onClose(); // Close bar after action
    };

    // Style for fixed positioning vs smart positioning
    // We use transition-all to smooth the jump if possible.
    // Note: switching between left/top and left/bottom might be jerky without calc.
    // But fixed bottom is robust for UI.
    const style: React.CSSProperties = shouldDock
        ? {
            left: '50%',
            bottom: '40px',
            transform: 'translateX(-50%)',
            position: 'absolute'
        }
        : {
            left: coords.x,
            top: coords.y,
            position: 'fixed'
        };

    const title = isMultiSelect ? `${videos.length} selected` : videos[0]?.title;

    return (
        <div
            ref={barRef}
            className="flex items-center gap-2 bg-bg-secondary/90 backdrop-blur-md border border-border shadow-lg rounded-full px-4 py-2 z-[1000]"
            style={style}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-3 pr-3 border-r border-white/10">
                <span className="text-sm font-medium text-white whitespace-nowrap max-w-[150px] truncate">
                    {title}
                </span>
                <button
                    onClick={onClose}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="text-text-secondary hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Niche Dropdown (Disable in Trash Mode?) -> Maybe user wants to assign niche before restoring? Let's keep enabled */}
            <NicheSelector
                videos={videos}
                isOpen={activeMenu === 'niche'}
                openAbove={dropdownsOpenAbove}
                onToggle={() => setActiveMenu(activeMenu === 'niche' ? null : 'niche')}
                onClose={() => setActiveMenu(null)}
                onSelectionClear={onClose}
            />

            {/* Actions */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-2 ml-1">
                {/* Home Button with Premium Badge */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleHomeToggle}
                    disabled={isProcessing}
                    className={`relative p-1.5 rounded-full transition-all ${areAllAddedToHome
                        ? 'text-white hover:bg-red-500/20 hover:text-red-300'
                        : 'text-text-secondary hover:text-white hover:bg-white/10'
                        } ${isProcessing ? 'opacity-50' : ''}`}
                    title={areAllAddedToHome ? 'Remove from Home' : 'Add to Home'}
                >
                    <Home size={16} />
                    {/* Checkmark Badge */}
                    {areAllAddedToHome && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                            <Check size={8} className="text-white" strokeWidth={3} />
                        </div>
                    )}
                </button>

                <PlaylistSelector
                    videos={videos}
                    isOpen={activeMenu === 'playlist'}
                    openAbove={dropdownsOpenAbove}
                    onToggle={() => setActiveMenu(activeMenu === 'playlist' ? null : 'playlist')}
                />

                {/* Trash / Restore Button */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setIsConfirmOpen(true)}
                    className="p-1.5 rounded-full transition-all text-text-secondary hover:text-white hover:bg-white/10 ml-1"
                    title={isTrashMode ? 'Restore to timeline' : 'Move to Untracked'}
                >
                    {isTrashMode ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                </button>
            </div>

            <ConfirmationModal
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={handleTrashAction}
                title={isTrashMode ? 'Restore Videos' : 'Hide Videos'}
                message={isTrashMode
                    ? `Restore ${videos.length} video${videos.length > 1 ? 's' : ''} to the timeline?`
                    : `Move ${videos.length} video${videos.length > 1 ? 's' : ''} to Untracked? They will be hidden from the timeline.`
                }
                confirmLabel={isTrashMode ? 'Restore' : 'Hide'}
            />
        </div>
    );
};

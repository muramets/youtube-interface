import React, { useState, useMemo } from 'react';
import { Check, Home, Trash2, RotateCcw, Download, Image as ImageIcon } from 'lucide-react';
import { downloadImagesAsZip } from '../../../core/utils/zipUtils';
import type { TrendVideo } from '../../../core/types/trends';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useTrendStore } from '../../../core/stores/trendStore';
import { useVideos } from '../../../core/hooks/useVideos';
import { useUIStore } from '../../../core/stores/uiStore';
import { VideoService } from '../../../core/services/videoService';
// import { useSmartPosition } from './hooks/useSmartPosition'; // REMOVED
import { NicheSelector } from './components/NicheSelector';
import { PlaylistSelector } from './components/PlaylistSelector';
import { trendVideoToVideoDetails } from '../../../core/utils/videoAdapters';
import { ConfirmationModal } from '../../../components/ui/organisms/ConfirmationModal';
import { FloatingBar } from '@/components/ui/organisms/FloatingBar';
import { exportTrendsVideoCsv, downloadCsv, generateTrendsExportFilename } from '../utils/exportTrendsVideoCsv';

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
    const { channels, niches, videoNicheAssignments, hideVideos, restoreVideos, trendsFilters } = useTrendStore();
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

    // Image Download State
    const [showImageDownload, setShowImageDownload] = useState(false);
    const imageDownloadTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Handle CSV Export
    const handleExport = () => {
        // Determine channel name for metadata (use first video's channel or current channel)
        const channelName = videos[0]?.channelTitle || currentChannel?.name || 'trends';

        const csvContent = exportTrendsVideoCsv({
            videos,
            niches,
            videoNicheAssignments,
            channelName
        });

        const filename = generateTrendsExportFilename(videos.length, channelName);
        downloadCsv(csvContent, filename);

        showToast(
            isMultiSelect ? `${videos.length} videos exported` : 'Video exported',
            'success'
        );
    };

    const handleExportImages = async (e: React.MouseEvent) => {
        e.stopPropagation();

        // Prepare images
        const images = videos.map(v => ({
            id: v.id,
            url: v.thumbnail
        })).filter(img => img.url); // Ensure URL exists

        if (images.length === 0) {
            showToast('No covers found to download', 'error');
            return;
        }

        const channelName = videos[0]?.channelTitle || currentChannel?.name || 'trends';
        const zipFilename = `${generateTrendsExportFilename(videos.length, channelName).replace('.csv', '')}_covers.zip`;

        try {
            await downloadImagesAsZip(images, zipFilename);
            showToast('Covers downloaded', 'success');
        } catch (error) {
            console.error('Failed to download images:', error);
            showToast('Failed to download covers', 'error');
        }
    };

    const title = isMultiSelect ? `${videos.length} selected` : videos[0]?.title;

    return (
        <>
            <FloatingBar
                title={title}
                position={position}
                onClose={onClose}
                isDocked={shouldDock}
            >
                {({ openAbove }) => (
                    <>
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

                        <NicheSelector
                            videos={videos}
                            isOpen={activeMenu === 'niche'}
                            openAbove={openAbove}
                            onToggle={() => setActiveMenu(activeMenu === 'niche' ? null : 'niche')}
                            onClose={() => setActiveMenu(null)}
                            onSelectionClear={onClose}
                        />

                        <PlaylistSelector
                            videos={videos}
                            isOpen={activeMenu === 'playlist'}
                            openAbove={openAbove}
                            onToggle={() => setActiveMenu(activeMenu === 'playlist' ? null : 'playlist')}
                        />

                        {/* Export CSV & Images (Two-State Button) */}
                        <div className="relative group">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    if (showImageDownload) {
                                        handleExportImages(e);
                                        // Optional: keep it open or close it? 
                                        // "Click on second state - download ... covers". Usually implies action completes.
                                        // Let's close it to reset.
                                        setShowImageDownload(false);
                                        if (imageDownloadTimerRef.current) clearTimeout(imageDownloadTimerRef.current);
                                    } else {
                                        handleExport();
                                        setShowImageDownload(true);
                                        if (imageDownloadTimerRef.current) clearTimeout(imageDownloadTimerRef.current);
                                        imageDownloadTimerRef.current = setTimeout(() => setShowImageDownload(false), 5000);
                                    }
                                }}
                                className={`
                                    relative flex items-center justify-center w-[34px] h-[34px] rounded-full transition-all duration-300 ease-out
                                    ${showImageDownload
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 scale-105'
                                        : 'text-text-secondary hover:text-white hover:bg-white/10'
                                    }
                                `}
                                title={showImageDownload ? "Download Covers (ZIP)" : "Export to CSV"}
                            >
                                {/* Icons Container - Smooth Transition Switch */}
                                <div className="relative w-4 h-4 flex items-center justify-center">
                                    <Download
                                        size={16}
                                        className={`absolute transition-all duration-300 transform
                                            ${showImageDownload
                                                ? 'opacity-0 scale-75 rotate-12'
                                                : 'opacity-100 scale-100 rotate-0'
                                            }
                                        `}
                                    />

                                    <ImageIcon
                                        size={16}
                                        strokeWidth={2.5}
                                        className={`absolute transition-all duration-300 transform
                                            ${showImageDownload
                                                ? 'opacity-100 scale-100 rotate-0 text-white'
                                                : 'opacity-0 scale-75 -rotate-12'
                                            }
                                        `}
                                    />
                                </div>
                            </button>
                        </div>

                        <div className="w-px h-4 bg-white/10 mx-1" />

                        {/* Trash / Restore Button */}
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => setIsConfirmOpen(true)}
                            className="p-1.5 rounded-full transition-all text-text-secondary hover:text-white hover:bg-white/10"
                            title={isTrashMode ? 'Restore to timeline' : 'Move to Untracked'}
                        >
                            {isTrashMode ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                        </button>
                    </>
                )}
            </FloatingBar>

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
        </>
    );
};

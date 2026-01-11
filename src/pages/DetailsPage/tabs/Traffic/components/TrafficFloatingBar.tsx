import React, { useState, useMemo } from 'react';
import { Check, Home, FolderPlus, ChevronDown } from 'lucide-react';
import type { TrafficSource } from '@/core/types/traffic';
import { useAuth } from '@/core/hooks/useAuth';
import { useChannelStore } from '@/core/stores/channelStore';
import { useVideos } from '@/core/hooks/useVideos';
import { useUIStore } from '@/core/stores/uiStore';
import { VideoService } from '@/core/services/videoService';
import { TrafficNicheSelector } from './Niches/TrafficNicheSelector';
import { TrafficPlaylistSelector } from './TrafficPlaylistSelector';
import { FloatingBar } from '@/components/Shared/FloatingBar';

interface TrafficFloatingBarProps {
    videos: TrafficSource[];
    position: { x: number; y: number };
    onClose: () => void;
    isDocked?: boolean;
    dockingStrategy?: 'absolute' | 'fixed' | 'sticky';
}

export const TrafficFloatingBar: React.FC<TrafficFloatingBarProps> = ({
    videos,
    position,
    onClose,
    isDocked = false,
    dockingStrategy = 'sticky'
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    // State
    const [activeMenu, setActiveMenu] = useState<'niche' | 'playlist' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const isMultiSelect = videos.length > 1;
    const shouldDock = isMultiSelect || isDocked;

    // Handle clicks outside
    React.useEffect(() => {
        const handleOutsideClick = () => {
            // If the click reaches document, it's outside.
            if (activeMenu) {
                setActiveMenu(null);
            } else if (!isMultiSelect) {
                onClose();
            }
        };

        // Use a small timeout to avoid catching the click that mounted this component
        const timerId = setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 0);

        return () => {
            clearTimeout(timerId);
            document.removeEventListener('click', handleOutsideClick);
        };
    }, [activeMenu, isMultiSelect, onClose]);

    // Keyboard
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeMenu) {
                    e.stopPropagation();
                    setActiveMenu(null);
                } else {
                    onClose();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [activeMenu, onClose]);

    // Smart Positioning Logic moved to FloatingBar
    // "Add to Home" Logic
    const areAllAddedToHome = useMemo(() => {
        // Only videos with valid IDs can be checked
        return videos
            .filter(v => v.videoId)
            .every(v => homeVideos.some(hv => hv.id === v.videoId && !hv.isPlaylistOnly));
    }, [homeVideos, videos]);

    const handleHomeToggle = async () => {
        if (!user || !currentChannel) return;

        setIsProcessing(true);
        try {
            const validVideos = videos.filter(v => v.videoId);
            if (validVideos.length === 0) return;

            const shouldAdd = !areAllAddedToHome;

            if (shouldAdd) {
                // Add missing ones
                let addedCount = 0;
                await Promise.all(validVideos.map(async (v) => {
                    if (!v.videoId) return;
                    const isAdded = homeVideos.some(hv => hv.id === v.videoId && !hv.isPlaylistOnly);

                    if (!isAdded) {
                        // Construct Video Data from TrafficSource
                        const videoPayload = {
                            id: v.videoId,
                            title: v.sourceTitle,
                            thumbnail: v.thumbnail || '',
                            channelId: '', // Not available in TrafficSource
                            channelTitle: v.channelTitle || '',
                            channelAvatar: '', // Not available in TrafficSource
                            viewCount: v.views.toString(),
                            publishedAt: v.publishedAt || new Date().toISOString(),

                            isPlaylistOnly: false,
                            createdAt: Date.now(),
                            addedToHomeAt: Date.now()
                        };

                        await VideoService.addVideo(user.uid, currentChannel!.id, videoPayload);
                        addedCount++;
                    }
                }));
                showToast(isMultiSelect ? `${addedCount} videos added to Home` : 'Added to Home', 'success');
            } else {
                // Remove all
                await Promise.all(validVideos.map(async (v) => {
                    if (v.videoId) {
                        await VideoService.deleteVideo(user.uid, currentChannel!.id, v.videoId);
                    }
                }));
                showToast(isMultiSelect ? 'Removed from Home' : 'Removed from Home', 'success');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to update Home', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const title = isMultiSelect ? `${videos.length} selected` : (videos[0]?.sourceTitle || 'Selected Video');

    return (
        <FloatingBar
            title={title}
            position={position}
            onClose={onClose}
            isDocked={isDocked || shouldDock}
            dockingStrategy={dockingStrategy}
        >
            {({ openAbove }) => (
                <>
                    {/* Home Button with Premium Badge */}
                    <button
                        onClick={handleHomeToggle}
                        disabled={isProcessing}
                        className={`relative p-1.5 rounded-full transition-all ${areAllAddedToHome
                            ? 'text-white hover:bg-red-500/20 hover:text-red-300'
                            : 'text-text-secondary hover:text-white hover:bg-white/10'
                            } ${isProcessing ? 'opacity-50' : ''}`}
                        title={areAllAddedToHome ? 'Remove from Home' : 'Add to Home'}
                    >
                        <Home size={16} />
                        {areAllAddedToHome && (
                            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                                <Check size={8} className="text-white" strokeWidth={3} />
                            </div>
                        )}
                    </button>

                    {/* Niche Selector Container */}
                    <div className="relative">
                        <button
                            onClick={() => setActiveMenu(activeMenu === 'niche' ? null : 'niche')}
                            className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap
                                ${activeMenu === 'niche' ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white hover:bg-white/5'}
                            `}
                        >
                            <FolderPlus size={16} />
                            <span>{isMultiSelect ? 'Assign Niches' : 'Assign Niche'}</span>
                            <ChevronDown size={12} className={`transition-transform duration-200 ${activeMenu === 'niche' ? 'rotate-180' : ''}`} />
                        </button>

                        <TrafficNicheSelector
                            videoIds={videos.map(v => v.videoId!).filter(Boolean)}
                            isOpen={activeMenu === 'niche'}
                            openAbove={openAbove}
                            onToggle={() => setActiveMenu(activeMenu === 'niche' ? null : 'niche')}
                            onClose={() => setActiveMenu(null)}
                            onSelectionClear={onClose}
                        />
                    </div>

                    <TrafficPlaylistSelector
                        videos={videos}
                        isOpen={activeMenu === 'playlist'}
                        openAbove={openAbove}
                        onToggle={() => setActiveMenu(activeMenu === 'playlist' ? null : 'playlist')}
                    />
                </>
            )}
        </FloatingBar>
    );
};

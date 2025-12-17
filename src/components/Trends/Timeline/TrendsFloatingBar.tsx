import React, { useState, useRef, useMemo } from 'react';
import { X, Check, Home } from 'lucide-react';
import type { TrendVideo } from '../../../types/trends';
import { useAuth } from '../../../hooks/useAuth';
import { useChannelStore } from '../../../stores/channelStore';
import { useTrendStore } from '../../../stores/trendStore';
import { useVideos } from '../../../hooks/useVideos';
import { useUIStore } from '../../../stores/uiStore';
import { VideoService } from '../../../services/videoService';
import { useSmartPosition } from './hooks/useSmartPosition';
import { NicheSelector } from './components/NicheSelector';
import { PlaylistSelector } from './components/PlaylistSelector';
import { trendVideoToVideoDetails } from '../../../utils/videoAdapters';

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
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels } = useTrendStore();
    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();

    // State to coordinate which menu is open (mutually exclusive)
    const [activeMenu, setActiveMenu] = useState<'niche' | 'playlist' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const barRef = useRef<HTMLDivElement>(null);

    // Smart Positioning Hook
    const { coords } = useSmartPosition({
        targetPos: position,
        elementRef: barRef,
        width: 300,
        offsetY: 60
    });

    // Unified Dropdown Direction
    const dropdownsOpenAbove = coords.y > window.innerHeight / 2;

    // Check if video is already in home
    const isAddedToHome = useMemo(() => {
        return homeVideos.some(v => v.id === video.id && !v.isPlaylistOnly);
    }, [homeVideos, video.id]);

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
            if (isAddedToHome) {
                await VideoService.deleteVideo(user.uid, currentChannel.id, video.id);
                showToast('Removed from Home', 'success');
            } else {
                const videoDetails = trendVideoToVideoDetails(video, getChannelAvatar(video.channelId));
                await VideoService.addVideo(user.uid, currentChannel.id, {
                    ...videoDetails,
                    isPlaylistOnly: false,
                    createdAt: Date.now()
                });
                showToast('Added to Home', 'success');
            }
        });
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
            <NicheSelector
                video={video}
                isOpen={activeMenu === 'niche'}
                openAbove={dropdownsOpenAbove}
                onToggle={() => setActiveMenu(activeMenu === 'niche' ? null : 'niche')}
                onClose={() => setActiveMenu(null)}
            />

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

                <PlaylistSelector
                    video={video}
                    isOpen={activeMenu === 'playlist'}
                    openAbove={dropdownsOpenAbove}
                    onToggle={() => setActiveMenu(activeMenu === 'playlist' ? null : 'playlist')}
                />
            </div>
        </div>
    );
};

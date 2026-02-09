import React, { useState } from 'react';
import { MoreVertical, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVideos } from '../../core/hooks/useVideos';
import { useVideoSync } from '../../core/hooks/useVideoSync';

import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import type { VideoDetails } from '../../core/utils/youtubeApi';
import { formatViewCount, formatDuration } from '../../core/utils/formatUtils';
import { VideoCardMenu } from '../Video/VideoCardMenu';
import { AddToPlaylistModal } from '../Playlists/modals/AddToPlaylistModal';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { AddCustomVideoModal } from '../Video/Modals/AddCustomVideo/AddCustomVideoModal';
import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { ClonedVideoTooltipContent } from '../Video/ClonedVideoTooltipContent';
import { useSettings } from '../../core/hooks/useSettings';
import { useUIStore } from '../../core/stores/uiStore';
import { Toast } from '../../components/ui/molecules/Toast';

interface RecommendationCardProps {
    video: VideoDetails;
    playlistId?: string;
    onMenuOpenChange?: (isOpen: boolean) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({ video, playlistId, onMenuOpenChange }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { removeVideo, updateVideo, cloneVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { syncVideo } = useVideoSync(user?.uid || '', currentChannel?.id || '');
    const { removeVideosFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const { generalSettings, cloneSettings } = useSettings();
    const apiKey = generalSettings.apiKey;
    const { setSettingsOpen } = useUIStore();

    const [showMenu, setShowMenu] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);
    const [confirmation, setConfirmation] = useState<{
        isOpen: boolean;
        action: 'removeFromPlaylist' | 'deleteCustom' | 'removeVideo' | null;
        title: string;
        message: string;
    }>({ isOpen: false, action: null, title: '', message: '' });
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const [isSyncing, setIsSyncing] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const [viewMode, setViewMode] = useState<'custom' | 'youtube'>('custom');
    const [isFlipping, setIsFlipping] = useState(false);

    // Determine which video data to display
    const displayVideo = viewMode === 'youtube' && video.mergedVideoData ? video.mergedVideoData : video;

    // Timer for cloned videos
    React.useEffect(() => {
        if (video.isCloned && video.expiresAt) {
            const updateTimer = () => {
                const now = Date.now();
                const remaining = Math.max(0, Math.ceil((video.expiresAt! - now) / 1000));
                setTimeLeft(remaining);
            };

            updateTimer();
            const interval = setInterval(updateTimer, 1000);
            return () => clearInterval(interval);
        }
    }, [video.isCloned, video.expiresAt]);

    const handleSync = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isSyncing || !user || !currentChannel) return;

        if (!apiKey) {
            setShowToast(true);
            return;
        }
        setIsSyncing(true);
        await syncVideo(video.id, apiKey);
        setIsSyncing(false);
    };

    const handleSwitchView = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleCloseMenu();

        if (!video.mergedVideoData && !video.publishedVideoId) return;

        setIsFlipping(true);
        setTimeout(() => {
            setViewMode(prev => prev === 'custom' ? 'youtube' : 'custom');
            setIsFlipping(false);
        }, 150); // Wait for half animation
    };

    const formatTimeLeft = (seconds: number) => {
        if (seconds >= 3600) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            return `${h}:${m.toString().padStart(2, '0')}`;
        }
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleVideoClick = () => {
        if (playlistId) {
            navigate(`/watch/${video.id}?list=${playlistId}`);
        } else {
            navigate(`/watch/${video.id}`);
        }
    };

    const handleMenuClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setAnchorEl(e.currentTarget);
        const newState = !showMenu;
        setShowMenu(newState);
        onMenuOpenChange?.(newState);
    };

    const handleCloseMenu = () => {
        setShowMenu(false);
        setAnchorEl(null);
        onMenuOpenChange?.(false);
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleCloseMenu();

        if (playlistId) {
            setConfirmation({
                isOpen: true,
                action: 'removeFromPlaylist',
                title: 'Remove from Playlist',
                message: 'Are you sure you want to remove this video from the playlist?'
            });
        } else {
            // Fallback if no playlistId, though this path is mainly for the "Remove from playlist" button
            // which only shows if playlistId is present.
            // If called from "Delete" button when no playlistId, it goes here.
            handleDelete(e);
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleCloseMenu();

        if (video.isCustom) {
            setConfirmation({
                isOpen: true,
                action: 'deleteCustom',
                title: 'Delete Custom Video',
                message: 'Are you sure you want to delete this custom video? This action cannot be undone.'
            });
        } else {
            setConfirmation({
                isOpen: true,
                action: 'removeVideo',
                title: 'Remove Video',
                message: 'Are you sure you want to remove this video?'
            });
        }
    };

    const handleConfirm = () => {
        if (!user || !currentChannel) return;

        if (confirmation.action === 'removeFromPlaylist' && playlistId) {
            removeVideosFromPlaylist({ playlistId, videoIds: [video.id] });
        } else if (confirmation.action === 'deleteCustom' || confirmation.action === 'removeVideo') {
            removeVideo(video.id);
        }
        setConfirmation({ ...confirmation, isOpen: false });
    };

    const handleAddToPlaylist = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowPlaylistModal(true);
        handleCloseMenu();
    };

    const handleUpdate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        handleCloseMenu();
        if (video.isCustom) {
            setShowEditModal(true);
        } else {
            if (user && currentChannel) {
                // For non-custom videos, updateVideo usually fetches details. 
                // We need to pass apiKey if we want to fetch, but here we might just be triggering a refresh?
                // The original code was `updateVideo(video.id)`.
                // In context, `updateVideo` likely fetched details.
                // In store, `updateVideo` needs (userId, channelId, videoId, updates, apiKey).
                // If we want to refresh, we should probably use `syncVideo` or pass apiKey.
                // However, `updateVideo` in store with just videoId and apiKey fetches details.
                // We need apiKey from settings.
                // Let's import useSettingsStore too.
            }
        }
    };

    return (
        <>
            <div
                className={`flex gap-2 cursor-pointer group p-2 rounded-lg relative transition-all duration-150 ease-in-out`}
                style={{
                    transform: isFlipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
                    transformStyle: 'preserve-3d'
                }}
                onClick={handleVideoClick}
            >
                {/* Hover Substrate */}
                <div className={`absolute inset-0 rounded-lg transition-opacity duration-200 pointer-events-none ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${viewMode === 'youtube' ? 'bg-[#FF0033]/10 dark:bg-[#FF0033]/20 border-2 border-[#FF0033]/30' : (video.isCloned ? 'bg-indigo-500/10 dark:bg-indigo-500/20 border-2 border-indigo-500/30' : (video.isCustom ? (video.publishedVideoId ? 'bg-green-500/10 dark:bg-green-500/20 border-2 border-green-500/30' : 'bg-orange-500/10 dark:bg-orange-500/20 border-2 border-orange-500/30') : 'bg-bg-secondary'))} `} />
                {/* Thumbnail Container */}
                <div className="relative w-[168px] h-[94px] flex-shrink-0 bg-bg-secondary rounded-lg overflow-hidden">
                    <img
                        src={displayVideo.isCustom ? (displayVideo.customImage || displayVideo.thumbnail) : displayVideo.thumbnail}
                        alt={displayVideo.title}
                        className="w-full h-full object-cover"
                    />

                    {/* Cloned Timer Overlay */}
                    {video.isCloned && (
                        <div className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <div className="relative w-8 h-8 flex items-center justify-center">
                                {/* SVG Circle for Timer */}
                                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 36 36">
                                    <path
                                        className="text-black/50"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="text-white drop-shadow-md transition-all duration-1000 ease-linear"
                                        strokeDasharray={`${(timeLeft / (video.expiresAt ? (video.expiresAt - video.createdAt!) / 1000 : 60)) * 100}, 100`}
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                </svg>
                                <span className="text-[8px] font-bold text-white drop-shadow-md">
                                    {formatTimeLeft(timeLeft)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Cloned/Custom Info Icon (Top Right) */}
                    {(video.isCloned || (video.isCustom && video.customImageVersion && ((video.historyCount && video.historyCount > 0) || (video.coverHistory && video.coverHistory.length > 0)))) && (
                        <div className={`absolute top-2 right-2 z-10 transition-opacity duration-200 ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <PortalTooltip
                                content={
                                    <ClonedVideoTooltipContent
                                        version={video.customImageVersion || 1}
                                        filename={video.customImageName || 'Unknown Filename'}
                                    />
                                }
                                align="right"
                                onOpenChange={setIsTooltipOpen}
                            >
                                <div className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm border-none cursor-help">
                                    <Info size={16} />
                                </div>
                            </PortalTooltip>
                        </div>
                    )}

                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded font-medium">
                        {formatDuration(displayVideo.duration)}
                    </div>
                </div>

                {/* Info Container */}
                <div className="flex flex-col gap-1 min-w-0 flex-1 pr-6 relative">
                    <h3 className="m-0 text-sm font-semibold text-text-primary line-clamp-2 leading-snug">
                        {displayVideo.title}
                    </h3>
                    <div className="text-xs text-text-secondary flex flex-col">
                        <div className="hover:text-text-primary transition-colors">{displayVideo.channelTitle}</div>
                        <div>
                            {displayVideo.viewCount ? `${formatViewCount(displayVideo.viewCount)} views` : ''} • {new Date(displayVideo.publishedAt).toLocaleDateString()}
                        </div>
                    </div>

                    {/* Menu Button or Remove Action for Clones */}
                    <div className="absolute top-0 right-0">
                        {video.isCloned ? (
                            <button
                                className="bg-transparent border-none p-1.5 rounded-full cursor-pointer text-text-primary opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 focus:opacity-100 transition-all duration-75 ease-out hover:bg-red-500/10 hover:text-red-500"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemove(e);
                                }}
                                title="Remove temporary video"
                            >
                                <MoreVertical size={20} />
                            </button>
                        ) : (
                            <>
                                <button
                                    className="p-1.5 rounded-full cursor-pointer text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-hover-bg"
                                    onClick={handleMenuClick}
                                >
                                    <MoreVertical size={20} />
                                </button>

                                <VideoCardMenu
                                    isOpen={showMenu}
                                    onClose={handleCloseMenu}
                                    anchorEl={anchorEl}
                                    playlistId={playlistId}
                                    onAddToPlaylist={handleAddToPlaylist}
                                    onDetails={handleUpdate}
                                    onRemove={handleRemove}
                                    onDelete={handleDelete}
                                    onSync={(!video.isCustom || video.publishedVideoId) ? handleSync : undefined}
                                    isSyncing={isSyncing}
                                    onSwitchView={video.publishedVideoId ? handleSwitchView : undefined}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {showEditModal && video.isCustom && (
                <AddCustomVideoModal
                    isOpen={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    onSave={async (updatedVideo) => {
                        if (user && currentChannel) {
                            await updateVideo({
                                videoId: video.id,
                                updates: updatedVideo,
                                expectedRevision: video.packagingRevision
                            });
                        }
                        setShowEditModal(false);
                    }}
                    onClone={async (originalVideo, version) => {
                        const duration = cloneSettings?.cloneDurationSeconds;
                        console.warn('DEBUG RecCard: Cloning video with duration:', duration);
                        await cloneVideo({
                            originalVideo,
                            coverVersion: version,
                            cloneDurationSeconds: duration || 3600
                        });
                    }}
                    initialData={video}
                />
            )}

            {showPlaylistModal && (
                <AddToPlaylistModal
                    onClose={() => setShowPlaylistModal(false)}
                    videoIds={[video.id]}
                />
            )}

            <ConfirmationModal
                isOpen={confirmation.isOpen}
                onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
                onConfirm={handleConfirm}
                title={confirmation.title}
                message={confirmation.message}
                confirmLabel={confirmation.action === 'removeFromPlaylist' ? 'Remove' : 'Delete'}
            />
            <Toast
                message="API Key is missing. Click to configure."
                isVisible={showToast}
                onClose={() => setShowToast(false)}
                type="error"
                onClick={() => {
                    setSettingsOpen(true);
                    setShowToast(false);
                }}
            />
        </>
    );
};

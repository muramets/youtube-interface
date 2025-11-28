
import React, { useState, useRef } from 'react';
import { MoreVertical, Info, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import type { VideoDetails } from '../../utils/youtubeApi';
import { formatViewCount, formatDuration } from '../../utils/formatUtils';
import { VideoCardMenu } from '../Video/VideoCardMenu';
import { AddToPlaylistModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { CustomVideoModal } from '../Video/CustomVideoModal';
import { PortalTooltip } from '../Shared/PortalTooltip';
import { ClonedVideoTooltipContent } from '../Video/ClonedVideoTooltipContent';

interface RecommendationCardProps {
    video: VideoDetails;
    playlistId?: string;
    onMenuOpenChange?: (isOpen: boolean) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({ video, playlistId, onMenuOpenChange }) => {
    const navigate = useNavigate();
    const { removeVideo, updateVideo, removeVideoFromPlaylist } = useVideo();
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

    const formatTimeLeft = (seconds: number) => {
        if (seconds >= 3600) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} `;
        }
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')} `;
    };

    const menuButtonRef = useRef<HTMLButtonElement>(null);

    const handleVideoClick = () => {
        if (playlistId) {
            navigate(`/watch/${video.id}?list=${playlistId}`);
        } else {
            navigate(`/watch/${video.id}`);
        }
    };

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        const newState = !showMenu;
        setShowMenu(newState);
        onMenuOpenChange?.(newState);
    };

    const handleCloseMenu = () => {
        setShowMenu(false);
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
        if (confirmation.action === 'removeFromPlaylist' && playlistId) {
            removeVideoFromPlaylist(playlistId, video.id);
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
            await updateVideo(video.id);
        }
    };

    return (
        <>
            <div
                className="flex gap-2 cursor-pointer group p-2 rounded-lg relative"
                onClick={handleVideoClick}
            >
                {/* Hover Substrate */}
                <div className={`absolute inset-0 rounded-lg transition-opacity duration-200 pointer-events-none ${isTooltipOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${video.isCloned ? 'bg-indigo-500/10 dark:bg-indigo-500/20 border-2 border-indigo-500/30' : (video.isCustom ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-2 border-emerald-500/30' : 'bg-bg-secondary')} `} />
                {/* Thumbnail Container */}
                <div className="relative w-[168px] h-[94px] flex-shrink-0 bg-bg-secondary rounded-lg overflow-hidden">
                    <img
                        src={video.isCustom ? (video.customImage || video.thumbnail) : video.thumbnail}
                        alt={video.title}
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
                    {(video.isCloned || (video.isCustom && video.customImageVersion && ((video.historyCount && video.historyCount > 1) || (video.coverHistory && video.coverHistory.length > 1)))) && (
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
                        {formatDuration(video.duration)}
                    </div>
                </div>

                {/* Info Container */}
                <div className="flex flex-col gap-1 min-w-0 flex-1 pr-6 relative">
                    <h3 className="m-0 text-sm font-semibold text-text-primary line-clamp-2 leading-snug">
                        {video.title}
                    </h3>
                    <div className="text-xs text-text-secondary flex flex-col">
                        <div className="hover:text-text-primary transition-colors">{video.channelTitle}</div>
                        <div>
                            {video.viewCount ? `${formatViewCount(video.viewCount)} views` : ''} • {new Date(video.publishedAt).toLocaleDateString()}
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
                                <Trash2 size={20} />
                            </button>
                        ) : (
                            <>
                                <button
                                    ref={menuButtonRef}
                                    className="p-1.5 rounded-full cursor-pointer text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-hover-bg"
                                    onClick={handleMenuClick}
                                >
                                    <MoreVertical size={20} />
                                </button>

                                <VideoCardMenu
                                    isOpen={showMenu}
                                    onClose={handleCloseMenu}
                                    anchorEl={menuButtonRef.current}
                                    playlistId={playlistId}
                                    isCustom={video.isCustom}
                                    onAddToPlaylist={handleAddToPlaylist}
                                    onEdit={handleUpdate}
                                    onRemove={handleRemove}
                                    onDelete={handleDelete}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>

            {showEditModal && video.isCustom && (
                <CustomVideoModal
                    isOpen={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    onSave={async (updatedVideo) => {
                        await updateVideo(video.id, updatedVideo);
                        setShowEditModal(false);
                    }}
                    initialData={video}
                />
            )}

            {showPlaylistModal && (
                <AddToPlaylistModal
                    onClose={() => setShowPlaylistModal(false)}
                    videoId={video.id}
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
        </>
    );
};

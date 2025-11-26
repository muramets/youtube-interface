import React, { useState, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import type { VideoDetails } from '../../utils/youtubeApi';
import { formatViewCount, formatDuration } from '../../utils/formatUtils';
import { VideoCardMenu } from '../Video/VideoCardMenu';
import { AddToPlaylistModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { CustomVideoModal } from '../Video/CustomVideoModal';

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
        } else if (video.isCustom) {
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
                className="flex gap-2 cursor-pointer group p-2 rounded-lg hover:bg-hover-bg relative"
                onClick={handleVideoClick}
            >
                {/* Thumbnail Container */}
                <div className="relative w-[168px] h-[94px] flex-shrink-0 bg-bg-secondary rounded-lg overflow-hidden">
                    <img
                        src={video.isCustom ? (video.customImage || video.thumbnail) : video.thumbnail}
                        alt={video.title}
                        className="w-full h-full object-cover"
                    />
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

                    {/* Menu Button */}
                    <div className="absolute top-0 right-[-8px]">
                        <button
                            ref={menuButtonRef}
                            className="bg-transparent border-none p-1.5 rounded-full cursor-pointer text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-hover-bg"
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
                        />
                    </div>
                </div>
            </div>

            {showEditModal && video.isCustom && (
                <CustomVideoModal
                    isOpen={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    onSave={(updatedVideo) => {
                        updateVideo(video.id, updatedVideo);
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

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
import './RecommendationCard.css';

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
            <div className="recommendation-card-container" onClick={handleVideoClick}>
                <div className="recommendation-card-hover-bg"></div>

                {/* Thumbnail Container */}
                <div className="recommendation-thumbnail-container">
                    <img
                        src={video.isCustom ? (video.customImage || video.thumbnail) : video.thumbnail}
                        alt={video.title}
                        className="recommendation-thumbnail"
                    />
                    <div className="recommendation-duration">
                        {formatDuration(video.duration)}
                    </div>
                </div>

                {/* Info Container */}
                <div className="recommendation-info-container">
                    <h3 className="recommendation-title">
                        {video.title}
                    </h3>
                    <div className="recommendation-meta">
                        <div>{video.channelTitle}</div>
                        <div>
                            {video.viewCount ? `${formatViewCount(video.viewCount)} views` : ''} • {new Date(video.publishedAt).toLocaleDateString()}
                        </div>
                    </div>

                    {/* Menu Button */}
                    <div className="recommendation-menu-button-container">
                        <button
                            ref={menuButtonRef}
                            className="recommendation-menu-button"
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

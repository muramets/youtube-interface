import React, { useState, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import { useChannel } from '../../context/ChannelContext';
import type { VideoDetails } from '../../utils/youtubeApi';
import { CustomVideoModal } from './CustomVideoModal';
import { formatViewCount, formatDuration } from '../../utils/formatUtils';
import { AddToPlaylistModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { VideoCardMenu } from './VideoCardMenu';

interface VideoCardProps {
  video: VideoDetails;
  playlistId?: string;
  onMenuOpenChange?: (isOpen: boolean) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, playlistId, onMenuOpenChange }) => {
  const navigate = useNavigate();
  const { removeVideo, updateVideo, removeVideoFromPlaylist } = useVideo();
  const { currentChannel } = useChannel();
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
        className="flex flex-col gap-3 cursor-pointer group relative p-2 rounded-xl"
        onClick={handleVideoClick}
      >
        {/* Hover Substrate */}
        <div className="absolute inset-0 bg-bg-secondary rounded-xl opacity-0 scale-90 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:scale-100 -z-10 pointer-events-none" />
        {/* Thumbnail Container */}
        <div className="relative w-full aspect-video bg-bg-secondary rounded-xl overflow-hidden">
          <img
            src={video.isCustom ? (video.customImage || video.thumbnail) : video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded font-medium">
            {formatDuration(video.duration)}
          </div>
        </div>

        {/* Info Container */}
        <div className="flex gap-3 items-start pr-6 relative">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {(video.isCustom && currentChannel?.avatar) ? (
              <div className="w-9 h-9 rounded-full overflow-hidden bg-bg-secondary">
                <img src={currentChannel.avatar} alt="" className="w-full h-full object-cover" />
              </div>
            ) : video.channelAvatar ? (
              <div className="w-9 h-9 rounded-full overflow-hidden bg-bg-secondary">
                <img src={video.channelAvatar} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-full bg-bg-secondary"></div>
            )}
          </div>

          {/* Text Info */}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <h3 className="m-0 text-base font-bold text-text-primary line-clamp-2 leading-snug">
              {video.title}
            </h3>
            <div className="text-sm text-text-secondary flex flex-col">
              <div className="hover:text-text-primary transition-colors">{(video.isCustom && currentChannel) ? currentChannel.name : video.channelTitle}</div>
              <div>
                {video.viewCount ? `${formatViewCount(video.viewCount)} views` : ''} • {new Date(video.publishedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Menu Button */}
          <div className="absolute top-0 right-0">
            <button
              ref={menuButtonRef}
              className="bg-transparent border-none p-2 rounded-full cursor-pointer text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-hover-bg"
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

      {/* Confirmation Modal */}
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

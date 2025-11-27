import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical } from 'lucide-react';
import type { VideoDetails } from '../../utils/youtubeApi';
import { formatDuration } from '../../utils/formatUtils';
import { useVideo } from '../../context/VideoContext';
import { VideoCardMenu } from './VideoCardMenu';
import { CustomVideoModal } from './CustomVideoModal';
import { AddToPlaylistModal as PlaylistSelectionModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';

interface VideoCardProps {
  video: VideoDetails;
  playlistId?: string;
  onMenuOpenChange?: (isOpen: boolean) => void;
  onRemove: (videoId: string) => void;
  onEdit?: (video: VideoDetails) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, playlistId, onMenuOpenChange, onRemove, onEdit }) => {
  const navigate = useNavigate();
  const {
    removeVideoFromPlaylist,
    syncSingleVideo,
    updateVideo
  } = useVideo();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const handleMenuOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuAnchor(e.currentTarget as HTMLElement);
    setIsMenuOpen(true);
    onMenuOpenChange?.(true);
  };

  const handleMenuClose = () => {
    setIsMenuOpen(false);
    setMenuAnchor(null);
    onMenuOpenChange?.(false);
  };

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSyncing) return;

    setIsSyncing(true);
    await syncSingleVideo(video.id);
    setIsSyncing(false);
    // We keep the menu open so the user sees the result (spinner stops)
    // Optionally we could close it: handleMenuClose();
  };

  const handleVideoClick = () => {
    if (playlistId) {
      navigate(`/watch/${video.id}?list=${playlistId}`);
    } else {
      navigate(`/watch/${video.id}`);
    }
  };

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    setShowPlaylistModal(true);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();

    if (playlistId) {
      setConfirmation({
        isOpen: true,
        title: 'Remove from playlist?',
        message: `Are you sure you want to remove "${video.title}" from this playlist?`,
        onConfirm: () => {
          removeVideoFromPlaylist(playlistId, video.id);
          setConfirmation(prev => ({ ...prev, isOpen: false }));
        }
      });
    } else {
      setConfirmation({
        isOpen: true,
        title: 'Delete video?',
        message: `Are you sure you want to delete "${video.title}"? This cannot be undone.`,
        onConfirm: () => {
          onRemove(video.id);
          setConfirmation(prev => ({ ...prev, isOpen: false }));
        }
      });
    }
  };

  const handleUpdate = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    if (video.isCustom) {
      setShowEditModal(true);
    } else {
      onEdit?.(video);
    }
  };

  const handleSaveCustomVideo = async (updatedVideo: any) => {
    await updateVideo(video.id, updatedVideo);
    setShowEditModal(false);
  };

  return (
    <>
      <div
        className="flex flex-col gap-3 cursor-pointer group relative p-2 rounded-xl"
        onClick={handleVideoClick}
      >
        {/* Hover Substrate */}
        <div className={`absolute inset-0 bg-bg-secondary rounded-xl transition-all duration-200 ease-out -z-10 pointer-events-none ${isMenuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'}`} />

        {/* Thumbnail Container */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-bg-secondary">
          <img
            src={video.isCustom ? (video.customImage || video.thumbnail) : video.thumbnail}
            alt={video.title}
            className={`w-full h-full object-cover transition-transform duration-200 ${isMenuOpen ? 'scale-105' : 'group-hover:scale-105'}`}
            loading="lazy"
          />

          {/* Duration Badge */}
          {video.duration && (
            <div className="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-xs font-medium text-white">
              {formatDuration(video.duration)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex gap-3 items-start pr-6 relative">
          {/* Channel Avatar */}
          {!playlistId && (
            <div className="flex-shrink-0">
              {video.channelAvatar ? (
                <img src={video.channelAvatar} alt={video.channelTitle} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-bg-secondary" />
              )}
            </div>
          )}

          <div className="flex flex-col flex-1 min-w-0">
            <h3 className="text-base font-bold text-text-primary line-clamp-2 leading-tight mb-1">
              {video.title}
            </h3>
            <div className="text-sm text-text-secondary flex flex-col">
              <div className="hover:text-text-primary transition-colors">
                {(video.isCustom) ? (
                  video.channelTitle
                ) : video.channelId ? (
                  <a
                    href={`https://www.youtube.com/channel/${video.channelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-inherit no-underline hover:text-text-primary"
                  >
                    {video.channelTitle}
                  </a>
                ) : (
                  video.channelTitle
                )}
              </div>
              <div>
                {video.viewCount ? `${video.viewCount} views` : ''} • {new Date(video.publishedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Menu Button */}
          <div className="absolute top-0 right-0">
            <button
              ref={menuButtonRef}
              onClick={handleMenuOpen}
              className={`p-2 rounded-full hover:bg-hover-bg text-text-primary transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <MoreVertical size={20} />
            </button>

            <VideoCardMenu
              isOpen={isMenuOpen}
              onClose={handleMenuClose}
              anchorEl={menuAnchor}
              playlistId={playlistId}
              isCustom={video.isCustom}
              onAddToPlaylist={handleAddToPlaylist}
              onEdit={handleUpdate}
              onRemove={handleRemove}
              onSync={!video.isCustom ? handleSync : undefined}
              isSyncing={isSyncing}
            />
          </div>
        </div>
      </div>

      {/* Custom Video Edit Modal */}
      {showEditModal && (
        <CustomVideoModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={handleSaveCustomVideo}
          initialData={video}
        />
      )}

      {/* Playlist Selection Modal */}
      {showPlaylistModal && (
        <PlaylistSelectionModal
          onClose={() => setShowPlaylistModal(false)}
          videoId={video.id}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        title={confirmation.title}
        message={confirmation.message}
        onConfirm={confirmation.onConfirm}
        onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
        confirmLabel="Confirm"
      />
    </>
  );
};

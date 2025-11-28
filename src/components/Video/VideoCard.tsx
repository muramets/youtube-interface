import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Info, Trash2 } from 'lucide-react';
import { type VideoDetails, type CoverVersion } from '../../utils/youtubeApi';
import { formatDuration, formatViewCount } from '../../utils/formatUtils';
import { useVideos } from '../../context/VideosContext';
import { usePlaylists } from '../../context/PlaylistsContext';
import { PortalTooltip } from '../Shared/PortalTooltip';
import { VideoCardMenu } from './VideoCardMenu';
import { CustomVideoModal } from './CustomVideoModal';
import { AddToPlaylistModal as PlaylistSelectionModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { ClonedVideoTooltipContent } from './ClonedVideoTooltipContent';

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
    syncVideo,
    updateVideo,
    cloneVideo
  } = useVideos();
  const { removeVideoFromPlaylist } = usePlaylists();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

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
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
    await syncVideo(video.id);
    setIsSyncing(false);
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

  const handleSaveCustomVideo = async (updatedVideo: Omit<VideoDetails, 'id'>, shouldClose = true) => {
    await updateVideo(video.id, updatedVideo);
    if (shouldClose) setShowEditModal(false);
  };

  const handleCloneVideo = async (originalVideo: VideoDetails, version: CoverVersion) => {
    setShowEditModal(false);
    await cloneVideo(originalVideo, version);
  };

  return (
    <>
      <div
        className="flex flex-col gap-3 cursor-pointer group relative p-2 rounded-xl z-0"
        onClick={handleVideoClick}
      >
        {/* Hover Substrate */}
        <div className={`absolute inset-0 rounded-xl transition-all duration-200 ease-out -z-10 pointer-events-none ${isMenuOpen || isTooltipOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'} ${video.isCloned ? 'bg-indigo-500/10 dark:bg-indigo-500/20 border-2 border-indigo-500/30' : (video.isCustom ? 'bg-emerald-500/10 dark:bg-emerald-500/20 border-2 border-emerald-500/30' : 'bg-hover-bg')}`} />

        {/* Thumbnail Container */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-bg-secondary">
          <img
            src={video.isCustom ? (video.customImage || video.thumbnail) : video.thumbnail}
            alt={video.title}
            className={`w-full h-full object-cover transition-transform duration-200 ${isMenuOpen || isTooltipOpen ? 'scale-105' : 'group-hover:scale-105'}`}
            loading="lazy"
          />

          {/* Cloned Timer Overlay */}
          {video.isCloned && (
            <div className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="relative w-10 h-10 flex items-center justify-center">
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
                <span className="text-[10px] font-bold text-white drop-shadow-md">
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
                <div className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-sm border-none cursor-help">
                  <Info size={20} />
                </div>
              </PortalTooltip>
            </div>
          )}

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
              <div className="hover:text-text-primary transition-colors w-fit">
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
                {video.viewCount ? `${formatViewCount(video.viewCount)} views` : ''} • {new Date(video.publishedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Menu Button or Remove Action for Clones */}
          <div className="absolute top-0 right-0">
            {
              video.isCloned ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(video.id);
                  }}
                  className="p-2 rounded-full hover:bg-red-500/10 text-text-primary hover:text-red-500 transition-all duration-75 ease-out opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
                  title="Remove temporary video"
                >
                  <Trash2 size={20} />
                </button>
              ) : (
                <>
                  <button
                    ref={menuButtonRef}
                    onClick={handleMenuOpen}
                    className={`p-2 rounded-full hover:bg-black/20 dark:hover:bg-white/20 text-text-primary transition-all ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
                </>
              )
            }
          </div>
        </div>
      </div>

      {/* Custom Video Edit Modal */}
      {
        showEditModal && (
          <CustomVideoModal
            isOpen={showEditModal}
            onClose={() => setShowEditModal(false)}
            onSave={handleSaveCustomVideo}
            onClone={handleCloneVideo}
            initialData={video}
          />
        )
      }

      {/* Playlist Selection Modal */}
      {
        showPlaylistModal && (
          <PlaylistSelectionModal
            onClose={() => setShowPlaylistModal(false)}
            videoId={video.id}
          />
        )
      }

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

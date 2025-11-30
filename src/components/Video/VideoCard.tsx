import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Info, Trash2 } from 'lucide-react';
import { type VideoDetails, type CoverVersion } from '../../utils/youtubeApi';
import { formatDuration, formatViewCount } from '../../utils/formatUtils';
import { useVideosStore } from '../../stores/videosStore';
import { usePlaylistsStore } from '../../stores/playlistsStore';

import { PortalTooltip } from '../Shared/PortalTooltip';
import { VideoCardMenu } from './VideoCardMenu';
import { CustomVideoModal } from './CustomVideoModal';
import { AddToPlaylistModal as PlaylistSelectionModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';
import { ClonedVideoTooltipContent } from './ClonedVideoTooltipContent';
import { useAuthStore } from '../../stores/authStore';
import { useChannelStore } from '../../stores/channelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUIStore } from '../../stores/uiStore';
import { Toast } from '../Shared/Toast';

interface VideoCardProps {
  video: VideoDetails;
  playlistId?: string;
  onMenuOpenChange?: (isOpen: boolean) => void;
  onRemove: (videoId: string) => void;
  onEdit?: (video: VideoDetails) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, playlistId, onMenuOpenChange, onRemove, onEdit }) => {
  const navigate = useNavigate();
  const syncVideo = useVideosStore(state => state.syncVideo);
  const updateVideo = useVideosStore(state => state.updateVideo);
  const cloneVideo = useVideosStore(state => state.cloneVideo);
  const removeVideoFromPlaylist = usePlaylistsStore(state => state.removeVideoFromPlaylist);
  const user = useAuthStore(state => state.user);
  const currentChannel = useChannelStore(state => state.currentChannel);
  const apiKey = useSettingsStore(state => state.generalSettings.apiKey);
  const { cloneSettings } = useSettingsStore();
  const { setSettingsOpen } = useUIStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showToast, setShowToast] = useState(false);

  const [viewMode, setViewMode] = useState<'custom' | 'youtube'>('custom');
  const [isFlipping, setIsFlipping] = useState(false);

  // Determine which video data to display
  const displayVideo = viewMode === 'youtube' && video.mergedVideoData ? video.mergedVideoData : video;

  // Hover color logic
  const hoverBorderColor = viewMode === 'youtube'
    ? 'border-[#FF0033]/30'
    : (video.publishedVideoId ? 'border-green-500/30' : (video.isCloned ? 'border-indigo-500/30' : (video.isCustom ? 'border-orange-500/30' : 'border-transparent')));

  const hoverBgColor = viewMode === 'youtube'
    ? 'bg-[#FF0033]/10 dark:bg-[#FF0033]/20'
    : (video.publishedVideoId ? 'bg-green-500/10 dark:bg-green-500/20' : (video.isCloned ? 'bg-indigo-500/10 dark:bg-indigo-500/20' : (video.isCustom ? 'bg-orange-500/10 dark:bg-orange-500/20' : 'bg-hover-bg')));

  const handleSwitchView = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();

    if (!video.mergedVideoData && !video.publishedVideoId) return;

    setIsFlipping(true);
    setTimeout(() => {
      setViewMode(prev => prev === 'custom' ? 'youtube' : 'custom');
      setIsFlipping(false);
    }, 150); // Wait for half animation
  };

  // Timer for cloned videos
  React.useEffect(() => {
    if (video.isCloned && video.expiresAt) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((video.expiresAt! - Date.now()) / 1000));
        setTimeLeft(remaining);

        if (remaining <= 0) {
          clearInterval(interval);
          if (user && currentChannel) {
            onRemove(video.id);
          }
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [video.isCloned, video.expiresAt, user, currentChannel, onRemove, video.id]);

  const handleCloneVideo = async (originalVideo: VideoDetails, version: CoverVersion) => {
    setShowEditModal(false);
    if (user && currentChannel) {
      await cloneVideo(user.uid, currentChannel.id, originalVideo, version, cloneSettings.cloneDurationSeconds);
    }
  };

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
    if (isSyncing || !user || !currentChannel) return;

    if (!apiKey) {
      setShowToast(true);
      return;
    }
    setIsSyncing(true);
    await syncVideo(user.uid, currentChannel.id, video.id, apiKey);
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
          if (user && currentChannel) {
            removeVideoFromPlaylist(user.uid, currentChannel.id, playlistId, video.id);
          }
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
    if (user && currentChannel) {
      await updateVideo(user.uid, currentChannel.id, video.id, updatedVideo, apiKey);
    }
    if (shouldClose) setShowEditModal(false);
  };

  return (
    <>
      <div
        className={`flex flex-col gap-3 cursor-pointer group relative p-2 rounded-xl z-0 focus:outline-none transition-all duration-150 ease-in-out`}
        style={{
          transform: isFlipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
          transformStyle: 'preserve-3d'
        }}
        onClick={handleVideoClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleVideoClick();
          }
        }}
      >
        {/* Hover Substrate */}
        <div className={`absolute inset-0 rounded-xl transition-all duration-200 ease-out -z-10 pointer-events-none ${isMenuOpen || isTooltipOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'} ${hoverBgColor} border-2 ${hoverBorderColor}`} />

        {/* Thumbnail Container */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-bg-secondary">
          <img
            src={displayVideo.isCustom ? (displayVideo.customImage || displayVideo.thumbnail) : displayVideo.thumbnail}
            alt={displayVideo.title}
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
          {displayVideo.duration && (
            <div className="absolute bottom-1.5 right-1.5 bg-black/80 px-1.5 py-0.5 rounded text-xs font-medium text-white">
              {formatDuration(displayVideo.duration)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex gap-3 items-start pr-6 relative">
          {/* Channel Avatar */}
          {!playlistId && (
            <div className="flex-shrink-0">
              {displayVideo.channelAvatar ? (
                <img src={displayVideo.channelAvatar} alt={displayVideo.channelTitle} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-bg-secondary" />
              )}
            </div>
          )}

          <div className="flex flex-col flex-1 min-w-0">
            <h3 className="text-base font-bold text-text-primary line-clamp-2 leading-tight mb-1">
              {displayVideo.title}
            </h3>
            <div className="text-sm text-text-secondary flex flex-col">
              <div className="hover:text-text-primary transition-colors w-fit">
                {(displayVideo.isCustom) ? (
                  displayVideo.channelTitle
                ) : displayVideo.channelId ? (
                  <a
                    href={`https://www.youtube.com/channel/${displayVideo.channelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-inherit no-underline hover:text-text-primary"
                  >
                    {displayVideo.channelTitle}
                  </a>
                ) : (
                  displayVideo.channelTitle
                )}
              </div>
              <div>
                {displayVideo.viewCount ? `${formatViewCount(displayVideo.viewCount)} views` : ''} • {new Date(displayVideo.publishedAt).toLocaleDateString()}
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
                    className={`p-2 rounded-full border-none hover:bg-black/20 dark:hover:bg-white/20 text-text-primary transition-all ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
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
                    onSync={(!video.isCustom || video.publishedVideoId) ? handleSync : undefined}
                    isSyncing={isSyncing}
                    onSwitchView={video.publishedVideoId ? handleSwitchView : undefined}
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

      {/* API Key Missing Toast */}
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

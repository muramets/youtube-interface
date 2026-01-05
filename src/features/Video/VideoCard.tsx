import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Info, Trash2, AlertTriangle } from 'lucide-react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { formatDuration, formatViewCount } from '../../core/utils/formatUtils';
import { useVideoSync } from '../../core/hooks/useVideoSync';

import { usePlaylists } from '../../core/hooks/usePlaylists';

import { PortalTooltip } from '../../components/Shared/PortalTooltip';
import { VideoCardMenu } from './VideoCardMenu';
import { AddToPlaylistModal as PlaylistSelectionModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../../components/Shared/ConfirmationModal';
import { ClonedVideoTooltipContent } from './ClonedVideoTooltipContent';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useSettings } from '../../core/hooks/useSettings';
import { useUIStore } from '../../core/stores/uiStore';
import { Toast } from '../../components/Shared/Toast';

interface VideoCardProps {
  video: VideoDetails;
  playlistId?: string;
  onMenuOpenChange?: (isOpen: boolean) => void;
  onRemove: (videoId: string) => void;
  // onEdit removed
  isOverlay?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, playlistId, onMenuOpenChange, onRemove, isOverlay }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentChannel = useChannelStore(state => state.currentChannel);

  const { syncVideo } = useVideoSync(user?.uid || '', currentChannel?.id || '');

  const { removeVideoFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
  const { generalSettings } = useSettings();
  const apiKey = generalSettings.apiKey;

  const { setSettingsOpen, videoViewModes, setVideoViewMode } = useUIStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showToast, setShowToast] = useState(false);
  const [hasSyncError, setHasSyncError] = useState(false);
  const [attemptedAutoSync, setAttemptedAutoSync] = useState(false);



  const viewMode = videoViewModes[video.id] || (video.publishedVideoId ? 'youtube' : 'custom');
  const [isFlipping, setIsFlipping] = useState(false);

  // Determine which video data to display
  const displayVideo = viewMode === 'youtube' && video.mergedVideoData ? video.mergedVideoData : video;

  // Hover color logic - no border for colored custom cards for cleaner premium look
  const hoverBorderColor = video.isCustom || video.isCloned || video.publishedVideoId || viewMode === 'youtube'
    ? 'border-transparent'
    : 'border-transparent';

  const hoverBgColor = viewMode === 'youtube'
    ? 'bg-[#FF0033]/10 dark:bg-[#FF0033]/20'
    : (video.publishedVideoId ? 'bg-green-500/10 dark:bg-green-500/20' : (video.isCloned ? 'bg-indigo-500/10 dark:bg-indigo-500/20' : (video.isCustom ? 'bg-orange-500/10 dark:bg-orange-500/20' : 'bg-hover-bg')));

  const handleSwitchView = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();

    if (!video.mergedVideoData && !video.publishedVideoId) return;

    setIsFlipping(true);
    setTimeout(() => {
      setVideoViewMode(video.id, viewMode === 'custom' ? 'youtube' : 'custom');
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

  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const handleDeleteVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    setConfirmation({
      isOpen: true,
      title: 'Delete Video',
      message: 'Are you sure you want to delete this video?',
      onConfirm: () => {
        onRemove(video.id);
        setConfirmation(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleRemoveFromPlaylist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    if (playlistId) {
      await removeVideoFromPlaylist({ playlistId, videoId: video.id });
    }
  };

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
    await syncVideo(video.id, apiKey);
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

  const handleDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    if (currentChannel) {
      navigate(`/video/${currentChannel.id}/${video.id}/details`);
    }
  };

  const handleThumbnailError = async () => {
    // Set local error state immediately to show placeholder
    setHasSyncError(true);

    if (video.isCustom && !video.publishedVideoId) {
      return;
    }

    if (!attemptedAutoSync && apiKey && user && currentChannel) {
      setAttemptedAutoSync(true);
      try {
        await syncVideo(video.id, apiKey, { silent: true });
        // Restore error state if sync confirms failure (it will be driven by fetchStatus prop anyway)
        // If sync succeeds, fetchStatus becomes 'success' and isUnavailable will become false.
      } catch (e) {
        console.error('[VideoCard] Silent sync failed:', e);
      }
    }
  };

  // Determine if we should show the unavailable placeholder
  // For custom videos with their own thumbnail: only show placeholder in YouTube View
  // For regular YouTube videos or custom videos without thumbnail: always show if unavailable
  const hasCustomThumbnail = video.isCustom && (video.customImage || video.thumbnail);
  // Also check if we have ANY valid thumbnail (e.g., from Trends import)
  const hasValidThumbnail = !!(video.thumbnail || video.customImage);
  const isYouTubeLinkUnavailable = video.fetchStatus === 'failed' || hasSyncError;
  // In YouTube View, also show unavailable if we have a publishedVideoId but no mergedVideoData (fetch pending/failed)
  const isMissingYouTubeData = viewMode === 'youtube' && video.publishedVideoId && !video.mergedVideoData;
  // Don't show unavailable if we have a valid thumbnail to display (e.g., imported from Trends)
  const isUnavailable = (isYouTubeLinkUnavailable || isMissingYouTubeData) && (viewMode === 'youtube' || !hasCustomThumbnail) && !hasValidThumbnail;

  return (
    <>
      <div
        className={`flex flex-col gap-2 cursor-pointer group relative p-[6px] rounded-xl z-0 focus:outline-none transition-all duration-150 ease-in-out ${isOverlay ? 'shadow-2xl bg-bg-secondary' : ''}`}
        style={{
          transform: isFlipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
          transformStyle: 'preserve-3d',
          cursor: isOverlay ? 'grabbing' : 'pointer'
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
        <div className={`absolute inset-0 rounded-xl transition-all duration-200 ease-out -z-10 pointer-events-none ${isOverlay || isMenuOpen || isTooltipOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'} ${hoverBgColor} border-2 ${hoverBorderColor}`} />

        {/* Thumbnail Container */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-bg-secondary">
          {(() => {
            // Determine the thumbnail URL
            const thumbnailUrl = displayVideo.isCustom
              ? (displayVideo.customImage || displayVideo.thumbnail)
              : displayVideo.thumbnail;

            // Show "No Thumbnail" placeholder for custom videos without a cover
            if (displayVideo.isCustom && !thumbnailUrl) {
              return (
                <div className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center flex-col gap-3 relative">
                  {/* Subtle grid pattern overlay */}
                  <div className="absolute inset-0 opacity-10" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.15'%3E%3Cpath d='M0 0h1v1H0zM20 0h1v1h-1zM0 20h1v1H0zM20 20h1v1h-1z'/%3E%3C/g%3E%3C/svg%3E")`,
                    backgroundSize: '40px 40px'
                  }} />
                  {/* Icon container with glow */}
                  <div className="w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-sm flex items-center justify-center border border-white/10 shadow-lg">
                    <svg className="w-8 h-8 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.2em]">No Thumbnail</span>
                </div>
              );
            }

            // Show unavailable placeholder
            if (isUnavailable) {
              return (
                <div className="w-full h-full bg-gradient-to-br from-bg-secondary to-bg-tertiary flex items-center justify-center flex-col gap-2 relative">
                  <div className="text-text-secondary/20">
                    <AlertTriangle size={48} />
                  </div>
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em] opacity-40">Video Unavailable</span>
                </div>
              );
            }

            // Show actual thumbnail
            return (
              <img
                src={thumbnailUrl}
                alt={displayVideo.title}
                className={`w-full h-full object-cover transition-transform duration-200 ${isOverlay || isMenuOpen || isTooltipOpen ? 'scale-105' : 'group-hover:scale-105'}`}
                loading="lazy"
                onLoad={(e) => {
                  const img = e.target as HTMLImageElement;
                  // YouTube returns a tiny placeholder (120x90) when maxres doesn't exist
                  // Normal thumbnails are at least 480px wide, so anything smaller is a fallback
                  if (img.naturalWidth < 480) {
                    handleThumbnailError();
                  }
                }}
                onError={handleThumbnailError}
              />
            );
          })()}

          {/* Unavailable Overlay Badge */}
          {isUnavailable && (
            <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
              <div className="bg-red-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black shadow-2xl flex items-center gap-1.5 border border-red-400/30 animate-in fade-in zoom-in duration-300">
                <AlertTriangle size={14} className="fill-white/20" />
                OFFLINE / PRIVATE
              </div>
            </div>
          )}

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
                <div className="w-10 h-10 rounded-full bg-[var(--modal-overlay)] text-white flex items-center justify-center backdrop-blur-sm border-none cursor-help">
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
              {/* Always use original video's channel data, not merged YouTube data */}
              {video.channelAvatar ? (
                <img src={video.channelAvatar} alt={video.channelTitle} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-bg-secondary" />
              )}
            </div>
          )}

          <div className="flex flex-col flex-1 min-w-0">
            <h3 className="text-base font-bold text-text-primary line-clamp-2 leading-tight mb-1">
              {/* Use first A/B test title if available, otherwise regular title */}
              {(video.abTestTitles && video.abTestTitles.length > 0) ? video.abTestTitles[0] : displayVideo.title}
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
                    className={`p-2 rounded-full border-none hover:bg-[var(--hover-bg)] text-text-primary transition-all ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <MoreVertical size={20} />
                  </button>

                  <VideoCardMenu
                    isOpen={isMenuOpen}
                    onClose={handleMenuClose}
                    anchorEl={menuAnchor}
                    playlistId={playlistId}
                    onAddToPlaylist={handleAddToPlaylist}
                    onDetails={handleDetails}
                    onRemove={playlistId ? handleRemoveFromPlaylist : handleDeleteVideo}
                    onDelete={handleDeleteVideo}
                    onSync={video.publishedVideoId ? handleSync : undefined}
                    isSyncing={isSyncing}
                    onSwitchView={video.publishedVideoId ? handleSwitchView : undefined}
                  />
                </>
              )
            }
          </div>
        </div>
      </div>



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

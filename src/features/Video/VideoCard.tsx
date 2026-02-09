import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MoreVertical, Info, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { VideoService } from '../../core/services/videoService';
import { formatDuration, formatViewCount } from '../../core/utils/formatUtils';
import { useVideoSync } from '../../core/hooks/useVideoSync';

import { usePlaylists } from '../../core/hooks/usePlaylists';

import { PortalTooltip } from '../../components/ui/atoms/PortalTooltip';
import { VideoCardMenu } from './VideoCardMenu';
import { AddToPlaylistModal as PlaylistSelectionModal } from '../Playlists/modals/AddToPlaylistModal';
import { ConfirmationModal } from '../../components/ui/organisms/ConfirmationModal';
import { ClonedVideoTooltipContent } from './ClonedVideoTooltipContent';
import { useThumbnailActions } from '../../core/hooks/useThumbnailActions';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useSettings } from '../../core/hooks/useSettings';
import { useUIStore } from '../../core/stores/uiStore';
import { Toast } from '../../components/ui/molecules/Toast';
import type { VideoDeltaStats } from '../Playlists/hooks/usePlaylistDeltaStats';

export interface VideoCardAnonymizeData {
  channelTitle: string;
  channelAvatar: string;
  viewCountLabel: string;
}

interface VideoCardProps {
  video: VideoDetails;
  playlistId?: string;
  onMenuOpenChange?: (isOpen: boolean) => void;
  onRemove: (videoId: string) => void;
  onSetAsCover?: (videoId: string) => void;

  // onEdit removed
  isOverlay?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  isSelectionMode?: boolean;
  deltaStats?: VideoDeltaStats;
  rankingOverlay?: number | null;
  anonymizeData?: VideoCardAnonymizeData;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, playlistId, onMenuOpenChange, onRemove, onSetAsCover, isOverlay, isSelected, onToggleSelection, isSelectionMode, deltaStats, rankingOverlay, anonymizeData }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentChannel = useChannelStore(state => state.currentChannel);

  const { syncVideo } = useVideoSync(user?.uid || '', currentChannel?.id || '');

  const { removeVideosFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
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




  const viewMode = video.publishedVideoId ? (videoViewModes[video.id] || 'youtube') : 'custom';
  const [isFlipping, setIsFlipping] = useState(false);

  // Determine which video data to display
  let displayVideo = viewMode === 'youtube' && video.mergedVideoData ? video.mergedVideoData : video;

  // LINKED CLONE LOGIC: If this is a linked clone, override with parent's live A/B test data
  const { data: parentVideo } = useQuery({
    queryKey: ['videos', user?.uid, currentChannel?.id],
    queryFn: () => VideoService.fetchVideos(user?.uid || '', currentChannel?.id || ''),
    enabled: !!(video.isCloned && video.clonedFromId && user?.uid && currentChannel?.id),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    select: (videos: VideoDetails[]) => videos?.find(v => v.id === video.clonedFromId)
  });

  if (parentVideo && typeof video.abTestVariantIndex === 'number') {
    const variantIndex = video.abTestVariantIndex;
    const liveTitle = parentVideo.abTestTitles?.[variantIndex];
    const liveThumbnail = parentVideo.abTestThumbnails?.[variantIndex];

    // Create a synthetic override object
    displayVideo = {
      ...displayVideo,
      title: liveTitle || displayVideo.title,
      customImage: liveThumbnail || displayVideo.customImage,
      // If we have a live thumbnail, we might want to ensure it's shown even if 'customImage' logic is complex
      thumbnail: liveThumbnail || displayVideo.thumbnail
    };
  }

  // Hover color logic - no border for colored custom cards for cleaner premium look
  const { handleRateImage, handleRemoveThumbnail } = useThumbnailActions(video.id);

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
      await removeVideosFromPlaylist({ playlistId, videoIds: [video.id] });
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

  // MODIFIED: Navigate to original video details if cloned
  const handleDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMenuClose();
    if (currentChannel) {
      // If cloned, navigate to the original video's details
      const targetVideoId = video.isCloned && video.clonedFromId ? video.clonedFromId : video.id;
      const detailsUrl = `/video/${currentChannel.id}/${targetVideoId}/details${playlistId ? `?from=${playlistId}` : ''}`;
      navigate(detailsUrl);
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
  // In YouTube View, ignore thumbnail presence for unavailability - if the data is missing/failed, it is unavailable
  const isUnavailable = (viewMode === 'youtube'
    ? (isYouTubeLinkUnavailable || isMissingYouTubeData)
    : (isYouTubeLinkUnavailable || isMissingYouTubeData) && !hasCustomThumbnail && !hasValidThumbnail)
    && video.fetchStatus !== 'pending';

  return (
    <>
      <div
        className={`flex flex-col gap-2 cursor-pointer group relative p-[6px] rounded-xl z-0 focus:outline-none transition-all duration-150 ease-in-out h-full ${isOverlay ? 'shadow-2xl bg-bg-secondary' : ''} ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''}`}
        style={{
          transform: isFlipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
          transformStyle: 'preserve-3d',
          cursor: isOverlay ? 'grabbing' : 'pointer'
        }}
        onClick={(e) => {
          // Ctrl/Cmd + Click to toggle selection
          // OR if we are already in selection mode (isSelectionMode is true)
          if (e.metaKey || e.ctrlKey || isSelectionMode) {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelection?.(video.id);
            return;
          }

          // Normal click logic
          handleVideoClick();
        }}
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
        <div className={`absolute inset-0 rounded-xl transition-all duration-200 ease-out -z-10 pointer-events-none ${isOverlay || isMenuOpen || isTooltipOpen || isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'} ${isSelected ? 'bg-blue-500/5 border-blue-500/50' : `${hoverBgColor} border-2 ${hoverBorderColor}`}`} />

        {/* Selection Checkbox - Visible if selected. Removed group-hover visibility. */}
        {onToggleSelection && (
          <div
            className={`absolute top-2 left-2 z-30 transition-all duration-200 ${isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(video.id);
            }}
          >
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-black/40 border-white/50 hover:bg-black/60 hover:border-white'}`}>
              {isSelected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
          </div>
        )}

        {/* Thumbnail Container */}
        <div className="relative aspect-video rounded-xl overflow-hidden bg-bg-secondary">
          {(() => {
            // Determine the thumbnail URL
            // Prioritize A/B test thumbnail if active (similar to how we handle Title above)
            const abTestThumbnail = (video.abTestThumbnails && video.abTestThumbnails.length > 0)
              ? video.abTestThumbnails[0]
              : undefined;

            const thumbnailUrl = abTestThumbnail || (displayVideo.isCustom
              ? (displayVideo.customImage || displayVideo.thumbnail)
              : displayVideo.thumbnail);

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
          {isUnavailable && video.fetchStatus !== 'pending' && (
            <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
              <div className="bg-red-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black shadow-2xl flex items-center gap-1.5 border border-red-400/30 animate-in fade-in zoom-in duration-300">
                <AlertTriangle size={14} className="fill-white/20" />
                OFFLINE / PRIVATE
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {(video.fetchStatus === 'pending') && (
            <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full shadow-2xl border border-white/20 flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
                <span className="text-[10px] font-bold text-white tracking-wider">UPDATING</span>
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
                    rating={video.likedThumbnailVersions?.includes(video.customImageVersion || 1) ? 1 : 0}
                    onRate={(rating) => handleRateImage(video.customImageVersion || 1, rating)}
                    onRemove={() => handleRemoveThumbnail(video.customImageVersion || 1)}
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

          {/* Pick the Winner Ranking Overlay */}
          {rankingOverlay != null && (
            <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in zoom-in duration-200">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-amber-500/30 border border-amber-300/30">
                <span className="text-2xl font-black text-black">{rankingOverlay}</span>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex gap-3 items-start pr-6 relative">
          {/* Channel Avatar */}
          <div className="flex-shrink-0">
            {/* Always use original video's channel data, not merged YouTube data */}
            {(anonymizeData?.channelAvatar || video.channelAvatar) ? (
              <img
                src={anonymizeData?.channelAvatar || video.channelAvatar}
                alt={anonymizeData?.channelTitle || video.channelTitle}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-bg-secondary" />
            )}
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            <h3 className="text-base font-bold text-text-primary line-clamp-2 leading-tight mb-1">
              {/* MODIFIED: Prioritize clone local title */}
              {/* Use first A/B test title if available */}
              {/* For clones, ALWAYS use the local title (video.title) which contains the override, ignoring mergedVideoData */}
              {(displayVideo.abTestTitles && displayVideo.abTestTitles.length > 0)
                ? displayVideo.abTestTitles[0]
                : displayVideo.title
              }
            </h3>
            <div className="text-sm text-text-secondary flex flex-col">
              <div className="hover:text-text-primary transition-colors w-fit">
                {anonymizeData ? (
                  anonymizeData.channelTitle
                ) : (displayVideo.isCustom) ? (
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
                {anonymizeData ? (
                  <>{anonymizeData.viewCountLabel} • {new Date(displayVideo.publishedAt).toLocaleDateString()}</>
                ) : (
                  <>
                    {/*
                     * View count source priority:
                     * 1. deltaStats.currentViews — from Trend Snapshot (same source as delta, always consistent)
                     * 2. displayVideo.viewCount — from Firestore document (updated on manual video sync)
                     */}
                    {(() => {
                      const snapshotViews = deltaStats?.currentViews;
                      const firestoreViews = displayVideo.viewCount;
                      const viewsLabel = snapshotViews != null
                        ? `${formatViewCount(snapshotViews)} views`
                        : (firestoreViews ? `${formatViewCount(firestoreViews)} views` : '');
                      return viewsLabel;
                    })()}
                    {deltaStats?.delta24h !== null && deltaStats?.delta24h !== undefined && (
                      <span className="text-green-400 ml-1">
                        (+{deltaStats.delta24h >= 1000 ? `${(deltaStats.delta24h / 1000).toFixed(1)}K` : deltaStats.delta24h})
                      </span>
                    )}
                    {' '}• {new Date(displayVideo.publishedAt).toLocaleDateString()}
                  </>
                )}
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
                    onSync={(!video.isCustom || video.publishedVideoId) ? handleSync : undefined}
                    isSyncing={isSyncing}
                    onSwitchView={video.publishedVideoId ? handleSwitchView : undefined}
                    onSetAsCover={onSetAsCover ? (e) => {
                      e.stopPropagation();
                      onSetAsCover(video.id);
                      handleMenuClose();
                    } : undefined}
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
            videoIds={[video.id]}
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

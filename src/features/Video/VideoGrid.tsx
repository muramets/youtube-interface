import React from 'react';

import type { VideoDetails } from '../../core/utils/youtubeApi';
import { useVideos } from '../../core/hooks/useVideos';

import { useFilterStore } from '../../core/stores/filterStore';
import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useSettings } from '../../core/hooks/useSettings';
import { VideoCardSkeleton } from '../../features/Video/components/VideoCardSkeleton';
import { VirtualVideoGrid } from './VirtualVideoGrid';
import { VideoGridContainer } from './VideoGridContainer';
import { GRID_LAYOUT } from './layout';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useUIStore } from '../../core/stores/uiStore';
import type { VideoDeltaStats } from '../Playlists/hooks/usePlaylistDeltaStats';
import type { VideoCardAnonymizeData } from './VideoCard';

interface VideoGridProps {
  videos?: VideoDetails[];
  disableChannelFilter?: boolean;
  playlistId?: string;
  isLoading?: boolean;
  onVideoMove?: (movedVideoId: string, targetVideoId: string) => void;
  onSetAsCover?: (id: string) => void;
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  videoDeltaStats?: Map<string, VideoDeltaStats>;
  getRankingOverlay?: (videoId: string) => number | null;
  anonymizeData?: VideoCardAnonymizeData;
  isSelectionMode?: boolean;
}

const parseViewCount = (viewCount: string | number | undefined): number => {
  if (viewCount === undefined || viewCount === null || viewCount === '') return 0;
  if (typeof viewCount === 'number') return viewCount;

  const clean = String(viewCount).toUpperCase().replace(/,/g, '').trim();
  const multipliers: { [key: string]: number } = { 'K': 1e3, 'M': 1e6, 'B': 1e9 };

  // Check for suffix
  const suffix = Object.keys(multipliers).find(s => clean.endsWith(s));

  if (suffix) {
    const numStr = clean.slice(0, -suffix.length);
    const num = parseFloat(numStr);
    return isNaN(num) ? 0 : num * multipliers[suffix];
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

export const VideoGrid: React.FC<VideoGridProps> = ({
  videos: propVideos,
  disableChannelFilter = false,
  playlistId,
  isLoading: propIsLoading = false,
  onVideoMove,
  onSetAsCover,
  selectedIds,
  onToggleSelection,
  videoDeltaStats,
  getRankingOverlay,
  anonymizeData,
  isSelectionMode: propIsSelectionMode
}) => {
  const { user, isLoading: authLoading } = useAuth();
  const currentChannel = useChannelStore(state => state.currentChannel);

  const { videos: contextVideos, isLoading: contextIsLoading, removeVideo, updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');

  const selectedChannel = useFilterStore(state => state.selectedChannel);
  const searchQuery = useFilterStore(state => state.searchQuery);

  const { playlists, removeVideosFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');

  const { generalSettings, videoOrder, updateVideoOrder } = useSettings();
  const cardsPerRow = generalSettings.cardsPerRow;
  const hiddenPlaylistIds = generalSettings.hiddenPlaylistIds || [];

  // Local state for immediate optimistic updates
  const [localVideoOrder, setLocalVideoOrder] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (videoOrder) {
      setLocalVideoOrder(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(videoOrder)) {
          return videoOrder;
        }
        return prev;
      });
    }
  }, [videoOrder]);

  const isLoading = propIsLoading || (propVideos ? false : contextIsLoading) || authLoading || (!propVideos && !currentChannel);

  const sourceVideos = React.useMemo(() => {
    if (propVideos) return propVideos;

    // CRITICAL: Filter out isPlaylistOnly videos FIRST
    // They should NEVER be in Home Page order
    const homePageVideos = playlistId
      ? contextVideos // In playlist view, show all videos
      : contextVideos.filter(v => !v.isPlaylistOnly); // On Home, exclude playlist-only

    // Use localVideoOrder instead of videoOrder for immediate feedback
    // If no saved order, use current videos order
    if (localVideoOrder.length === 0) {
      return homePageVideos;
    }

    const videoMap = new Map(homePageVideos.map(v => [v.id, v]));
    const sorted = localVideoOrder.map(id => videoMap.get(id)).filter((v): v is VideoDetails => !!v);

    // Add any new videos that are not in localVideoOrder yet (PREPEND to beginning)
    const orderedSet = new Set(localVideoOrder);
    const newVideos = homePageVideos.filter(v => !orderedSet.has(v.id));

    // PREPEND new videos to the beginning (so they appear first)
    const result = [...newVideos, ...sorted];

    return result;
  }, [propVideos, contextVideos, localVideoOrder, playlistId]);

  const handleLocalVideoMove = (movedVideoId: string, targetVideoId: string) => {

    // Auto-switch to Manual mode when dragging in any sorted mode
    if (homeSortBy !== 'default') {
      // Capture current visual order BEFORE switching
      const currentVisualOrder = filteredVideos.map(v => v.id);

      // Switch to Manual mode
      setHomeSortBy('default');

      // Initialize videoOrder with current visual state
      setLocalVideoOrder(currentVisualOrder);

      // Update server immediately
      if (user && currentChannel) {
        updateVideoOrder(user.uid, currentChannel.id, currentVisualOrder);
      }

      // After switching, we need to re-calculate indices based on NEW visual order
      // Since we just set localVideoOrder to currentVisualOrder, use it
      const oldIndex = currentVisualOrder.indexOf(movedVideoId);
      const newIndex = currentVisualOrder.indexOf(targetVideoId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = [...currentVisualOrder];
        const [movedId] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, movedId);

        setLocalVideoOrder(newOrder);

        // Update server directly
        if (user && currentChannel) {
          updateVideoOrder(user.uid, currentChannel.id, newOrder);
        }
      }
      return; // Exit early after auto-switch
    }

    // Manual mode: Calculate drag indices from FILTERED videos (what user sees)
    // Only save order for visible videos - isPlaylistOnly videos don't need Home Page order
    const filteredOrder = filteredVideos.map(v => v.id);

    const oldIndex = filteredOrder.indexOf(movedVideoId);
    const newIndex = filteredOrder.indexOf(targetVideoId);

    if (oldIndex !== -1 && newIndex !== -1) {
      // Reorder the filtered list
      const newOrder = [...filteredOrder];
      const [movedId] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, movedId);

      setLocalVideoOrder(newOrder);

      // Update server directly
      if (user && currentChannel) {
        updateVideoOrder(user.uid, currentChannel.id, newOrder);
      }
    }
  };

  const activeFilters = useFilterStore(state => state.activeFilters);
  const homeSortBy = useFilterStore(state => state.homeSortBy);
  const setHomeSortBy = useFilterStore(state => state.setHomeSortBy);
  const videoViewModes = useUIStore(state => state.videoViewModes);

  // 1. Start with source videos
  let result = propVideos || sourceVideos;

  // 2. Filter out hidden videos from Settings (Global hide) AND playlist-only videos
  const hiddenVideoIds = new Set<string>();
  if (!playlistId) { // Only apply hidden playlist logic on Home/Global views, not inside a specific playlist
    // Filter out global hidden playlists
    playlists.forEach(playlist => {
      if (hiddenPlaylistIds.includes(playlist.id)) {
        playlist.videoIds.forEach(id => hiddenVideoIds.add(id));
      }
    });

    // Also filter out playlist-only videos from Home Page
    result = result.filter(video => !video.isPlaylistOnly);
  }

  if (hiddenVideoIds.size > 0) {
    result = result.filter(video => !hiddenVideoIds.has(video.id));
  }

  // 3. Apply Legacy Channel & Search Filters
  result = result.filter(video => {
    const matchesChannel = disableChannelFilter || !selectedChannel || selectedChannel === 'All' || video.channelTitle === selectedChannel;
    const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.channelTitle.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesChannel && matchesSearch;
  });

  // 4. Apply Advanced Filters
  if (activeFilters.length > 0) {
    result = result.filter(video => {
      return activeFilters.every(filter => {
        switch (filter.type) {
          case 'title':
            return video.title.toLowerCase().includes(String(filter.value).toLowerCase());

          case 'channel': {
            const channels = Array.isArray(filter.value) ? filter.value : [filter.value];
            return channels.includes(video.channelTitle);
          }

          case 'playlist': {
            const playlistIds = Array.isArray(filter.value) ? filter.value : [filter.value];
            return playlistIds.some(id => {
              const pl = playlists.find(p => p.id === id);
              return pl ? pl.videoIds.includes(video.id) : false;
            });
          }

          case 'videoType': {
            const types = Array.isArray(filter.value) ? filter.value : [filter.value];
            return types.some(type => {
              if (type === 'custom_video') return video.isCustom;
              if (type === 'published_custom_video') return video.isCustom && video.publishedVideoId;
              if (type === 'other_youtube') return !video.isCustom;
              return true;
            });
          }

          case 'views': {
            const views = parseViewCount(video.viewCount);
            const val = filter.value;
            const [min, max] = Array.isArray(val) ? val : [val, undefined];
            const minNum = Number(min);
            const maxNum = max !== undefined ? Number(max) : undefined;

            switch (filter.operator) {
              case 'gt': return views > minNum;
              case 'lt': return views < minNum;
              case 'gte': return views >= minNum;
              case 'lte': return views <= minNum;
              case 'equals': return views === minNum;
              case 'between': return views >= minNum && (maxNum !== undefined ? views <= maxNum : true);
              default: return true;
            }
          }

          case 'duration': {
            // Duration is ISO 8601 (PT1H2M10S) or custom formatted string.
            // Helper to parse duration string to SECONDS.
            const parseDuration = (duration: string | number) => {
              if (typeof duration === 'number') return duration; // Already seconds?
              if (!duration) return 0;

              // Check ISO 8601
              const isoMatch = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
              if (isoMatch) {
                const hours = parseInt(isoMatch[1] || '0') || 0;
                const minutes = parseInt(isoMatch[2] || '0') || 0;
                const seconds = parseInt(isoMatch[3] || '0') || 0;
                return (hours * 3600) + (minutes * 60) + seconds;
              }

              // Check HH:MM:SS or MM:SS format (Custom Video Manual Entry)
              if (duration.includes(':')) {
                const parts = duration.split(':').map(Number).reverse();
                let seconds = 0;
                if (parts[0]) seconds += parts[0]; // S
                if (parts[1]) seconds += parts[1] * 60; // M
                if (parts[2]) seconds += parts[2] * 3600; // H
                return seconds;
              }

              return parseInt(duration) || 0;
            };

            const videoSeconds = parseDuration(video.duration || '');
            const val = filter.value;
            const [min, max] = Array.isArray(val) ? val : [val, undefined];
            const minNum = Number(min);
            const maxNum = max !== undefined ? Number(max) : undefined;

            // Filter values are now passed in SECONDS from SmartDurationInput

            switch (filter.operator) {
              case 'gt': return videoSeconds > minNum;
              case 'lt': return videoSeconds < minNum;
              case 'gte': return videoSeconds >= minNum;
              case 'lte': return videoSeconds <= minNum;
              case 'equals': return Math.abs(videoSeconds - minNum) < 5; // Allow 5 second buffer for exact match?
              case 'between': return videoSeconds >= minNum && (maxNum !== undefined ? videoSeconds <= maxNum : true);
              default: return true;
            }
          }

          case 'date': {
            const videoDate = new Date(video.publishedAt).getTime();
            const val = filter.value;
            const [start, end] = Array.isArray(val) ? val : [val, undefined];
            const startNum = Number(start);
            const endNum = end !== undefined ? Number(end) : undefined;

            switch (filter.operator) {
              case 'between': return videoDate >= startNum && (endNum !== undefined ? videoDate <= endNum : true);
              default: return true;
            }
          }

          default:
            return true;
        }
      });
    });
  }

  // 5. Apply Sorting (Home Sort) - overrides default order
  let filteredVideos = result; // Initialize return variable
  if (homeSortBy !== 'default') {
    const sorted = [...result];
    sorted.sort((a, b) => {
      if (homeSortBy === 'views') {
        // Priority: Pure View Count (Descending)
        const modeA = videoViewModes[a.id] || (a.publishedVideoId ? 'youtube' : 'custom');
        const modeB = videoViewModes[b.id] || (b.publishedVideoId ? 'youtube' : 'custom');

        const getEffectiveViews = (v: VideoDetails, mode: 'custom' | 'youtube') => {
          // If it's a Custom Video in Custom Mode, use its specific viewCount input
          if (v.isCustom && mode === 'custom') {
            return parseViewCount(v.viewCount);
          }
          // Otherwise use the Merged (Live) stats if available, fall back to base viewCount
          return parseViewCount(v.mergedVideoData?.viewCount || v.viewCount);
        };

        const viewsA = getEffectiveViews(a, modeA);
        const viewsB = getEffectiveViews(b, modeB);

        return viewsB - viewsA; // Descending
      } else if (homeSortBy === 'date') {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      } else if (homeSortBy === 'recently_added') {
        // Sort by addedToHomeAt, fallback to createdAt for backward compatibility
        const timeA = a.addedToHomeAt || a.createdAt || 0;
        const timeB = b.addedToHomeAt || b.createdAt || 0;
        return timeB - timeA; // Newest first
      }
      return 0;
    });
    filteredVideos = sorted;
  }






  if (isLoading) {
    return (
      <VideoGridContainer>
        <div
          className={`grid w-full h-full overflow-y-auto overflow-x-hidden`}
          style={{
            gap: GRID_LAYOUT.GAP,
            paddingTop: GRID_LAYOUT.PADDING.TOP,
            paddingRight: GRID_LAYOUT.PADDING.RIGHT,
            paddingBottom: GRID_LAYOUT.PADDING.BOTTOM,
            paddingLeft: GRID_LAYOUT.PADDING.LEFT,
            gridTemplateColumns: `repeat(${cardsPerRow}, minmax(0, 1fr))`
          }}
        >
          {Array.from({ length: cardsPerRow * 3 }).map((_, i) => (
            <div key={i} className="min-w-0">
              <VideoCardSkeleton />
            </div>
          ))}
        </div>
      </VideoGridContainer >
    );
  }

  if (filteredVideos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-[50vh] text-text-secondary">
        <p className="text-xl font-medium">No videos found</p>
        <p className="text-sm mt-2">Try adjusting your filters or add new videos.</p>
      </div>
    );
  }

  return (
    <VideoGridContainer>
      <VirtualVideoGrid
        videos={filteredVideos}
        playlistId={playlistId}
        onRemove={async (videoId) => {
          if (!user || !currentChannel) return;

          if (playlistId) {
            // Remove from specific playlist to update UI immediately
            await removeVideosFromPlaylist({
              playlistId,
              videoIds: [videoId]
            });
            // AND Perform full delete (Delete Everywhere) as per user requirement.
            // "Delete" button in playlist means "Delete this video entirely".
            await removeVideo(videoId);
          } else {
            // Remove from Home Page
            // Check if video is in ANY playlist
            const isInAnyPlaylist = playlists.some(p => p.videoIds.includes(videoId));

            if (isInAnyPlaylist) {
              // Soft delete: Hide from Home, keep in DB/Playlists
              await updateVideo({
                videoId,
                updates: {
                  isPlaylistOnly: true,
                  addedToHomeAt: 0
                }
              });
            } else {
              // Hard delete: Not in any playlist, so safe to delete completely
              await removeVideo(videoId);
            }
          }
        }}
        onVideoMove={onVideoMove || handleLocalVideoMove}
        onSetAsCover={onSetAsCover}
        selectedIds={selectedIds}
        onToggleSelection={onToggleSelection}
        isSelectionMode={propIsSelectionMode ?? (selectedIds != null && selectedIds.size > 0)}
        videoDeltaStats={videoDeltaStats}
        getRankingOverlay={getRankingOverlay}
        anonymizeData={anonymizeData}
      />
    </VideoGridContainer>
  );
};

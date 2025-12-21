import React from 'react';

import type { VideoDetails } from '../../core/utils/youtubeApi';
import { useVideos } from '../../core/hooks/useVideos';

import { useFilterStore } from '../../core/stores/filterStore';
import { usePlaylists } from '../../core/hooks/usePlaylists';
import { useSettings } from '../../core/hooks/useSettings';
import { VideoCardSkeleton } from '../../components/Shared/VideoCardSkeleton';
import { VirtualVideoGrid } from './VirtualVideoGrid';
import { VideoGridContainer } from './VideoGridContainer';
import { GRID_LAYOUT } from './layout';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useUIStore } from '../../core/stores/uiStore';

interface VideoGridProps {
  videos?: VideoDetails[];
  onVideoMove?: (movedVideoId: string, targetVideoId: string) => void;
  disableChannelFilter?: boolean;
  playlistId?: string;
  isLoading?: boolean;
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
  onVideoMove,
  disableChannelFilter = false,
  playlistId,
  isLoading: propIsLoading = false
}) => {
  const { user, isLoading: authLoading } = useAuth();
  const currentChannel = useChannelStore(state => state.currentChannel);

  const { videos: contextVideos, isLoading: contextIsLoading, removeVideo } = useVideos(user?.uid || '', currentChannel?.id || '');

  const selectedChannel = useFilterStore(state => state.selectedChannel);
  const searchQuery = useFilterStore(state => state.searchQuery);

  const { playlists } = usePlaylists(user?.uid || '', currentChannel?.id || '');

  const { generalSettings, videoOrder } = useSettings();
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
    // Use localVideoOrder instead of videoOrder for immediate feedback
    if (!localVideoOrder || localVideoOrder.length === 0) return contextVideos;

    const videoMap = new Map(contextVideos.map(v => [v.id, v]));
    const sorted = localVideoOrder.map(id => videoMap.get(id)).filter((v): v is VideoDetails => !!v);

    // Append any new videos that are not in localVideoOrder yet
    const orderedSet = new Set(localVideoOrder);
    const remaining = contextVideos.filter(v => !orderedSet.has(v.id));

    return [...sorted, ...remaining];
  }, [propVideos, contextVideos, localVideoOrder]);

  const handleLocalVideoMove = (movedVideoId: string, targetVideoId: string) => {
    // 1. Update local state immediately
    const currentOrder = [...(localVideoOrder.length > 0 ? localVideoOrder : contextVideos.map(v => v.id))];

    // Ensure all current videos are in the order list (same logic as App.tsx)
    const orderSet = new Set(currentOrder);
    contextVideos.forEach(v => {
      if (!orderSet.has(v.id)) {
        currentOrder.push(v.id);
      }
    });

    const oldIndex = currentOrder.indexOf(movedVideoId);
    const newIndex = currentOrder.indexOf(targetVideoId);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...currentOrder];
      const [movedId] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, movedId);

      setLocalVideoOrder(newOrder);

      // 2. Propagate to parent for server update
      if (onVideoMove) {
        onVideoMove(movedVideoId, targetVideoId);
      }
    }
  };

  const activeFilters = useFilterStore(state => state.activeFilters);
  const homeSortBy = useFilterStore(state => state.homeSortBy);
  const videoViewModes = useUIStore(state => state.videoViewModes);

  const filteredVideos = React.useMemo(() => {
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
              const [min, max] = Array.isArray(filter.value) ? filter.value : [filter.value, undefined];

              switch (filter.operator) {
                case 'gt': return views > min;
                case 'lt': return views < min;
                case 'gte': return views >= min;
                case 'lte': return views <= min;
                case 'equals': return views === min;
                case 'between': return views >= min && (max !== undefined ? views <= max : true);
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
              const [min, max] = Array.isArray(filter.value) ? filter.value : [filter.value, undefined];

              // Filter values are now passed in SECONDS from SmartDurationInput

              switch (filter.operator) {
                case 'gt': return videoSeconds > min;
                case 'lt': return videoSeconds < min;
                case 'gte': return videoSeconds >= min;
                case 'lte': return videoSeconds <= min;
                case 'equals': return Math.abs(videoSeconds - min) < 5; // Allow 5 second buffer for exact match?
                case 'between': return videoSeconds >= min && (max !== undefined ? videoSeconds <= max : true);
                default: return true;
              }
            }

            case 'date': {
              const videoDate = new Date(video.publishedAt).getTime();
              const [start, end] = Array.isArray(filter.value) ? filter.value : [filter.value, undefined];
              switch (filter.operator) {
                case 'between': return videoDate >= start && (end !== undefined ? videoDate <= end : true);
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
        }
        return 0;
      });
      return sorted;
    }

    return result;
  }, [sourceVideos, selectedChannel, searchQuery, disableChannelFilter, propVideos, playlists, hiddenPlaylistIds, activeFilters, homeSortBy, videoViewModes]);





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
        onRemove={(videoId) => {
          if (user && currentChannel) {
            removeVideo(videoId);
          }
        }}
        onVideoMove={handleLocalVideoMove}
      />
    </VideoGridContainer>
  );
};

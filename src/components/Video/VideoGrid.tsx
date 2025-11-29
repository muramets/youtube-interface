import React from 'react';

import type { VideoDetails } from '../../utils/youtubeApi';
import { useVideos } from '../../context/VideosContext';
import { useVideoFiltering } from '../../context/VideoFilterContext';
import { useVideoActions } from '../../context/VideoActionsContext';
import { usePlaylists } from '../../context/PlaylistsContext';
import { useSettings } from '../../context/SettingsContext';
import { VideoCardSkeleton } from '../Shared/VideoCardSkeleton';
import { VirtualVideoGrid } from './VirtualVideoGrid';
import { VideoGridContainer } from './VideoGridContainer';
import { GRID_LAYOUT } from '../../config/layout';

interface VideoGridProps {
  videos?: VideoDetails[];
  onVideoMove?: (oldIndex: number, newIndex: number) => void;
  disableChannelFilter?: boolean;
  playlistId?: string;
  isLoading?: boolean;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  videos: propVideos,
  disableChannelFilter = false,
  playlistId,
  isLoading: propIsLoading = false
}) => {
  const { videos: contextVideos, isLoading: contextIsLoading } = useVideos();
  const { selectedChannel, searchQuery } = useVideoFiltering();
  const { removeVideo } = useVideoActions();
  const { playlists } = usePlaylists();
  const { generalSettings } = useSettings();
  const hiddenPlaylistIds = generalSettings.hiddenPlaylistIds || [];

  const isLoading = propIsLoading || (propVideos ? false : contextIsLoading);
  const sourceVideos = propVideos || contextVideos;

  const filteredVideos = React.useMemo(() => {
    if (propVideos) return propVideos;

    // Get Set of hidden video IDs
    const hiddenVideoIds = new Set<string>();
    // Only apply playlist filtering if using global context videos
    playlists.forEach(playlist => {
      if (hiddenPlaylistIds.includes(playlist.id)) {
        playlist.videoIds.forEach(id => hiddenVideoIds.add(id));
      }
    });

    let result = sourceVideos;

    // Filter out hidden videos
    if (hiddenVideoIds.size > 0) {
      result = result.filter(video => !hiddenVideoIds.has(video.id));
    }

    return result.filter(video => {
      const matchesChannel = disableChannelFilter || selectedChannel === 'All' || video.channelTitle === selectedChannel;
      const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.channelTitle.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesChannel && matchesSearch;
    });
  }, [sourceVideos, selectedChannel, searchQuery, disableChannelFilter, propVideos, playlists, hiddenPlaylistIds]);



  console.log('VideoGrid render', { isLoading, videoCount: filteredVideos.length });

  if (isLoading) {
    return (
      <VideoGridContainer>
        <div
          className={`grid w-full h-full overflow-y-auto overflow-x-hidden`}
          style={{
            gap: GRID_LAYOUT.GAP,
            paddingRight: GRID_LAYOUT.PADDING.RIGHT,
            paddingBottom: GRID_LAYOUT.PADDING.BOTTOM,
            paddingLeft: GRID_LAYOUT.PADDING.LEFT,
            gridTemplateColumns: `repeat(${generalSettings.cardsPerRow}, minmax(0, 1fr))`
          }}
        >
          {Array.from({ length: generalSettings.cardsPerRow * 3 }).map((_, i) => (
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
        onRemove={removeVideo}
      />
    </VideoGridContainer>
  );
};

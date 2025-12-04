import React from 'react';

import type { VideoDetails } from '../../utils/youtubeApi';
import { useVideos } from '../../hooks/useVideos';

import { useFilterStore } from '../../stores/filterStore';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useSettings } from '../../hooks/useSettings';
import { VideoCardSkeleton } from '../Shared/VideoCardSkeleton';
import { VirtualVideoGrid } from './VirtualVideoGrid';
import { VideoGridContainer } from './VideoGridContainer';
import { GRID_LAYOUT } from '../../config/layout';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';

interface VideoGridProps {
  videos?: VideoDetails[];
  onVideoMove?: (movedVideoId: string, targetVideoId: string) => void;
  disableChannelFilter?: boolean;
  playlistId?: string;
  isLoading?: boolean;
}

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

  const isLoading = propIsLoading || (propVideos ? false : contextIsLoading) || authLoading || (!propVideos && !currentChannel);

  const sourceVideos = React.useMemo(() => {
    if (propVideos) return propVideos;
    if (!videoOrder || videoOrder.length === 0) return contextVideos;

    const videoMap = new Map(contextVideos.map(v => [v.id, v]));
    const sorted = videoOrder.map(id => videoMap.get(id)).filter((v): v is VideoDetails => !!v);

    // Append any new videos that are not in videoOrder yet
    const orderedSet = new Set(videoOrder);
    const remaining = contextVideos.filter(v => !orderedSet.has(v.id));

    return [...sorted, ...remaining];
  }, [propVideos, contextVideos, videoOrder]);

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
      const matchesChannel = disableChannelFilter || !selectedChannel || selectedChannel === 'All' || video.channelTitle === selectedChannel;
      const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.channelTitle.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesChannel && matchesSearch;
    });
  }, [sourceVideos, selectedChannel, searchQuery, disableChannelFilter, propVideos, playlists, hiddenPlaylistIds]);





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
        onVideoMove={onVideoMove}
      />
    </VideoGridContainer>
  );
};

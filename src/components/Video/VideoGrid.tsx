import React from 'react';
import { VideoCard } from './VideoCard';
import { useVideo } from '../../context/VideoContext';
import type { VideoDetails } from '../../utils/youtubeApi';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useChannel } from '../../context/ChannelContext';

interface SortableVideoCardProps {
  video: any;
}

// Helper component for sortable item
interface SortableVideoCardProps {
  video: any;
  onRemove: (id: string) => void;
  playlistId?: string;
}

// Helper component for sortable item
const SortableVideoCard = ({ video, onRemove, playlistId }: SortableVideoCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: video.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <VideoCard video={video} onRemove={onRemove} playlistId={playlistId} />
    </div>
  );
};

interface VideoGridProps {
  videos?: VideoDetails[];
  onVideoMove?: (oldIndex: number, newIndex: number) => void;
  disableChannelFilter?: boolean;
  playlistId?: string;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  videos: propVideos,
  onVideoMove,
  disableChannelFilter = false,
  playlistId
}) => {
  const { videos: contextVideos, cardsPerRow, selectedChannel, playlists, hiddenPlaylistIds, moveVideo, searchQuery, homeSortBy, removeVideo } = useVideo();
  const { currentChannel } = useChannel();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredVideos = React.useMemo(() => {
    // Use provided videos or fallback to context videos
    const sourceVideos = propVideos || contextVideos;

    // Get Set of hidden video IDs
    const hiddenVideoIds = new Set<string>();
    if (!propVideos) { // Only apply playlist filtering if using global context videos
      playlists.forEach(playlist => {
        if (hiddenPlaylistIds.includes(playlist.id)) {
          playlist.videoIds.forEach(id => hiddenVideoIds.add(id));
        }
      });
    }

    let result = sourceVideos;

    // Apply channel filter only if not disabled and not using propVideos (unless we want to filter propVideos too, but usually not for playlists)
    if (!disableChannelFilter && !propVideos) {
      result = selectedChannel === 'All'
        ? result
        : result.filter(video => {
          const effectiveChannelTitle = (video.isCustom && currentChannel) ? currentChannel.name : video.channelTitle;
          return effectiveChannelTitle === selectedChannel;
        });
    }

    // Apply hidden playlist filter
    if (!propVideos) {
      result = result.filter(video => !hiddenVideoIds.has(video.id));
    }

    // Apply search filter
    result = result.filter(video => {
      if (!searchQuery) return true;
      return video.title.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Sorting (only apply if not using propVideos, or if we want to allow sorting in playlists too? 
    // Usually playlists have their own order, but search/sort might be useful. 
    // For now, let's apply sort if it's the main grid, but maybe respect playlist order otherwise?
    // Actually, if onVideoMove is provided, we probably want to respect the order passed in, unless sorting is active.)

    // If we are in a playlist (propVideos exists), we might want to skip global sorting to preserve playlist order
    // UNLESS the user explicitly selected a sort option. But homeSortBy is global.
    // Let's assume for now we only sort the main grid.
    if (!propVideos) {
      if (homeSortBy === 'views') {
        result = [...result].sort((a, b) => {
          const viewsA = parseInt(a.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
          const viewsB = parseInt(b.viewCount?.replace(/[^0-9]/g, '') || '0', 10);
          return viewsB - viewsA;
        });
      } else if (homeSortBy === 'date') {
        result = [...result].sort((a, b) => {
          const dateA = new Date(a.publishedAt).getTime();
          const dateB = new Date(b.publishedAt).getTime();
          return dateB - dateA;
        });
      }
    }

    return result;
  }, [contextVideos, propVideos, selectedChannel, playlists, hiddenPlaylistIds, searchQuery, homeSortBy, currentChannel, disableChannelFilter]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      // Use propVideos if available, otherwise contextVideos
      const sourceVideos = propVideos || contextVideos;

      const oldIndex = sourceVideos.findIndex((v) => v.id === active.id);
      const newIndex = sourceVideos.findIndex((v) => v.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        if (onVideoMove) {
          onVideoMove(oldIndex, newIndex);
        } else if (selectedChannel === 'All' && !searchQuery && homeSortBy === 'default') {
          // Only allow global reordering if we are viewing 'All' videos and no filters/sorts are active
          moveVideo(oldIndex, newIndex);
        }
      }
    }
  };

  // Draggable condition:
  // If propVideos is provided (playlist), it's draggable if onVideoMove is provided (and maybe no search?)
  // If contextVideos (home), it's draggable if All channel, no search, default sort.
  const isDraggable = propVideos
    ? (!!onVideoMove && !searchQuery)
    : (selectedChannel === 'All' && !searchQuery && homeSortBy === 'default');

  if (filteredVideos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-[50vh] text-text-secondary">
        <p className="text-xl font-medium">No videos found</p>
        <p className="text-sm mt-2">Try adjusting your filters or add new videos.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid gap-4 py-6 pr-6 pl-0 w-full"
        style={{
          gridTemplateColumns: `repeat(${cardsPerRow}, 1fr)`
        }}
      >
        {isDraggable ? (
          <SortableContext
            items={filteredVideos.map(v => v.id)}
            strategy={rectSortingStrategy}
          >
            {filteredVideos.map((video) => (
              <div key={video.id} className="min-w-0">
                <SortableVideoCard video={video} onRemove={removeVideo} playlistId={playlistId} />
              </div>
            ))}
          </SortableContext>
        ) : (
          filteredVideos.map((video) => (
            <div key={video.id} className="min-w-0">
              <VideoCard video={video} onRemove={removeVideo} playlistId={playlistId} />
            </div>
          ))
        )}
      </div>
    </DndContext>
  );
};

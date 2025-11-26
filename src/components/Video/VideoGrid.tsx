import React from 'react';
import { VideoCard } from './VideoCard';
import { useVideo } from '../../context/VideoContext';
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
const SortableVideoCard = ({ video }: SortableVideoCardProps) => {
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
      <VideoCard video={video} />
    </div>
  );
};

export const VideoGrid: React.FC = () => {
  const { videos, cardsPerRow, selectedChannel, playlists, hiddenPlaylistIds, moveVideo, searchQuery, homeSortBy } = useVideo();
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
    // Get Set of hidden video IDs
    const hiddenVideoIds = new Set<string>();
    playlists.forEach(playlist => {
      if (hiddenPlaylistIds.includes(playlist.id)) {
        playlist.videoIds.forEach(id => hiddenVideoIds.add(id));
      }
    });

    let result = (selectedChannel === 'All'
      ? videos
      : videos.filter(video => {
        const effectiveChannelTitle = (video.isCustom && currentChannel) ? currentChannel.name : video.channelTitle;
        return effectiveChannelTitle === selectedChannel;
      })
    ).filter(video => !hiddenVideoIds.has(video.id))
      .filter(video => {
        if (!searchQuery) return true;
        return video.title.toLowerCase().includes(searchQuery.toLowerCase());
      });

    // Sorting
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

    return result;
  }, [videos, selectedChannel, playlists, hiddenPlaylistIds, searchQuery, homeSortBy, currentChannel]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = videos.findIndex((v) => v.id === active.id);
      const newIndex = videos.findIndex((v) => v.id === over.id);

      // Only allow reordering if we are viewing 'All' videos and indices are valid
      if (selectedChannel === 'All' && !searchQuery && homeSortBy === 'default' && oldIndex !== -1 && newIndex !== -1) {
        moveVideo(oldIndex, newIndex);
      }
    }
  };

  const isDraggable = selectedChannel === 'All' && !searchQuery && homeSortBy === 'default';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid gap-4 p-6 w-full"
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
                <SortableVideoCard video={video} />
              </div>
            ))}
          </SortableContext>
        ) : (
          filteredVideos.map((video) => (
            <div key={video.id} className="min-w-0">
              <VideoCard video={video} />
            </div>
          ))
        )}
      </div>
    </DndContext>
  );
};

import React, { useState } from 'react';
import { Plus, X, Youtube, Upload } from 'lucide-react';
import { VideoCard } from './VideoCard';
import { useVideo } from '../../context/VideoContext';
import { CustomVideoModal } from './CustomVideoModal';
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

type AddingMode = 'idle' | 'choosing' | 'youtube';

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
  const { videos, addVideo, cardsPerRow, selectedChannel, addCustomVideo, playlists, hiddenPlaylistIds, moveVideo, searchQuery } = useVideo();
  const { currentChannel } = useChannel();
  const [addingMode, setAddingMode] = useState<AddingMode>('idle');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

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

  const handleAddYouTubeVideo = async () => {
    if (!newVideoUrl.trim()) return;

    setIsLoading(true);
    const success = await addVideo(newVideoUrl);
    setIsLoading(false);

    if (success) {
      setNewVideoUrl('');
      setAddingMode('idle');
    }
  };

  // Get Set of hidden video IDs
  const hiddenVideoIds = new Set<string>();
  playlists.forEach(playlist => {
    if (hiddenPlaylistIds.includes(playlist.id)) {
      playlist.videoIds.forEach(id => hiddenVideoIds.add(id));
    }
  });

  const filteredVideos = (selectedChannel === 'All'
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = videos.findIndex((v) => v.id === active.id);
      const newIndex = videos.findIndex((v) => v.id === over.id);

      // Only allow reordering if we are viewing 'All' videos and indices are valid
      if (selectedChannel === 'All' && !searchQuery && oldIndex !== -1 && newIndex !== -1) {
        moveVideo(oldIndex, newIndex);
      }
    }
  };

  const isDraggable = selectedChannel === 'All' && !searchQuery;

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
              <SortableVideoCard key={video.id} video={video} />
            ))}
          </SortableContext>
        ) : (
          filteredVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))
        )}

        {/* Add Video Card - Only show when "All" is selected */}
        {selectedChannel === 'All' && (
          <div
            className={`flex flex-col gap-3 ${addingMode === 'idle' ? 'cursor-pointer' : 'cursor-default'}`}
            onClick={() => addingMode === 'idle' && setAddingMode('choosing')}
          >
            <div className="w-full aspect-video bg-bg-secondary rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-border p-4 relative box-border">
              {addingMode === 'idle' ? (
                <Plus size={32} className="text-text-secondary" />
              ) : addingMode === 'choosing' ? (
                <div className="w-full h-full flex flex-col gap-3 justify-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center w-full">
                    <span className="font-semibold text-text-primary text-sm">Add Video</span>
                    <button
                      onClick={() => setAddingMode('idle')}
                      className="bg-transparent border-none cursor-pointer text-text-secondary p-0 hover:text-text-primary"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <button
                    onClick={() => setAddingMode('youtube')}
                    className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary cursor-pointer flex items-center gap-2 text-xs w-full hover:bg-hover-bg transition-colors"
                  >
                    <Youtube size={18} color="red" />
                    Add YouTube Video
                  </button>

                  <button
                    onClick={() => {
                      setAddingMode('idle');
                      setIsCustomModalOpen(true);
                    }}
                    className="p-2.5 rounded-lg border border-border bg-bg-primary text-text-primary cursor-pointer flex items-center gap-2 text-xs w-full hover:bg-hover-bg transition-colors"
                  >
                    <Upload size={18} color="#3ea6ff" />
                    Create My Video
                  </button>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center w-full mb-1">
                    <span className="font-semibold text-text-primary text-sm">Add YouTube Video</span>
                    <button
                      onClick={() => setAddingMode('choosing')}
                      className="bg-transparent border-none cursor-pointer text-text-secondary p-0 hover:text-text-primary"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Paste YouTube URL..."
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddYouTubeVideo()}
                    className="p-2 rounded-md border border-border bg-bg-primary text-text-primary w-full box-border text-xs outline-none focus:border-blue-500"
                    autoFocus
                  />

                  <button
                    onClick={handleAddYouTubeVideo}
                    disabled={isLoading}
                    className={`py-1.5 px-3 rounded-full border-none font-bold cursor-pointer w-full text-xs transition-colors ${isLoading ? 'bg-text-secondary cursor-not-allowed' : 'bg-[#3ea6ff] text-black hover:bg-[#3ea6ff]/90'}`}
                  >
                    {isLoading ? 'Loading...' : 'Add Video'}
                  </button>
                </div>
              )}
            </div>

            {/* Meta placeholder to match VideoCard height */}
            <div className={`flex gap-3 transition-opacity duration-200 ${addingMode === 'idle' ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-9 h-9 rounded-full bg-bg-secondary flex-shrink-0 overflow-hidden">
                {currentChannel?.avatar ? (
                  <img
                    src={currentChannel.avatar}
                    alt="User Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-purple-600 flex items-center justify-center text-white font-bold">
                    {currentChannel?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <div className="flex flex-col flex-1">
                <h3 className="m-0 text-base font-semibold text-text-primary leading-snug">
                  Add Video
                </h3>
                <div className="mt-1 text-text-secondary text-sm">
                  Paste a YouTube URL or Upload Your Video
                </div>
              </div>
            </div>
          </div>
        )}
        <CustomVideoModal
          isOpen={isCustomModalOpen}
          onClose={() => setIsCustomModalOpen(false)}
          onSave={addCustomVideo}
        />
      </div>
    </DndContext>
  );
};

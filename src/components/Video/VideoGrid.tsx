import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, X, Youtube, Upload } from 'lucide-react';
import { VideoCard } from './VideoCard';
import { useVideo } from '../../context/VideoContext';
import { CustomVideoModal } from './CustomVideoModal';

type AddingMode = 'idle' | 'choosing' | 'youtube';

export const VideoGrid: React.FC = () => {
  const { videos, moveVideo, addVideo, cardsPerRow, selectedChannel, addCustomVideo } = useVideo();
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && over) {
      const oldIndex = videos.findIndex((item) => item.id === active.id);
      const newIndex = videos.findIndex((item) => item.id === over.id);
      moveVideo(oldIndex, newIndex);
    }
  };

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

  const filteredVideos = selectedChannel === 'All'
    ? videos
    : videos.filter(video => video.channelTitle === selectedChannel);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cardsPerRow}, 1fr)`,
        gap: '16px',
        padding: '24px',
        width: '100%'
      }}>
        <SortableContext items={filteredVideos} strategy={rectSortingStrategy}>
          {filteredVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </SortableContext>

        {/* Add Video Card - Only show when "All" is selected */}
        {selectedChannel === 'All' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            cursor: addingMode === 'idle' ? 'pointer' : 'default',
          }}
            onClick={() => addingMode === 'idle' && setAddingMode('choosing')}
          >
            <div style={{
              width: '100%',
              aspectRatio: '16/9',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px dashed var(--border)',
              boxSizing: 'border-box',
              padding: '16px',
              position: 'relative'
            }}>
              {addingMode === 'idle' ? (
                <Plus size={32} color="var(--text-secondary)" />
              ) : addingMode === 'choosing' ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>Add Video</span>
                    <button
                      onClick={() => setAddingMode('idle')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <button
                    onClick={() => setAddingMode('youtube')}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      width: '100%'
                    }}
                  >
                    <Youtube size={18} color="red" />
                    Add YouTube Video
                  </button>

                  <button
                    onClick={() => {
                      setAddingMode('idle');
                      setIsCustomModalOpen(true);
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      width: '100%'
                    }}
                  >
                    <Upload size={18} color="#3ea6ff" />
                    Create My Video
                  </button>
                </div>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>Add YouTube Video</span>
                    <button
                      onClick={() => setAddingMode('choosing')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}
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
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      width: '100%',
                      boxSizing: 'border-box',
                      fontSize: '12px'
                    }}
                    autoFocus
                  />

                  <button
                    onClick={handleAddYouTubeVideo}
                    disabled={isLoading}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '16px',
                      border: 'none',
                      backgroundColor: isLoading ? 'var(--text-secondary)' : '#3ea6ff',
                      color: 'black',
                      fontWeight: 'bold',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      width: '100%',
                      fontSize: '12px'
                    }}
                  >
                    {isLoading ? 'Loading...' : 'Add Video'}
                  </button>
                </div>
              )}
            </div>

            {/* Meta placeholder to match VideoCard height */}
            <div style={{ display: 'flex', gap: '12px', opacity: addingMode === 'idle' ? 1 : 0 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-secondary)', // Added placeholder color
                flexShrink: 0
              }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  lineHeight: '1.4'
                }}>
                  Add Video
                </h3>
                <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Paste a YouTube URL or Upload Your Video
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <CustomVideoModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSave={addCustomVideo}
      />
    </DndContext>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MoreVertical, Trash2, RefreshCw, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { VideoDetails } from '../../utils/youtubeApi';
import { useVideo } from '../../context/VideoContext';
import { CustomVideoModal } from './CustomVideoModal';
import { formatViewCount, formatDuration } from '../../utils/formatUtils';

interface VideoCardProps {
  video: VideoDetails;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video }) => {
  const { removeVideo, updateVideo } = useVideo();
  const [showMenu, setShowMenu] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
    opacity: isDragging ? 0.5 : 1,
    cursor: 'pointer',
    touchAction: 'none',
    position: 'relative' as const,
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleUpdate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (video.isCustom) {
      setIsEditModalOpen(true);
    } else {
      await updateVideo(video.id);
    }
  };

  const handleCustomUpdate = (updatedVideo: Omit<VideoDetails, 'id'>) => {
    updateVideo(video.id, updatedVideo);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    removeVideo(video.id);
  };

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => navigate(`/watch/${video.id}`)}
        className="video-card-container"
      >
        <div className="video-card-hover-bg" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative', zIndex: 1 }}>
          {/* Thumbnail */}
          <div style={{
            width: '100%',
            aspectRatio: '16/9',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '12px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <img
              src={video.thumbnail}
              alt={video.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {video.duration && (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                backgroundColor: 'rgba(0,0,0,0.8)',
                color: 'white',
                padding: '2px 4px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500'
              }}>
                {formatDuration(video.duration)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', position: 'relative' }}>
            {/* Channel Avatar */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--bg-secondary)',
              flexShrink: 0,
              overflow: 'hidden'
            }}>
              {video.channelAvatar && (
                <img src={video.channelAvatar} alt={video.channelTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  lineHeight: '1.4',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }} title={video.title}>
                  {video.title}
                </h3>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={toggleMenu}
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                  >
                    <MoreVertical size={20} color="var(--text-primary)" />
                  </button>

                  {showMenu && (
                    <div
                      ref={menuRef}
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '4px 0',
                        zIndex: 10,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        minWidth: '120px'
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div
                        onClick={handleUpdate}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: 'var(--text-primary)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {video.isCustom ? <Edit size={16} /> : <RefreshCw size={16} />}
                        <span>{video.isCustom ? 'Edit' : 'Update'}</span>
                      </div>
                      <div
                        onClick={handleRemove}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#ff4d4d'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Trash2 size={16} />
                        <span>Remove</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <div>{video.channelTitle}</div>
                <div>{video.viewCount ? `${formatViewCount(video.viewCount)} views` : ''} • {new Date(video.publishedAt).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {video.isCustom && (
        <CustomVideoModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleCustomUpdate}
          initialData={video}
        />
      )}
    </>
  );
};

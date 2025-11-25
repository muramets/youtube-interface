import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit2, ListPlus, Trash2, RefreshCw, Clock, Share2, ListMinus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useVideo } from '../../context/VideoContext';
import type { VideoDetails } from '../../utils/youtubeApi';
import { CustomVideoModal } from './CustomVideoModal';
import { formatViewCount, formatDuration } from '../../utils/formatUtils';
import { AddToPlaylistModal } from '../Playlist/AddToPlaylistModal';
import { ConfirmationModal } from '../Shared/ConfirmationModal';

interface VideoCardProps {
  video: VideoDetails;
  playlistId?: string;
  onMenuOpenChange?: (isOpen: boolean) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, playlistId, onMenuOpenChange }) => {
  const navigate = useNavigate();
  const { deleteVideo, updateVideo, removeVideoFromPlaylist } = useVideo();
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    action: 'removeFromPlaylist' | 'deleteCustom' | 'removeVideo' | null;
    title: string;
    message: string;
  }>({ isOpen: false, action: null, title: '', message: '' });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
        onMenuOpenChange?.(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onMenuOpenChange]);

  const handleVideoClick = () => {
    if (playlistId) {
      navigate(`/watch/${video.id}?list=${playlistId}`);
    } else {
      navigate(`/watch/${video.id}`);
    }
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !showMenu;
    setShowMenu(newState);
    onMenuOpenChange?.(newState);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);

    if (playlistId) {
      setConfirmation({
        isOpen: true,
        action: 'removeFromPlaylist',
        title: 'Remove from Playlist',
        message: 'Are you sure you want to remove this video from the playlist?'
      });
    } else if (video.isCustom) {
      setConfirmation({
        isOpen: true,
        action: 'deleteCustom',
        title: 'Delete Custom Video',
        message: 'Are you sure you want to delete this custom video? This action cannot be undone.'
      });
    } else {
      setConfirmation({
        isOpen: true,
        action: 'removeVideo',
        title: 'Remove Video',
        message: 'Are you sure you want to remove this video?'
      });
    }
  };

  const handleConfirm = () => {
    if (confirmation.action === 'removeFromPlaylist' && playlistId) {
      removeVideoFromPlaylist(playlistId, video.id);
    } else if (confirmation.action === 'deleteCustom' || confirmation.action === 'removeVideo') {
      deleteVideo(video.id);
    }
    setConfirmation({ ...confirmation, isOpen: false });
  };

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPlaylistModal(true);
    setShowMenu(false);
  };

  const handleUpdate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (video.isCustom) {
      setShowEditModal(true);
    } else {
      await updateVideo(video.id);
    }
  };

  return (
    <>
      <div
        className="video-card-container clickable"
        onClick={handleVideoClick}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer' }}
      >
        <div className="video-card-hover-bg"></div>

        {/* Thumbnail Container */}
        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9' }}>
          <img
            src={video.isCustom ? (video.customImage || video.thumbnail) : video.thumbnail}
            alt={video.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '2px 4px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500'
          }}>
            {formatDuration(video.duration)}
          </div>
        </div>

        {/* Info Container */}
        <div style={{ display: 'flex', gap: '12px', paddingRight: '24px', position: 'relative' }}>
          {/* Avatar */}
          <div style={{ flexShrink: 0 }}>
            {video.channelAvatar ? (
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden' }}>
                <img src={video.channelAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#ccc' }}></div>
            )}
          </div>

          {/* Text Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
            <h3 style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: '600',
              lineHeight: '1.4',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              color: 'var(--text-primary)'
            }}>
              {video.title}
            </h3>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              <div>{video.channelTitle}</div>
              <div>
                {video.viewCount ? `${formatViewCount(video.viewCount)} views` : ''} • {new Date(video.publishedAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Menu Button */}
          <div style={{ position: 'absolute', top: 0, right: -12 }}>
            <button
              className="hover-bg"
              onClick={handleMenuClick}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '50%',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <MoreVertical size={20} />
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <div
                ref={menuRef}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  padding: '8px 0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  zIndex: 100,
                  width: '200px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {!playlistId && (
                  <div
                    className="hover-bg"
                    onClick={handleAddToPlaylist}
                    style={{
                      padding: '8px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <ListPlus size={20} />
                    <span>Save to playlist</span>
                  </div>
                )}

                <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '4px 0' }}></div>

                {(video.isCustom || playlistId) && (
                  <>
                    {video.isCustom && (
                      <div
                        className="hover-bg"
                        onClick={handleUpdate}
                        style={{
                          padding: '8px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit2 size={20} />
                        <span>Edit</span>
                      </div>
                    )}

                    <div
                      className="hover-bg"
                      onClick={handleRemove}
                      style={{
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={20} />
                      <span>{playlistId ? 'Remove from playlist' : 'Delete'}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditModal && video.isCustom && (
        <CustomVideoModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={(updatedVideo) => {
            updateVideo(video.id, updatedVideo);
            setShowEditModal(false);
          }}
          initialData={video}
        />
      )}

      {showPlaylistModal && (
        <AddToPlaylistModal
          isOpen={showPlaylistModal}
          onClose={() => setShowPlaylistModal(false)}
          video={video}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
        onConfirm={handleConfirm}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.action === 'removeFromPlaylist' ? 'Remove' : 'Delete'}
      />
    </>
  );
};

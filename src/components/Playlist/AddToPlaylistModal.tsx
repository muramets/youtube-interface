import React from 'react';
import { createPortal } from 'react-dom';
import { useVideo } from '../../context/VideoContext';
import { X, Plus, Check } from 'lucide-react';

interface AddToPlaylistModalProps {
    videoId: string;
    onClose: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({ videoId, onClose }) => {
    const { playlists, createPlaylist, addVideoToPlaylist } = useVideo();
    const [isCreating, setIsCreating] = React.useState(false);
    const [newPlaylistName, setNewPlaylistName] = React.useState('');

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPlaylistName.trim()) {
            createPlaylist(newPlaylistName.trim());
            setNewPlaylistName('');
            setIsCreating(false);
        }
    };

    const togglePlaylist = (playlistId: string, isInPlaylist: boolean) => {
        if (!isInPlaylist) {
            addVideoToPlaylist(playlistId, videoId);
        } else {
            // Optional: Remove from playlist if already there?
            // The prompt says "video separately removed from watch page and from playlist".
            // Usually "Add to Playlist" toggles. I'll make it toggle for better UX.
            // But I need `removeVideoFromPlaylist` here.
            // For now, let's just support ADDING as per the name.
            // Actually, standard YouTube behavior is a checkbox list.
        }
    };

    return createPortal(
        <div
            className="animate-fade-in"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2000
            }}
            onClick={onClose}
        >
            <div
                className="animate-scale-in-center"
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    width: '300px',
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
            >
                <div style={{
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Save to playlist</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ padding: '8px 0', overflowY: 'auto' }}>
                    {playlists.map(playlist => {
                        const isInPlaylist = playlist.videoIds.includes(videoId);
                        return (
                            <div
                                key={playlist.id}
                                className="hover-bg"
                                style={{
                                    padding: '8px 16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    cursor: 'pointer'
                                }}
                                onClick={() => togglePlaylist(playlist.id, isInPlaylist)}
                            >
                                <div style={{
                                    width: '20px',
                                    height: '20px',
                                    border: '1px solid var(--text-secondary)',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: isInPlaylist ? 'var(--text-primary)' : 'transparent'
                                }}>
                                    {isInPlaylist && <Check size={14} color="var(--bg-primary)" />}
                                </div>
                                <span>{playlist.name}</span>
                            </div>
                        );
                    })}
                </div>

                <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
                    {!isCreating ? (
                        <button
                            onClick={() => setIsCreating(true)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '14px',
                                fontWeight: '500'
                            }}
                        >
                            <Plus size={20} />
                            Create new playlist
                        </button>
                    ) : (
                        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input
                                autoFocus
                                type="text"
                                placeholder="Name"
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                style={{
                                    padding: '8px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border)',
                                    backgroundColor: 'var(--bg-primary)',
                                    color: 'var(--text-primary)'
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    type="submit"
                                    disabled={!newPlaylistName.trim()}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#3ea6ff',
                                        fontWeight: 'bold',
                                        cursor: newPlaylistName.trim() ? 'pointer' : 'not-allowed',
                                        opacity: newPlaylistName.trim() ? 1 : 0.5
                                    }}
                                >
                                    Create
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

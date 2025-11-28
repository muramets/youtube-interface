import React, { useState, useRef } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import { useVideos } from '../../context/VideosContext';
import { type Playlist } from '../../services/playlistService';

interface PlaylistEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, updates: Partial<Playlist>) => void;
    playlist: Playlist;
}

export const PlaylistEditModal: React.FC<PlaylistEditModalProps> = ({ isOpen, onClose, onSave, playlist }) => {
    const { videos } = useVideos();
    const [name, setName] = useState(playlist.name);
    const [coverImage, setCoverImage] = useState(playlist.coverImage || '');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const processFile = (file: File) => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setCoverImage(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeleteCover = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Revert to the thumbnail of the last video in the playlist
        if (playlist.videoIds.length > 0) {
            const lastVideoId = playlist.videoIds[playlist.videoIds.length - 1];
            const lastVideo = videos.find(v => v.id === lastVideoId);
            if (lastVideo) {
                setCoverImage(lastVideo.thumbnail);
                return;
            }
        }
        setCoverImage('');
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            processFile(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(playlist.id, { name, coverImage });
        onClose();
    };

    return (
        <div
            className="animate-fade-in"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.7)',
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
                    width: '500px',
                    maxWidth: '90vw',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{
                    padding: '16px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Edit Playlist</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Name Input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{
                                padding: '10px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '16px'
                            }}
                            required
                        />
                    </div>

                    {/* Cover Image Upload */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Cover Image</label>
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${isDragging ? '#3ea6ff' : 'var(--border)'}`,
                                borderRadius: '8px',
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                cursor: 'pointer',
                                backgroundColor: isDragging ? 'rgba(62, 166, 255, 0.1)' : 'transparent',
                                transition: 'all 0.2s',
                                minHeight: '150px'
                            }}
                        >
                            {coverImage ? (
                                <div style={{ position: 'relative', width: '100%', height: '200px' }}>
                                    <img src={coverImage} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />

                                    {/* Delete Button */}
                                    <button
                                        type="button"
                                        onClick={handleDeleteCover}
                                        className="delete-btn"
                                        style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            backgroundColor: 'rgba(0,0,0,0.6)',
                                            border: 'none',
                                            borderRadius: '4px',
                                            padding: '6px',
                                            cursor: 'pointer',
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            zIndex: 10
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                    <style>{`
                                        .delete-btn:hover {
                                            background-color: #ff4d4d !important;
                                        }
                                    `}</style>

                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        backgroundColor: 'rgba(0,0,0,0.5)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: 0,
                                        transition: 'opacity 0.2s',
                                        borderRadius: '4px'
                                    }} className="hover-overlay">
                                        <span style={{ color: 'white', fontWeight: 'bold' }}>Change Image</span>
                                    </div>
                                    <style>{`.hover-overlay:hover { opacity: 1; }`}</style>
                                </div>
                            ) : (
                                <>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '50%',
                                        backgroundColor: 'var(--bg-primary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <Upload size={32} color="var(--text-secondary)" />
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <p style={{ margin: '0 0 4px 0', fontWeight: '500' }}>Click or drag and drop</p>
                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>JPG, PNG or GIF</p>
                                    </div>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleFileSelect}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '10px 24px',
                                borderRadius: '18px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontWeight: '500'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                padding: '10px 24px',
                                borderRadius: '18px',
                                border: 'none',
                                backgroundColor: '#3ea6ff',
                                color: 'black',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

import React, { useState, useRef, useEffect } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';
import type { VideoDetails } from '../../utils/youtubeApi';
import { resizeImage } from '../../utils/imageUtils';

interface CustomVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (video: Omit<VideoDetails, 'id'>) => void;
    initialData?: VideoDetails;
}

export const CustomVideoModal: React.FC<CustomVideoModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [title, setTitle] = useState('');
    const [viewCount, setViewCount] = useState('');
    const [duration, setDuration] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setTitle(initialData.title);
                setViewCount(initialData.viewCount || '0');
                setDuration(initialData.duration || '');
                setCoverImage(initialData.customImage || initialData.thumbnail);
            } else {
                setTitle('');
                setViewCount('');
                setDuration('');
                setCoverImage(null);
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;



    // ...

    const handleFile = async (file: File) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const resizedImage = await resizeImage(file, 800, 0.8); // 800px width, 80% quality
                setCoverImage(resizedImage);
            } catch (error) {
                console.error('Error resizing image:', error);
                alert('Failed to process image. Please try another one.');
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleSave = () => {
        if (!title || !coverImage) {
            alert('Please provide a title and a cover image.');
            return;
        }

        const videoData: Omit<VideoDetails, 'id'> = {
            title,
            thumbnail: coverImage,
            channelTitle: localStorage.getItem('youtube_profile_name') || 'My Channel',
            channelAvatar: localStorage.getItem('youtube_profile_avatar') || '',
            publishedAt: initialData ? initialData.publishedAt : new Date().toISOString(),
            viewCount: viewCount,
            duration: duration || '0:00',
            isCustom: true,
            customImage: coverImage
        };

        onSave(videoData);
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
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={onClose}
        >
            <div
                className="animate-scale-in-center"
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    padding: '24px',
                    width: '500px',
                    maxWidth: '90%',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>{initialData ? 'Edit Video' : 'Create My Video'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Cover Image Upload */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Cover Image</label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            style={{
                                width: '100%',
                                aspectRatio: '16/9',
                                borderRadius: '8px',
                                backgroundColor: 'var(--bg-primary)',
                                border: `2px dashed ${isDragging ? '#3ea6ff' : 'var(--border)'} `,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {coverImage ? (
                                <img src={coverImage} alt="Cover Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                    <ImageIcon size={40} />
                                    <span style={{ fontSize: '14px' }}>Click or drag to upload cover</span>
                                </div>
                            )}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                            accept="image/*"
                            style={{ display: 'none' }}
                        />
                    </div>

                    {/* Title Input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Video Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter video title..."
                            style={{
                                padding: '10px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    {/* View Count Input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>View Count</label>
                        <input
                            type="text"
                            value={viewCount}
                            onChange={(e) => setViewCount(e.target.value)}
                            placeholder="e.g. 1.5M or 1500000"
                            style={{
                                padding: '10px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    {/* Duration Input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Duration</label>
                        <input
                            type="text"
                            value={duration}
                            onChange={(e) => setDuration(e.target.value)}
                            placeholder="e.g. 10:05"
                            style={{
                                padding: '10px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
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
                            onClick={handleSave}
                            style={{
                                padding: '8px 16px',
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
                </div>
            </div>
        </div>
    );
};

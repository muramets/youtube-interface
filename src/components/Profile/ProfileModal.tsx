import React, { useState, useRef, useEffect } from 'react';
import { X, User, Camera } from 'lucide-react';
import { useUserProfile } from '../../context/UserProfileContext';
import { resizeImage } from '../../utils/imageUtils';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { channelName, avatarDataUrl, updateProfile } = useUserProfile();
    const [name, setName] = useState(channelName);
    const [previewUrl, setPreviewUrl] = useState<string | null>(avatarDataUrl);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setName(channelName);
            setPreviewUrl(avatarDataUrl);
        }
    }, [isOpen, channelName, avatarDataUrl]);

    if (!isOpen) return null;



    // ...

    const handleFile = async (file: File) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const resizedImage = await resizeImage(file, 400, 0.8); // 400px width for avatar
                setPreviewUrl(resizedImage);
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
        updateProfile(name, previewUrl);
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
                    width: '400px',
                    maxWidth: '90%',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>Edit Profile</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <X size={24} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Avatar Upload */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            style={{
                                width: '100px',
                                height: '100px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--bg-primary)',
                                border: `2px dashed ${isDragging ? '#3ea6ff' : 'var(--border)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {previewUrl ? (
                                <img src={previewUrl} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <User size={40} color="var(--text-secondary)" />
                            )}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                height: '30px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Camera size={16} color="white" />
                            </div>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                            accept="image/*"
                            style={{ display: 'none' }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Click or drag to upload
                        </span>
                    </div>

                    {/* Name Input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Channel Name</label>
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

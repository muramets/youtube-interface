import React, { useState, useRef, useEffect } from 'react';
import { X, User, Camera } from 'lucide-react';
import { useChannelStore } from '../../core/stores/channelStore';
import { useAuth } from '../../core/hooks/useAuth';
import { resizeImage } from '../../core/utils/imageUtils';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
    const { currentChannel, updateChannel } = useChannelStore();
    const { user } = useAuth();
    const [name, setName] = useState(currentChannel?.name || '');
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentChannel?.avatar || null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && currentChannel) {
            setTimeout(() => {
                setName(currentChannel.name);
                setPreviewUrl(currentChannel.avatar || null);
            }, 0);
        }
    }, [isOpen, currentChannel]);

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

    const handleSave = async () => {
        if (user && currentChannel) {
            await updateChannel(user.uid, currentChannel.id, { name, avatar: previewUrl || undefined });
        }
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl p-6 w-[400px] max-w-[90%] border border-border text-text-primary animate-scale-in-center shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="m-0 text-xl font-bold">Edit Profile</h2>
                    <button onClick={onClose} className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-col gap-5">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center gap-3">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            className={`
                                w-[100px] h-[100px] rounded-full bg-bg-primary flex items-center justify-center cursor-pointer relative overflow-hidden
                                border-2 ${isDragging ? 'border-[#3ea6ff]' : 'border-border'}
                            `}
                        >
                            {previewUrl ? (
                                <img src={previewUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                            ) : (
                                <User size={40} className="text-text-secondary" />
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 h-[30px] flex items-center justify-center">
                                <Camera size={16} className="text-white" />
                            </div>
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                            accept="image/*"
                            className="hidden"
                        />
                        <span className="text-xs text-text-secondary">
                            Click or drag to upload
                        </span>
                    </div>

                    {/* Name Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-text-secondary">Channel Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="p-2.5 rounded border border-border bg-bg-primary text-text-primary text-base outline-none focus:border-text-primary transition-colors"
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-full border-none bg-transparent text-text-primary cursor-pointer font-medium hover:bg-hover-bg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 rounded-full border-none bg-[#3ea6ff] text-black cursor-pointer font-bold hover:bg-[#3ea6ff]/90 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

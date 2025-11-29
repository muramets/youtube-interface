import React, { useState, useRef } from 'react';
import { X, User, Camera } from 'lucide-react';
import { useChannelStore } from '../../stores/channelStore';
import { useAuthStore } from '../../stores/authStore';
import { resizeImage } from '../../utils/imageUtils';

interface CreateChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({ isOpen, onClose }) => {
    const { addChannel } = useChannelStore();
    const { user } = useAuthStore();
    const [name, setName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleFile = async (file: File) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const resizedImage = await resizeImage(file, 400, 0.8);
                setAvatarUrl(resizedImage);
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
        if (!name.trim() || !user) return;
        setLoading(true);
        try {
            await addChannel(user.uid, name, avatarUrl || undefined);
            setName('');
            setAvatarUrl('');
            onClose();
        } catch (error) {
            console.error("Failed to create channel", error);
            alert("Failed to create channel");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-bg-secondary rounded-xl w-full max-w-md p-6 relative shadow-2xl animate-scale-in border border-border">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <X size={24} />
                </button>

                <h2 className="text-xl font-bold text-text-primary mb-6">Create New Channel</h2>

                <div className="flex flex-col gap-6">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center gap-3">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            className={`w-24 h-24 rounded-full bg-bg-primary flex items-center justify-center cursor-pointer relative overflow-hidden border-2 ${isDragging ? 'border-text-primary' : 'border-dashed border-border'}`}
                        >
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                            ) : (
                                <User size={40} className="text-text-secondary" />
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 h-8 flex items-center justify-center">
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

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-text-secondary">Channel Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter channel name"
                            autoFocus
                            className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-text-primary placeholder-text-secondary transition-colors"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                            }}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-text-secondary hover:text-text-primary font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading || !name.trim()}
                            className="px-6 py-2 bg-text-primary text-bg-primary hover:opacity-90 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                        >
                            {loading ? 'Creating...' : 'Create'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

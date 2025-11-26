import React, { useState, useEffect, useRef } from 'react';
import { X, User, Camera } from 'lucide-react';
import { useChannel, type Channel } from '../../context/ChannelContext';
import { resizeImage } from '../../utils/imageUtils';

interface EditChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
    channel: Channel;
}

export const EditChannelModal: React.FC<EditChannelModalProps> = ({ isOpen, onClose, channel }) => {
    const [name, setName] = useState(channel.name);
    const [avatarUrl, setAvatarUrl] = useState(channel.avatar || '');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { updateChannel, deleteChannel } = useChannel();
    const [loading, setLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(channel.name);
            setAvatarUrl(channel.avatar || '');
            setShowDeleteConfirm(false);
        }
    }, [isOpen, channel]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await updateChannel(channel.id, { name, avatar: avatarUrl });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        try {
            await deleteChannel(channel.id);
            onClose();
        } catch (error) {
            console.error('Error deleting channel:', error);
            alert('Failed to delete channel.');
        } finally {
            setLoading(false);
        }
    };

    if (showDeleteConfirm) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in">
                <div className="bg-[#1f1f1f] rounded-xl w-full max-w-sm p-6 relative shadow-2xl animate-scale-in border border-red-900/50">
                    <h3 className="text-xl font-bold text-white mb-2">Delete Channel?</h3>
                    <p className="text-gray-400 mb-6 text-sm">
                        Are you sure you want to delete <strong>{channel.name}</strong>? This action cannot be undone and all videos, playlists, and settings associated with this channel will be permanently lost.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-4 py-2 text-gray-300 hover:text-white font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
                        >
                            {loading ? 'Deleting...' : 'Delete Forever'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
            <div className="bg-[#1f1f1f] rounded-xl w-full max-w-md p-6 relative shadow-2xl animate-scale-in">
                {/* ... (existing modal content) */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    <X size={24} />
                </button>

                <h2 className="text-xl font-bold text-white mb-6">Edit Channel</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Avatar Upload */}
                    <div className="flex flex-col items-center gap-3">
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            className={`w-24 h-24 rounded-full bg-[#2a2a2a] flex items-center justify-center cursor-pointer relative overflow-hidden border-2 ${isDragging ? 'border-blue-500' : 'border-dashed border-gray-600'}`}
                        >
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                            ) : (
                                <User size={40} className="text-gray-500" />
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
                        <span className="text-xs text-gray-400">
                            Click or drag to upload
                        </span>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Channel Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#2a2a2a] border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                            placeholder="Enter channel name"
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                        <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="text-red-500 hover:text-red-400 text-sm font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                        >
                            Delete Channel
                        </button>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-gray-300 hover:text-white font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !name.trim()}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

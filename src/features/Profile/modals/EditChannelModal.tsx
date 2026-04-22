import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Camera, Target } from 'lucide-react';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useTrendStore } from '../../../core/stores/trends/trendStore';
import { useAuth } from '../../../core/hooks/useAuth';
import { type Channel } from '../../../core/services/channelService';
import { resizeImage } from '../../../core/utils/imageUtils';
import { logger } from '../../../core/utils/logger';

interface EditChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
    channel: Channel;
}

export const EditChannelModal: React.FC<EditChannelModalProps> = ({ isOpen, onClose, channel }) => {
    const [name, setName] = useState(channel.name);
    const [avatarUrl, setAvatarUrl] = useState(channel.avatar || '');
    const [targetNicheIds, setTargetNicheIds] = useState<string[]>(channel.targetNicheIds || []);
    const [targetNicheNames, setTargetNicheNames] = useState<string[]>(channel.targetNicheNames || []);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { updateChannel, removeChannel } = useChannelStore();
    const niches = useTrendStore(state => state.niches);
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(channel.name);
            setAvatarUrl(channel.avatar || '');
            setTargetNicheIds(channel.targetNicheIds || []);
            setTargetNicheNames(channel.targetNicheNames || []);
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
        if (!name.trim() || !user) return;

        setLoading(true);
        try {
            await updateChannel(user.uid, channel.id, { name, avatar: avatarUrl });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveTargetNiche = async (nicheId: string) => {
        if (!user) return;

        const prevIds = targetNicheIds;
        const prevNames = targetNicheNames;
        const newIds = prevIds.filter(id => id !== nicheId);
        // Rebuild names from remaining IDs against the live niches list so cached names stay consistent.
        const newNames = newIds.map(id => {
            const niche = niches.find(n => n.id === id);
            return niche?.name ?? prevNames[prevIds.indexOf(id)] ?? '';
        }).filter(Boolean);

        setTargetNicheIds(newIds);
        setTargetNicheNames(newNames);

        try {
            await updateChannel(user.uid, channel.id, {
                targetNicheIds: newIds,
                targetNicheNames: newNames
            });
        } catch (error) {
            logger.error('Failed to remove target niche', { error, component: 'EditChannelModal', userId: user.uid, channelId: channel.id, nicheId });
            setTargetNicheIds(prevIds);
            setTargetNicheNames(prevNames);
        }
    };

    const handleDelete = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await removeChannel(user.uid, channel.id);
            onClose();
        } catch (error) {
            console.error('Error deleting channel:', error);
            alert('Failed to delete channel.');
        } finally {
            setLoading(false);
        }
    };

    if (showDeleteConfirm) {
        return createPortal(
            <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="bg-bg-secondary rounded-xl w-full max-w-sm p-6 relative shadow-2xl animate-scale-in border border-border">
                    <h3 className="text-xl font-bold text-text-primary mb-2">Delete Channel?</h3>
                    <p className="text-text-secondary mb-6 text-sm">
                        Are you sure you want to delete <strong>{channel.name}</strong>? This action cannot be undone and all videos, playlists, and settings associated with this channel will be permanently lost.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-4 py-2 text-text-secondary hover:text-text-primary font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                        >
                            {loading ? 'Deleting...' : 'Delete Forever'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    const isDirty = name !== channel.name || avatarUrl !== (channel.avatar || '');

    return createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-bg-secondary rounded-xl w-full max-w-md p-6 relative shadow-2xl animate-scale-in">
                {/* ... (existing modal content) */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <X size={24} />
                </button>

                <h2 className="text-xl font-bold text-text-primary mb-6">Edit Channel</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
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

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                            Channel Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-text-primary transition-colors"
                            placeholder="Enter channel name"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            Target Niches
                        </label>
                        {targetNicheIds.length === 0 ? (
                            <p className="text-xs text-text-tertiary">
                                No target niches. Mark a niche as target in the Trends sidebar to see it here.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1.5">
                                {targetNicheIds.map((nicheId, idx) => {
                                    // Prefer live name from trend store; fall back to the cached copy
                                    // so channels that aren't the currentChannel still render correctly.
                                    const liveNiche = niches.find(n => n.id === nicheId);
                                    const displayName = liveNiche?.name ?? targetNicheNames[idx] ?? 'Unknown niche';
                                    return (
                                        <li
                                            key={nicheId}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-bg-primary border border-border rounded-lg"
                                        >
                                            <Target size={14} className="text-emerald-400 shrink-0" />
                                            <span className="flex-1 text-sm text-text-primary truncate">{displayName}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveTargetNiche(nicheId)}
                                                className="p-1 -mr-1 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                aria-label={`Remove target niche ${displayName}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-2">
                        <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="text-red-500 hover:text-red-400 text-sm font-medium px-4 py-2 rounded hover:bg-red-500/10 transition-colors"
                        >
                            Delete Channel
                        </button>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-text-secondary hover:text-text-primary font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !isDirty || !name.trim()}
                                className={`px-6 py-2 rounded-lg font-medium transition-all relative overflow-hidden
                                    ${(loading || !isDirty || !name.trim())
                                        ? 'bg-bg-primary text-text-secondary cursor-default opacity-50'
                                        : 'bg-text-primary text-bg-primary cursor-pointer hover:opacity-90'
                                    }
                                    ${loading ? 'cursor-wait' : ''}
                                `}
                            >
                                {loading && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent animate-shimmer bg-[length:200%_100%]"></div>
                                )}
                                <span className="relative z-10">Save</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

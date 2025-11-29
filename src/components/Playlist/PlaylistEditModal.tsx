import React, { useState, useRef } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import { useVideosStore } from '../../stores/videosStore';
import { type Playlist } from '../../services/playlistService';

interface PlaylistEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, updates: Partial<Playlist>) => void;
    playlist: Playlist;
}

export const PlaylistEditModal: React.FC<PlaylistEditModalProps> = ({ isOpen, onClose, onSave, playlist }) => {
    const { videos } = useVideosStore();
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
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[500px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <h2 className="text-xl font-bold text-text-primary m-0">Edit Playlist</h2>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
                    {/* Name Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-text-secondary">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="p-2.5 rounded border border-border bg-bg-primary text-text-primary text-base outline-none focus:border-text-primary transition-colors"
                            required
                        />
                    </div>

                    {/* Cover Image Upload */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm text-text-secondary">Cover Image</label>
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`
                                border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all min-h-[150px]
                                ${isDragging ? 'border-[#3ea6ff] bg-[#3ea6ff]/10' : 'border-border bg-transparent'}
                            `}
                        >
                            {coverImage ? (
                                <div className="relative w-full h-[200px] group">
                                    <img src={coverImage} alt="Cover" className="w-full h-full object-cover rounded" />

                                    {/* Delete Button */}
                                    <button
                                        type="button"
                                        onClick={handleDeleteCover}
                                        className="absolute top-2 right-2 bg-black/60 border-none rounded p-1.5 cursor-pointer text-white flex items-center justify-center z-10 hover:bg-red-600 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>

                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                        <span className="text-white font-bold">Change Image</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="w-16 h-16 rounded-full bg-bg-primary flex items-center justify-center">
                                        <Upload size={32} className="text-text-secondary" />
                                    </div>
                                    <div className="text-center">
                                        <p className="m-0 mb-1 font-medium text-text-primary">Click or drag and drop</p>
                                        <p className="m-0 text-xs text-text-secondary">JPG, PNG or GIF</p>
                                    </div>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-full border-none bg-transparent text-text-primary cursor-pointer font-medium hover:bg-hover-bg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2.5 rounded-full border-none bg-[#3ea6ff] text-black cursor-pointer font-bold hover:bg-[#3ea6ff]/90 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

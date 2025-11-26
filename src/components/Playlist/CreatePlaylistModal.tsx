import React, { useState } from 'react';
import { X, ListPlus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useVideo } from '../../context/VideoContext';

interface CreatePlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({ isOpen, onClose }) => {
    const { createPlaylist } = useVideo();
    const [name, setName] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        createPlaylist(name.trim());
        setName('');
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <ListPlus />
                        Create New Playlist
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-hover-bg rounded-full transition-colors border-none cursor-pointer text-text-primary"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">
                            Playlist Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Awesome Playlist"
                            className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:border-blue-500 outline-none transition-colors"
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg font-medium text-text-primary hover:bg-hover-bg transition-colors border-none cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className={`px-4 py-2 rounded-lg font-medium text-black transition-colors border-none cursor-pointer ${!name.trim() ? 'bg-gray-500 cursor-not-allowed' : 'bg-[#3ea6ff] hover:bg-[#3ea6ff]/90'}`}
                        >
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

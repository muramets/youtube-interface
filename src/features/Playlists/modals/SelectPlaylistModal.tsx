/**
 * SelectPlaylistModal
 * 
 * One-shot playlist selection modal.
 * Unlike AddToPlaylistModal (toggle-based), this modal selects a single playlist and closes.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { usePlaylists } from '../../../core/hooks/usePlaylists';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannelStore } from '../../../core/stores/channelStore';
import { X, Plus, FolderOpen } from 'lucide-react';

interface SelectPlaylistModalProps {
    isOpen: boolean;
    onSelect: (playlistId: string, playlistName: string) => void;
    onClose: () => void;
    title?: string;
}

export const SelectPlaylistModal: React.FC<SelectPlaylistModalProps> = ({
    isOpen,
    onSelect,
    onClose,
    title = 'Select playlist'
}) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, createPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const [isCreating, setIsCreating] = React.useState(false);
    const [newPlaylistName, setNewPlaylistName] = React.useState('');

    // Sort playlists by most recently updated
    const sortedPlaylists = React.useMemo(() => {
        return [...playlists].sort((a, b) => {
            const timeA = a.updatedAt || a.createdAt;
            const timeB = b.updatedAt || b.createdAt;
            return timeB - timeA;
        });
    }, [playlists]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = newPlaylistName.trim();
        if (trimmedName && user && currentChannel) {
            const newPlaylistId = await createPlaylist({ name: trimmedName, videoIds: [] });
            if (newPlaylistId) {
                onSelect(newPlaylistId, trimmedName);
            }
            setNewPlaylistName('');
            setIsCreating(false);
        }
    };

    const handleSelect = (playlistId: string, playlistName: string) => {
        onSelect(playlistId, playlistName);
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[400px] max-h-[80vh] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-4 py-4 flex items-center justify-between border-b border-border">
                    <h3 className="m-0 text-base font-bold text-text-primary">{title}</h3>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Playlist List */}
                <div className="py-2 overflow-y-auto custom-scrollbar flex-1">
                    {sortedPlaylists.length === 0 ? (
                        <div className="px-4 py-8 text-center text-text-secondary">
                            <FolderOpen size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No playlists yet</p>
                        </div>
                    ) : (
                        sortedPlaylists.map(playlist => (
                            <div
                                key={playlist.id}
                                className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-hover-bg transition-colors"
                                onClick={() => handleSelect(playlist.id, playlist.name)}
                            >
                                <span className="text-text-primary">{playlist.name}</span>
                                <span className="text-text-secondary text-xs ml-auto">
                                    {playlist.videoIds.length} videos
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {/* Create New */}
                <div className="p-4 border-t border-border">
                    {!isCreating ? (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="bg-transparent border-none text-text-primary cursor-pointer flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity"
                        >
                            <Plus size={20} />
                            Create new playlist
                        </button>
                    ) : (
                        <form onSubmit={handleCreate} className="flex flex-col gap-3">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Name"
                                value={newPlaylistName}
                                onChange={e => setNewPlaylistName(e.target.value)}
                                className="p-2 rounded border border-border bg-bg-primary text-text-primary outline-none focus:border-text-primary transition-colors"
                                onKeyDown={(e) => e.stopPropagation()}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreating(false);
                                        setNewPlaylistName('');
                                    }}
                                    className="bg-transparent border-none text-text-secondary cursor-pointer text-sm hover:opacity-80"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newPlaylistName.trim()}
                                    className={`bg-transparent border-none font-bold cursor-pointer transition-opacity ${!newPlaylistName.trim() ? 'text-gray-500 cursor-not-allowed' : 'text-[#3ea6ff] hover:opacity-80'}`}
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

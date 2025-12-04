import React from 'react';
import { createPortal } from 'react-dom';
import { usePlaylists } from '../../hooks/usePlaylists';
import { useAuth } from '../../hooks/useAuth';
import { useChannelStore } from '../../stores/channelStore';
import { X, Plus, Check } from 'lucide-react';

interface AddToPlaylistModalProps {
    videoId: string;
    onClose: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({ videoId, onClose }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { playlists, createPlaylist, addVideoToPlaylist, removeVideoFromPlaylist } = usePlaylists(user?.uid || '', currentChannel?.id || '');
    const [isCreating, setIsCreating] = React.useState(false);
    const [newPlaylistName, setNewPlaylistName] = React.useState('');

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (newPlaylistName.trim() && user && currentChannel) {
            createPlaylist({ name: newPlaylistName.trim() });
            setNewPlaylistName('');
            setIsCreating(false);
        }
    };

    const togglePlaylist = (playlistId: string, isInPlaylist: boolean) => {
        if (!user || !currentChannel) return;
        if (!isInPlaylist) {
            addVideoToPlaylist({ playlistId, videoId });
        } else {
            removeVideoFromPlaylist({ playlistId, videoId });
        }
    };

    return createPortal(

        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[300px] max-h-[80vh] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-4 py-4 flex items-center justify-between border-b border-border">
                    <h3 className="m-0 text-base font-bold text-text-primary">Save to playlist</h3>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-text-primary cursor-pointer hover:opacity-70 transition-opacity"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="py-2 overflow-y-auto custom-scrollbar">
                    {playlists.map(playlist => {
                        const isInPlaylist = playlist.videoIds.includes(videoId);
                        return (
                            <div
                                key={playlist.id}
                                className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-hover-bg transition-colors"
                                onClick={() => togglePlaylist(playlist.id, isInPlaylist)}
                            >
                                <div className={`w-5 h-5 border border-text-secondary rounded flex items-center justify-center ${isInPlaylist ? 'bg-text-primary border-text-primary' : 'bg-transparent'}`}>
                                    {isInPlaylist && <Check size={14} className="text-bg-primary" />}
                                </div>
                                <span className="text-text-primary">{playlist.name}</span>
                            </div>
                        );
                    })}
                </div>

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
                            <div className="flex justify-end">
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

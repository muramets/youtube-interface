import React, { useState } from 'react';
import { X, Youtube } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useVideos } from '../../core/hooks/useVideos';

import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useSettings } from '../../core/hooks/useSettings';

interface AddYouTubeVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddYouTubeVideoModal: React.FC<AddYouTubeVideoModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { addVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { generalSettings } = useSettings();
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim() || !user || !currentChannel || !generalSettings.apiKey) {
            if (!generalSettings.apiKey) alert("Please set your YouTube API Key in settings first.");
            return;
        }

        setIsLoading(true);
        const success = await addVideo({ url, apiKey: generalSettings.apiKey });
        setIsLoading(false);

        if (success) {
            setUrl('');
            onClose();
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <Youtube />
                        Add YouTube Video
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
                            YouTube URL
                        </label>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:border-text-primary outline-none transition-colors"
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
                            disabled={isLoading || !url.trim()}
                            className={`px-4 py-2 rounded-lg font-medium text-black transition-colors border-none cursor-pointer ${isLoading || !url.trim() ? 'bg-gray-500 cursor-not-allowed' : 'bg-[#3ea6ff] hover:bg-[#3ea6ff]/90'}`}
                        >
                            {isLoading ? 'Adding...' : 'Add Video'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

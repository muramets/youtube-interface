import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { TrendService } from '../../services/trendService';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { useChannelStore } from '../../stores/channelStore';
import { useUIStore } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';

interface AddChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddChannelModal: React.FC<AddChannelModalProps> = ({ isOpen, onClose }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const { user } = useAuth();
    const { generalSettings } = useSettings();
    const { currentChannel } = useChannelStore();
    const { showToast } = useUIStore();
    const { addNotification } = useNotificationStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim() || !user || !currentChannel) return;

        setIsLoading(true);
        setError('');

        try {
            const apiKey = generalSettings?.apiKey || localStorage.getItem('youtube_api_key') || '';
            if (!apiKey) throw new Error('API Key not found. Please set it in Settings.');

            const { quotaCost } = await TrendService.addTrendChannel(user.uid, currentChannel.id, url, apiKey);

            const successMessage = `Channel added successfully. Quota used: ${quotaCost} units`;

            // Global Toast (persists after modal close)
            showToast(successMessage, 'success');

            // Persistent Notification
            await addNotification({
                title: 'Channel Tracked',
                message: `${successMessage}. Initial sync started.`,
                type: 'success',
                meta: 'Quota',
                link: '/trends'
            });

            onClose();
            setUrl('');

        } catch (err: any) {
            setError(err.message || 'Failed to add channel');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center backdrop-blur-sm"
            style={{ backgroundColor: 'var(--modal-overlay)' }}
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary border border-border rounded-xl w-[400px] shadow-2xl p-6 relative"
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    type="button"
                    className="absolute top-4 right-4 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-text-primary mb-4">Add Competitor Channel</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-text-secondary font-medium tracking-wider uppercase mb-2">
                            Channel URL or Handle
                        </label>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="e.g. @MrBeast or youtube.com/..."
                            className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-text-primary hover:border-text-primary transition-colors placeholder-modal-placeholder"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm">{error}</div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={isLoading || !url.trim()}
                            className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                            {isLoading && <Loader2 size={16} className="animate-spin" />}
                            Add Channel
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

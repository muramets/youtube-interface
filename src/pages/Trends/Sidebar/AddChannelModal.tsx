import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { TrendService } from '../../../core/services/trendService';
import { useAuth } from '../../../core/hooks/useAuth';
import { useApiKey } from '../../../core/hooks/useApiKey';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { logger } from '../../../core/utils/logger';

interface AddChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddChannelModal: React.FC<AddChannelModalProps> = ({ isOpen, onClose }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const { user } = useAuth();
    const { apiKey, hasApiKey } = useApiKey();
    const { currentChannel } = useChannelStore();
    const { showToast } = useUIStore();

    React.useEffect(() => {
        if (isOpen) {
            setUrl('');
            setError('');
        }
    }, [isOpen]);

    const validateInput = (input: string): boolean => {
        const trimmed = input.trim();
        if (!trimmed) return false;
        return trimmed.length > 1;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateInput(url)) {
            setError('Please enter a valid channel handle or ID');
            return;
        }

        if (!user || !currentChannel) {
            setError('Authentication Error. Please refresh.');
            return;
        }

        if (!hasApiKey) {
            setError('API Key is missing. Please configure it in Settings.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const { channel } = await TrendService.addTrendChannel(user.uid, currentChannel.id, url.trim(), apiKey);

            // Dispatch background sync via the same Cloud Function the header Sync button uses.
            // Fire-and-forget: the UI picks up videos from the Firestore subscription once the
            // function writes `lastUpdated`, and the user is notified via the notifications bell.
            TrendService.syncChannelCloud(currentChannel.id, [channel.id], false)
                .catch((err: unknown) => {
                    logger.error('Initial sync dispatch failed', {
                        component: 'AddChannelModal',
                        channelId: channel.id,
                        error: err instanceof Error ? err.message : String(err)
                    });
                    showToast(`Sync for ${channel.title} failed to start. Use the Sync button in the header.`, 'error');
                });

            showToast(`${channel.title} added. Syncing videos in background.`, 'success');
            onClose();
        } catch (err) {
            logger.error('Add channel failed', {
                component: 'AddChannelModal',
                error: err instanceof Error ? err.message : String(err)
            });
            const message = err instanceof Error ? err.message : 'Failed to add channel';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary/90 backdrop-blur-md border border-border rounded-xl w-full max-w-sm shadow-2xl p-5 relative animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                <button
                    onClick={onClose}
                    type="button"
                    className="absolute top-3 right-3 text-text-secondary hover:text-text-primary transition-colors cursor-pointer rounded-full p-1 hover:bg-white/10"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>

                <h2 id="modal-title" className="text-sm font-medium text-text-primary mb-4">Add Competitor Channel</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <input
                            id="channel-url"
                            type="text"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                                if (error) setError('');
                            }}
                            placeholder="@MrBeast or UC..."
                            className={`w-full bg-bg-primary border ${error ? 'border-red-500/50 focus:border-red-500' : 'border-border focus:border-text-secondary'} rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none transition-all placeholder:text-text-tertiary`}
                            autoFocus
                            disabled={isLoading}
                            autoComplete="off"
                        />
                        {error && (
                            <p className="text-red-400 text-xs mt-2">{error}</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors rounded-lg hover:bg-hover"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !url.trim()}
                            className="bg-text-primary text-bg-primary hover:opacity-90 px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Adding...</span>
                                </>
                            ) : (
                                <span>Add</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

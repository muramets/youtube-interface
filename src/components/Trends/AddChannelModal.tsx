import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { TrendService } from '../../services/trendService';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../hooks/useSettings';
import { useChannelStore } from '../../stores/channelStore';
import { Toast } from '../Shared/Toast';

interface AddChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddChannelModal: React.FC<AddChannelModalProps> = ({ isOpen, onClose }) => {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [toastState, setToastState] = useState<{ show: boolean, message: string }>({ show: false, message: '' });

    const { user } = useAuth();
    const { generalSettings } = useSettings();
    const { currentChannel } = useChannelStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim() || !user || !currentChannel) return;

        setIsLoading(true);
        setError('');

        try {
            const apiKey = generalSettings?.apiKey || localStorage.getItem('youtube_api_key') || '';
            if (!apiKey) throw new Error('API Key not found. Please set it in Settings.');

            const { quotaCost } = await TrendService.addTrendChannel(user.uid, currentChannel.id, url, apiKey);

            setToastState({
                show: true,
                message: `Channel added successfully. Quota used: ${quotaCost} units`
            });

            // Delay closing to let the user see the toast? 
            // The request says "toast... after adding".
            // Since the button is inside the modal, if we close instantly, the toast (portal) persists.
            // Let's verify if `Toast` portal survives parent unmount. 
            // React Portals *unmount* if the component that renders them unmounts.
            // So we MUST keep the modal mounted but maybe hidden? Or delay onClose.

            // Actually, correct UX: User adds channel -> Success Toast -> Modal closes.
            // If Modal closes, Toast dies.
            // I will delay onClose by 2s and show success state in modal.

            // Alternative: Pass onSuccess callback to parent, and parent (Sidebar) renders toast.
            // But I am editing this file.
            // Let's try delaying onClose.
            setTimeout(() => {
                onClose();
                setUrl('');
                setToastState(prev => ({ ...prev, show: false })); // Cleanup
            }, 2000);

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
            <Toast
                message={toastState.message}
                isVisible={toastState.show}
                onClose={() => setToastState(prev => ({ ...prev, show: false }))}
                type="success"
            />
        </div>,
        document.body
    );
};

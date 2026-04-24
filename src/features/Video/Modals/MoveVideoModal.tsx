import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, AlertTriangle, Check, Loader2, User } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { VideoService } from '../../../core/services/videoService';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannels } from '../../../core/hooks/useChannels';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { logger } from '../../../core/utils/logger';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import type { Channel } from '../../../core/services/channelService';

interface MoveVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    video: VideoDetails | null;
}

type MoveState = 'selecting' | 'running' | 'success' | 'error';

/**
 * Modal that moves a single video to another user channel via the
 * `moveVideoToChannel` Cloud Function. The function handles atomicity — the
 * video tree is written to the destination, verified, then deleted from
 * source. Playlists in the source that referenced the video are cleaned up
 * automatically by the backend.
 */
export const MoveVideoModal: React.FC<MoveVideoModalProps> = ({ isOpen, onClose, video }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { data: userChannels = [] } = useChannels(user?.uid || '');
    const { showToast } = useUIStore();
    const queryClient = useQueryClient();

    const [state, setState] = useState<MoveState>('selecting');
    const [targetChannelId, setTargetChannelId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const availableTargets = useMemo(() => {
        if (!currentChannel) return [];
        return userChannels.filter(c => c.id !== currentChannel.id);
    }, [userChannels, currentChannel]);

    const handleClose = React.useCallback(() => {
        setState('selecting');
        setTargetChannelId(null);
        setError(null);
        onClose();
    }, [onClose]);

    React.useEffect(() => {
        if (state === 'success') {
            const timer = setTimeout(handleClose, 1200);
            return () => clearTimeout(timer);
        }
    }, [state, handleClose]);

    const handleMove = async () => {
        if (!user?.uid || !currentChannel || !video || !targetChannelId) return;
        setState('running');
        try {
            await VideoService.moveVideoToChannel(currentChannel.id, targetChannelId, video.id);

            // Video is physically gone from the source channel — invalidate so the
            // grid refreshes without the moved video.
            await queryClient.invalidateQueries({ queryKey: ['videos', user.uid, currentChannel.id] });
            // Destination's videos list may also be visible elsewhere — pre-warm it.
            await queryClient.invalidateQueries({ queryKey: ['videos', user.uid, targetChannelId] });

            const targetName = availableTargets.find(c => c.id === targetChannelId)?.name ?? 'channel';
            showToast(`Moved to ${targetName}`, 'success');
            setState('success');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error('Move video to channel failed', {
                component: 'MoveVideoModal',
                videoId: video.id,
                error: message
            });
            setError(message);
            setState('error');
        }
    };

    if (!isOpen || !video) return null;

    const selectedTarget = availableTargets.find(c => c.id === targetChannelId);

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[440px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <div className="flex items-center gap-3">
                        <ArrowRightLeft size={20} className="text-amber-500" />
                        <h2 className="text-lg font-bold text-text-primary m-0">Move to Channel</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 mb-4">
                        {video.thumbnail ? (
                            <img
                                src={video.thumbnail}
                                alt={video.title}
                                className="w-20 h-12 rounded object-cover shrink-0"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div className="w-20 h-12 rounded bg-white/10 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-text-primary text-sm font-medium line-clamp-2">{video.title}</div>
                        </div>
                    </div>

                    {state === 'selecting' && (
                        <>
                            <div className="flex items-start gap-2 px-3 py-2 mb-4 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-text-secondary">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                <span>
                                    This video will leave the current channel with all its snapshots, traffic data and thumbnail history. Playlists in this channel that reference it will be updated.
                                </span>
                            </div>

                            <label className="block text-sm text-text-secondary mb-2">Move to:</label>
                            {availableTargets.length === 0 ? (
                                <div className="text-text-tertiary text-sm p-4 text-center rounded-lg border border-dashed border-border">
                                    No other channels available.
                                    <br />
                                    Create another channel first.
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                                    {availableTargets.map(channel => (
                                        <ChannelOption
                                            key={channel.id}
                                            channel={channel}
                                            isSelected={targetChannelId === channel.id}
                                            onClick={() => setTargetChannelId(channel.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {state === 'running' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 size={32} className="text-amber-500 animate-spin mb-3" />
                            <div className="text-text-secondary">Moving video...</div>
                            <div className="text-xs text-text-tertiary mt-1">This can take a few seconds for videos with lots of data.</div>
                        </div>
                    )}

                    {state === 'success' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                                <Check size={24} className="text-emerald-500" />
                            </div>
                            <div className="text-text-primary font-medium">
                                {selectedTarget ? `Moved to ${selectedTarget.name}` : 'Moved successfully'}
                            </div>
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            {error || 'Move failed'}
                        </div>
                    )}
                </div>

                {(state === 'selecting' || state === 'error') && (
                    <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 rounded-lg font-medium text-text-secondary hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                        >
                            Cancel
                        </button>

                        {state === 'selecting' && (
                            <button
                                onClick={handleMove}
                                disabled={!targetChannelId || availableTargets.length === 0}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Move
                            </button>
                        )}

                        {state === 'error' && (
                            <button
                                onClick={() => setState('selecting')}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors border-none cursor-pointer"
                            >
                                Try Again
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

const ChannelOption: React.FC<{
    channel: Channel;
    isSelected: boolean;
    onClick: () => void;
}> = ({ channel, isSelected, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${isSelected
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-border bg-white/5 hover:bg-white/10'
            }`}
    >
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center overflow-hidden shrink-0">
            {channel.avatar ? (
                <img src={channel.avatar} alt={channel.name} className="w-full h-full object-cover" />
            ) : (
                <User size={16} color="white" />
            )}
        </div>
        <span className="text-text-primary truncate flex-1 text-left">{channel.name}</span>
        {isSelected && <Check size={16} className="text-amber-500 shrink-0" />}
    </button>
);

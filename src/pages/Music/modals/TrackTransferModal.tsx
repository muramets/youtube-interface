import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, AlertTriangle, Check, Loader2, User, Music } from 'lucide-react';
import { TrackService } from '../../../core/services/music/trackService';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannels } from '../../../core/hooks/useChannels';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { logger } from '../../../core/utils/logger';
import type { Track } from '../../../core/types/music/track';
import type { Channel } from '../../../core/services/channelService';

interface TrackTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    track: Track | null;
}

type TransferState = 'selecting' | 'running' | 'success' | 'error';

/**
 * Modal that moves a single music track to another user channel via the
 * `moveTrackToChannel` Cloud Function. Move-only — track and its audio
 * files leave the source channel. Source music playlists referencing
 * the track are cleaned up by the backend. Version-group and
 * linked-video relationships are reset on dest (they reference the
 * source channel only).
 */
export const TrackTransferModal: React.FC<TrackTransferModalProps> = ({ isOpen, onClose, track }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { data: userChannels = [] } = useChannels(user?.uid || '');
    const { showToast } = useUIStore();

    const [state, setState] = useState<TransferState>('selecting');
    const [targetChannelId, setTargetChannelId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const availableTargets = useMemo(() => {
        if (!currentChannel) return [];
        return userChannels.filter(c => c.id !== currentChannel.id);
    }, [userChannels, currentChannel]);

    const handleClose = React.useCallback(() => {
        if (state === 'running') return;
        setState('selecting');
        setTargetChannelId(null);
        setError(null);
        onClose();
    }, [state, onClose]);

    React.useEffect(() => {
        if (state === 'success') {
            const timer = setTimeout(handleClose, 1200);
            return () => clearTimeout(timer);
        }
    }, [state, handleClose]);

    const handleMove = async () => {
        if (!user?.uid || !currentChannel || !track || !targetChannelId) return;
        setState('running');
        try {
            await TrackService.moveTrackToChannel(currentChannel.id, targetChannelId, track.id);

            // No cache to invalidate — the music store uses Firestore onSnapshot
            // (see TrackService.subscribeToTracks). Source/dest libraries refresh
            // automatically as soon as the writes propagate.

            const targetName = availableTargets.find(c => c.id === targetChannelId)?.name ?? 'channel';
            showToast(`Moved to ${targetName}`, 'success');
            setState('success');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error('Move track to channel failed', {
                component: 'TrackTransferModal',
                trackId: track.id,
                error: message,
            });
            setError(message);
            setState('error');
        }
    };

    if (!isOpen || !track) return null;

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
                        <h2 className="text-lg font-bold text-text-primary m-0">Move Track</h2>
                    </div>
                    {state !== 'running' && (
                        <button
                            onClick={handleClose}
                            className="p-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="p-6">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 mb-4">
                        {track.coverUrl ? (
                            <img
                                src={track.coverUrl}
                                alt={track.title}
                                className="w-12 h-12 rounded object-cover shrink-0"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded bg-white/10 shrink-0 flex items-center justify-center">
                                <Music size={20} className="text-text-tertiary" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-text-primary text-sm font-medium line-clamp-1">{track.title}</div>
                            {track.artist && (
                                <div className="text-xs text-text-tertiary line-clamp-1">{track.artist}</div>
                            )}
                        </div>
                    </div>

                    {state === 'selecting' && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-text-secondary">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                <span>
                                    The track and its audio files will leave the current channel. Music playlists in this channel that reference it will be updated. Version-group links and video links are reset on the destination.
                                </span>
                            </div>

                            <div>
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
                            </div>
                        </div>
                    )}

                    {state === 'running' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 size={32} className="text-amber-500 animate-spin mb-3" />
                            <div className="text-text-secondary">Moving track...</div>
                            <div className="text-xs text-text-tertiary mt-1">Audio files are being copied to the destination channel.</div>
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
                                className="px-4 py-2 rounded-lg font-bold text-white transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-700"
                            >
                                Move
                            </button>
                        )}

                        {state === 'error' && (
                            <button
                                onClick={() => setState('selecting')}
                                className="px-4 py-2 rounded-lg font-bold text-white transition-colors border-none cursor-pointer bg-amber-600 hover:bg-amber-700"
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

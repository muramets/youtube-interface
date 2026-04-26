import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, ArrowRightLeft, AlertTriangle, Check, Loader2, User } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { SegmentedControl } from '../../../components/ui/molecules/SegmentedControl';
import { VideoService, type VideoTransferMode } from '../../../core/services/videoService';
import { useAuth } from '../../../core/hooks/useAuth';
import { useChannels } from '../../../core/hooks/useChannels';
import { useChannelStore } from '../../../core/stores/channelStore';
import { useUIStore } from '../../../core/stores/uiStore';
import { logger } from '../../../core/utils/logger';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import type { Channel } from '../../../core/services/channelService';

interface VideoTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    videos: VideoDetails[];
}

type TransferState = 'selecting' | 'running' | 'success' | 'partial' | 'error';

interface FailedTransfer {
    video: VideoDetails;
    message: string;
}

const PREVIEW_THUMBS = 3;

/**
 * Modal that copies or moves one or more videos to another user channel via the
 * `moveVideoToChannel` Cloud Function.
 *
 * - Copy (default, less destructive): full duplicate of each video tree.
 *   Source channel is untouched.
 * - Move: each video is copied then deleted from source; source playlists
 *   referencing the videos are cleaned up by the backend.
 *
 * Bulk operations are sequential — each video is its own server-side
 * transaction. If some succeed and some fail, the modal lands in 'partial'
 * state with a Retry-failed-only button. The Cloud Function's per-video
 * atomicity (write-dest → verify → optionally delete-source) means partial
 * runs are recoverable: succeeded videos are durably in the target.
 */
export const VideoTransferModal: React.FC<VideoTransferModalProps> = ({ isOpen, onClose, videos }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { data: userChannels = [] } = useChannels(user?.uid || '');
    const { showToast } = useUIStore();
    const queryClient = useQueryClient();

    const [state, setState] = useState<TransferState>('selecting');
    const [mode, setMode] = useState<VideoTransferMode>('copy');
    const [targetChannelId, setTargetChannelId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [failed, setFailed] = useState<FailedTransfer[]>([]);

    const isBulk = videos.length > 1;
    const isMove = mode === 'move';
    const isRunning = state === 'running';

    const availableTargets = useMemo(() => {
        if (!currentChannel) return [];
        return userChannels.filter(c => c.id !== currentChannel.id);
    }, [userChannels, currentChannel]);

    const handleClose = React.useCallback(() => {
        if (isRunning) return; // No close during running — cancel mid-flight is ambiguous
        setState('selecting');
        setMode('copy');
        setTargetChannelId(null);
        setError(null);
        setProgress({ done: 0, total: 0 });
        setFailed([]);
        onClose();
    }, [isRunning, onClose]);

    React.useEffect(() => {
        if (state === 'success') {
            const timer = setTimeout(handleClose, 1200);
            return () => clearTimeout(timer);
        }
    }, [state, handleClose]);

    const title = isMove
        ? (isBulk ? 'Move Videos to Channel' : 'Move to Channel')
        : (isBulk ? 'Copy Videos to Channel' : 'Copy to Channel');
    const ctaLabel = isMove ? 'Move' : 'Copy';
    const Icon = isMove ? ArrowRightLeft : Copy;
    const accentClass = isMove ? 'text-amber-500' : 'text-[#3ea6ff]';
    const ctaClass = isMove
        ? 'bg-amber-600 hover:bg-amber-700'
        : 'bg-[#3ea6ff] hover:bg-[#3ea6ff]/90';

    /**
     * Run the transfer on the given subset of videos. Sequential — each video
     * is its own server-side transaction. Returns the list of failed transfers.
     */
    const runTransfers = async (toRun: VideoDetails[]): Promise<FailedTransfer[]> => {
        if (!user?.uid || !currentChannel || !targetChannelId) return [];
        const localFailed: FailedTransfer[] = [];
        setProgress({ done: 0, total: toRun.length });

        for (let i = 0; i < toRun.length; i++) {
            const v = toRun[i];
            try {
                await VideoService.moveVideoToChannel(currentChannel.id, targetChannelId, v.id, mode);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logger.error(`${isMove ? 'Move' : 'Copy'} video to channel failed`, {
                    component: 'VideoTransferModal',
                    videoId: v.id,
                    mode,
                    error: message
                });
                localFailed.push({ video: v, message });
            }
            setProgress({ done: i + 1, total: toRun.length });
        }

        return localFailed;
    };

    const handleTransfer = async (toRun: VideoDetails[]) => {
        if (!user?.uid || !currentChannel || !targetChannelId || toRun.length === 0) return;
        setState('running');
        setFailed([]);

        const localFailed = await runTransfers(toRun);

        // Invalidate caches so the UI reflects the change.
        await queryClient.invalidateQueries({ queryKey: ['videos', user.uid, targetChannelId] });
        if (isMove) {
            await queryClient.invalidateQueries({ queryKey: ['videos', user.uid, currentChannel.id] });
        }

        const targetName = availableTargets.find(c => c.id === targetChannelId)?.name ?? 'channel';
        const succeeded = toRun.length - localFailed.length;

        if (localFailed.length === 0) {
            showToast(
                isBulk
                    ? `${isMove ? 'Moved' : 'Copied'} ${succeeded} videos to ${targetName}`
                    : (isMove ? `Moved to ${targetName}` : `Copied to ${targetName}`),
                'success'
            );
            setState('success');
            return;
        }

        if (succeeded === 0) {
            // Total failure — show error state with the first message
            setError(localFailed[0].message);
            setFailed(localFailed);
            setState('error');
            return;
        }

        // Partial success
        setFailed(localFailed);
        setState('partial');
    };

    const handleRetryFailed = () => {
        if (failed.length === 0) return;
        const toRun = failed.map(f => f.video);
        handleTransfer(toRun);
    };

    if (!isOpen || videos.length === 0) return null;

    const selectedTarget = availableTargets.find(c => c.id === targetChannelId);
    const succeededCount = progress.total - failed.length;

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[480px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <div className="flex items-center gap-3">
                        <Icon size={20} className={accentClass} />
                        <h2 className="text-lg font-bold text-text-primary m-0">{title}</h2>
                    </div>
                    {!isRunning && (
                        <button
                            onClick={handleClose}
                            className="p-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="p-6">
                    {/* Source preview: single thumbnail+title or bulk grid */}
                    {isBulk ? (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 mb-4">
                            <div className="flex -space-x-3">
                                {videos.slice(0, PREVIEW_THUMBS).map(v => (
                                    <div
                                        key={v.id}
                                        className="w-12 h-8 rounded ring-2 ring-bg-secondary overflow-hidden bg-white/10 shrink-0"
                                    >
                                        {v.thumbnail && (
                                            <img
                                                src={v.thumbnail}
                                                alt=""
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-text-primary text-sm font-medium">
                                    {videos.length} videos
                                </div>
                                <div className="text-xs text-text-tertiary line-clamp-1">
                                    {videos.slice(0, 2).map(v => v.title).join(', ')}
                                    {videos.length > 2 && ` and ${videos.length - 2} more`}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 mb-4">
                            {videos[0].thumbnail ? (
                                <img
                                    src={videos[0].thumbnail}
                                    alt={videos[0].title}
                                    className="w-20 h-12 rounded object-cover shrink-0"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="w-20 h-12 rounded bg-white/10 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-text-primary text-sm font-medium line-clamp-2">{videos[0].title}</div>
                            </div>
                        </div>
                    )}

                    {state === 'selecting' && (
                        <div className="space-y-4">
                            <SegmentedControl<VideoTransferMode>
                                options={[
                                    { value: 'copy', label: 'Copy' },
                                    { value: 'move', label: 'Move' }
                                ]}
                                value={mode}
                                onChange={setMode}
                            />

                            {isMove ? (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-text-secondary">
                                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                    <span>
                                        {isBulk
                                            ? 'These videos will leave the current channel with all their snapshots, traffic data and thumbnail history. Playlists in this channel that reference them will be updated.'
                                            : 'This video will leave the current channel with all its snapshots, traffic data and thumbnail history. Playlists in this channel that reference it will be updated.'}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[#3ea6ff]/5 border border-[#3ea6ff]/20 text-xs text-text-secondary">
                                    <Copy size={14} className="text-[#3ea6ff] shrink-0 mt-0.5" />
                                    <span>
                                        Creates a full duplicate in the target channel — snapshots, traffic data, thumbnail history and storage files. Source is untouched.
                                    </span>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm text-text-secondary mb-2">
                                    {isMove ? 'Move to:' : 'Copy to:'}
                                </label>
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
                                                accent={isMove ? 'amber' : 'blue'}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {state === 'running' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 size={32} className={`${accentClass} animate-spin mb-3`} />
                            <div className="text-text-secondary">
                                {isMove ? 'Moving' : 'Copying'} {isBulk ? `${progress.done}/${progress.total}` : 'video'}...
                            </div>
                            <div className="text-xs text-text-tertiary mt-1">
                                {isBulk
                                    ? 'Each video is processed one at a time and is durable as soon as it succeeds.'
                                    : 'This can take a few seconds for videos with lots of data.'}
                            </div>
                        </div>
                    )}

                    {state === 'success' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                                <Check size={24} className="text-emerald-500" />
                            </div>
                            <div className="text-text-primary font-medium">
                                {selectedTarget
                                    ? (isBulk
                                        ? `${isMove ? 'Moved' : 'Copied'} ${progress.total} videos to ${selectedTarget.name}`
                                        : (isMove ? `Moved to ${selectedTarget.name}` : `Copied to ${selectedTarget.name}`))
                                    : (isMove ? 'Moved successfully' : 'Copied successfully')}
                            </div>
                        </div>
                    )}

                    {state === 'partial' && (
                        <div className="space-y-3">
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                    <div className="text-sm">
                                        <div className="text-text-primary font-medium mb-0.5">Partial success</div>
                                        <div className="text-text-secondary">
                                            {succeededCount} of {progress.total} videos {isMove ? 'moved' : 'copied'} to {selectedTarget?.name}. {failed.length} failed.
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="max-h-[160px] overflow-y-auto space-y-1.5">
                                {failed.map(f => (
                                    <div key={f.video.id} className="flex items-start gap-2 text-xs px-2.5 py-1.5 rounded bg-red-500/5 border border-red-500/20">
                                        <X size={12} className="text-red-400 shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-text-primary line-clamp-1">{f.video.title}</div>
                                            <div className="text-red-400 line-clamp-1">{f.message}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {state === 'error' && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            {error || 'Transfer failed'}
                        </div>
                    )}
                </div>

                {(state === 'selecting' || state === 'error' || state === 'partial') && (
                    <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 rounded-lg font-medium text-text-secondary hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                        >
                            {state === 'partial' ? 'Done' : 'Cancel'}
                        </button>

                        {state === 'selecting' && (
                            <button
                                onClick={() => handleTransfer(videos)}
                                disabled={!targetChannelId || availableTargets.length === 0}
                                className={`px-4 py-2 rounded-lg font-bold text-white transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${ctaClass}`}
                            >
                                {isBulk ? `${ctaLabel} ${videos.length}` : ctaLabel}
                            </button>
                        )}

                        {state === 'error' && (
                            <button
                                onClick={() => setState('selecting')}
                                className={`px-4 py-2 rounded-lg font-bold text-white transition-colors border-none cursor-pointer ${ctaClass}`}
                            >
                                Try Again
                            </button>
                        )}

                        {state === 'partial' && (
                            <button
                                onClick={handleRetryFailed}
                                className={`px-4 py-2 rounded-lg font-bold text-white transition-colors border-none cursor-pointer ${ctaClass}`}
                            >
                                Retry {failed.length} Failed
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
    accent: 'amber' | 'blue';
}> = ({ channel, isSelected, onClick, accent }) => {
    const ringClass = accent === 'amber'
        ? (isSelected ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-white/5 hover:bg-white/10')
        : (isSelected ? 'border-[#3ea6ff] bg-[#3ea6ff]/10' : 'border-border bg-white/5 hover:bg-white/10');
    const checkClass = accent === 'amber' ? 'text-amber-500' : 'text-[#3ea6ff]';

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${ringClass}`}
        >
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center overflow-hidden shrink-0">
                {channel.avatar ? (
                    <img src={channel.avatar} alt={channel.name} className="w-full h-full object-cover" />
                ) : (
                    <User size={16} color="white" />
                )}
            </div>
            <span className="text-text-primary truncate flex-1 text-left">{channel.name}</span>
            {isSelected && <Check size={16} className={`${checkClass} shrink-0`} />}
        </button>
    );
};

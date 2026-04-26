import React from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, ArrowRightLeft, AlertTriangle, Check, Loader2, User } from 'lucide-react';
import { SegmentedControl } from '../../../../components/ui/molecules/SegmentedControl';
import { useChannelTransfer, type TransferMode } from './useChannelTransfer';
import type { TrendChannel } from '../../../../core/types/trends';
import type { Channel } from '../../../../core/services/channelService';

interface ChannelTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    trendChannel: TrendChannel | null;
}

/**
 * Modal for transferring a TrendChannel between User Channels — Copy or Move.
 *
 * States: selecting → (conflict if target already has the channel) → running →
 * success | error | partialMove (move where delete step failed — user can retry).
 */
export const ChannelTransferModal: React.FC<ChannelTransferModalProps> = ({
    isOpen,
    onClose,
    trendChannel
}) => {
    const {
        state,
        mode,
        targetChannelId,
        availableTargets,
        error,
        nichesToTransfer,
        videosCount,
        hiddenVideosCount,
        isCountLoading,
        setMode,
        setTargetChannel,
        checkAndExecute,
        confirmMerge,
        retryCleanup,
        cancel,
        reset
    } = useChannelTransfer(trendChannel);

    const handleClose = React.useCallback(() => {
        reset();
        onClose();
    }, [reset, onClose]);

    React.useEffect(() => {
        if (state === 'success') {
            const timer = setTimeout(handleClose, 1500);
            return () => clearTimeout(timer);
        }
    }, [state, handleClose]);

    if (!isOpen || !trendChannel) return null;

    const selectedTarget = availableTargets.find(c => c.id === targetChannelId);
    const isMove = mode === 'move';
    const title = isMove ? 'Move to Channel' : 'Copy to Channel';
    const ctaLabel = isMove ? 'Move' : 'Copy';
    const Icon = isMove ? ArrowRightLeft : Copy;

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[440px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <div className="flex items-center gap-3">
                        <Icon size={20} className="text-[#3ea6ff]" />
                        <h2 className="text-lg font-bold text-text-primary m-0">{title}</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Source Channel Info */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 mb-4">
                        <img
                            src={trendChannel.avatarUrl}
                            alt={trendChannel.title}
                            className="w-10 h-10 rounded-full"
                            referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-text-primary font-medium truncate">
                                {trendChannel.title}
                            </div>
                            <div className="text-xs text-text-tertiary">
                                {isCountLoading
                                    ? '— niches • — videos'
                                    : (
                                        <>
                                            {nichesToTransfer.length} niches • {videosCount} videos
                                            {hiddenVideosCount > 0 && ` • ${hiddenVideosCount} hidden`}
                                        </>
                                    )
                                }
                            </div>
                        </div>
                    </div>

                    {/* State: Selecting — mode toggle + target picker */}
                    {state === 'selecting' && (
                        <div className="space-y-4">
                            <SegmentedControl<TransferMode>
                                options={[
                                    { value: 'copy', label: 'Copy' },
                                    { value: 'move', label: 'Move' }
                                ]}
                                value={mode}
                                onChange={setMode}
                            />

                            {isMove && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-text-secondary">
                                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                    <span>Move removes the channel from <strong className="text-text-primary">{'this'}</strong> channel after copying. Snapshots, videos, niches and hidden videos are transferred.</span>
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
                                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                        {availableTargets.map(channel => (
                                            <ChannelOption
                                                key={channel.id}
                                                channel={channel}
                                                isSelected={targetChannelId === channel.id}
                                                onClick={() => setTargetChannel(channel.id)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* State: Conflict (target already has this trend channel) */}
                    {state === 'conflict' && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-text-primary font-medium mb-1">
                                        Channel Already Exists
                                    </div>
                                    <div className="text-sm text-text-secondary">
                                        <strong>{trendChannel.title}</strong> is already tracked in{' '}
                                        <strong>{selectedTarget?.name}</strong>.
                                        <br />
                                        {isMove
                                            ? "Merging keeps the target's own snapshot history, adds any missing niches and hidden videos, then removes the channel from this channel."
                                            : "Merging keeps the target's own snapshot history and adds any missing niches and hidden videos."}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* State: Running */}
                    {state === 'running' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 size={32} className="text-[#3ea6ff] animate-spin mb-3" />
                            <div className="text-text-secondary">
                                {isMove ? 'Moving data...' : 'Copying data...'}
                            </div>
                        </div>
                    )}

                    {/* State: Success */}
                    {state === 'success' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                                <Check size={24} className="text-emerald-500" />
                            </div>
                            <div className="text-text-primary font-medium">
                                {isMove ? 'Moved successfully!' : 'Copied successfully!'}
                            </div>
                        </div>
                    )}

                    {/* State: Error */}
                    {state === 'error' && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                            {error || 'Something went wrong'}
                        </div>
                    )}

                    {/* State: Partial Move — copy succeeded, delete failed */}
                    {state === 'partialMove' && (
                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <div className="flex items-start gap-3">
                                <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <div className="text-text-primary font-medium mb-1">Partial Move</div>
                                    <div className="text-sm text-text-secondary">
                                        The channel was copied successfully, but removing it from this channel failed.
                                        Retry to clean up the source. {error && <><br /><span className="text-red-400 text-xs">{error}</span></>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(state === 'selecting' || state === 'conflict' || state === 'error' || state === 'partialMove') && (
                    <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30">
                        <button
                            onClick={state === 'conflict' ? cancel : handleClose}
                            className="px-4 py-2 rounded-lg font-medium text-text-secondary hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                        >
                            {state === 'partialMove' ? 'Close' : 'Cancel'}
                        </button>

                        {state === 'selecting' && (
                            <button
                                onClick={checkAndExecute}
                                disabled={!targetChannelId || availableTargets.length === 0}
                                className={`px-4 py-2 rounded-lg font-bold text-white transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isMove ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#3ea6ff] hover:bg-[#3ea6ff]/90'}`}
                            >
                                {ctaLabel}
                            </button>
                        )}

                        {state === 'conflict' && (
                            <button
                                onClick={confirmMerge}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors border-none cursor-pointer"
                            >
                                {isMove ? 'Merge & Move' : 'Merge'}
                            </button>
                        )}

                        {state === 'error' && (
                            <button
                                onClick={reset}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-[#3ea6ff] hover:bg-[#3ea6ff]/90 transition-colors border-none cursor-pointer"
                            >
                                Try Again
                            </button>
                        )}

                        {state === 'partialMove' && (
                            <button
                                onClick={retryCleanup}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors border-none cursor-pointer"
                            >
                                Retry Cleanup
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
            ? 'border-[#3ea6ff] bg-[#3ea6ff]/10'
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
        {isSelected && <Check size={16} className="text-[#3ea6ff] shrink-0" />}
    </button>
);

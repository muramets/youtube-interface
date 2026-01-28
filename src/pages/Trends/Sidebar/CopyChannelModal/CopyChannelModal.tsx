import React from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, AlertTriangle, Check, Loader2, User } from 'lucide-react';
import { useCopyChannel } from './useCopyChannel';
import type { TrendChannel } from '../../../../core/types/trends';
import type { Channel } from '../../../../core/services/channelService';

interface CopyChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
    trendChannel: TrendChannel | null;
}

/**
 * Modal for copying a TrendChannel to another User Channel.
 * 
 * Flow:
 * 1. selecting: User picks target channel
 * 2. conflict: TrendChannel exists in target → ask Merge/Cancel
 * 3. copying: In progress
 * 4. success: Done, auto-close
 */
export const CopyChannelModal: React.FC<CopyChannelModalProps> = ({
    isOpen,
    onClose,
    trendChannel
}) => {
    const {
        copyState,
        targetChannelId,
        availableTargets,
        error,
        nichesToCopy,
        videosCount,
        hiddenVideosCount,
        setTargetChannel,
        checkAndCopy,
        confirmMerge,
        cancel,
        reset
    } = useCopyChannel(trendChannel);

    // Close and reset state
    const handleClose = React.useCallback(() => {
        reset();
        onClose();
    }, [reset, onClose]);

    // Auto-close on success after brief delay
    React.useEffect(() => {
        if (copyState === 'success') {
            const timer = setTimeout(handleClose, 1500);
            return () => clearTimeout(timer);
        }
    }, [copyState, handleClose]);

    if (!isOpen || !trendChannel) return null;

    const selectedTarget = availableTargets.find(c => c.id === targetChannelId);

    return createPortal(
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={handleClose}
        >
            <div
                className="bg-bg-secondary rounded-xl w-[440px] max-w-[90vw] flex flex-col overflow-hidden animate-scale-in border border-border shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-border">
                    <div className="flex items-center gap-3">
                        <Copy size={20} className="text-[#3ea6ff]" />
                        <h2 className="text-lg font-bold text-text-primary m-0">
                            Copy to Channel
                        </h2>
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
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 mb-6">
                        <img
                            src={trendChannel.avatarUrl}
                            alt={trendChannel.title}
                            className="w-10 h.10 rounded-full"
                            referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-text-primary font-medium truncate">
                                {trendChannel.title}
                            </div>
                            <div className="text-xs text-text-tertiary">
                                {nichesToCopy.length} niches • {videosCount} videos
                                {hiddenVideosCount > 0 && ` • ${hiddenVideosCount} hidden`}
                            </div>
                        </div>
                    </div>

                    {/* State: Selecting */}
                    {copyState === 'selecting' && (
                        <>
                            <label className="block text-sm text-text-secondary mb-2">
                                Copy to:
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
                        </>
                    )}

                    {/* State: Conflict */}
                    {copyState === 'conflict' && (
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
                                        Merge will add new niches and video assignments.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* State: Copying */}
                    {copyState === 'copying' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <Loader2 size={32} className="text-[#3ea6ff] animate-spin mb-3" />
                            <div className="text-text-secondary">Copying data...</div>
                        </div>
                    )}

                    {/* State: Success */}
                    {copyState === 'success' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                                <Check size={24} className="text-emerald-500" />
                            </div>
                            <div className="text-text-primary font-medium">Copied successfully!</div>
                        </div>
                    )}

                    {/* State: Error */}
                    {copyState === 'error' && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                            {error || 'Something went wrong'}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(copyState === 'selecting' || copyState === 'conflict' || copyState === 'error') && (
                    <div className="px-6 py-4 flex justify-end gap-3 border-t border-border bg-bg-secondary/30">
                        <button
                            onClick={copyState === 'conflict' ? cancel : handleClose}
                            className="px-4 py-2 rounded-lg font-medium text-text-secondary hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                        >
                            Cancel
                        </button>

                        {copyState === 'selecting' && (
                            <button
                                onClick={checkAndCopy}
                                disabled={!targetChannelId || availableTargets.length === 0}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-[#3ea6ff] hover:bg-[#3ea6ff]/90 transition-colors border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Copy
                            </button>
                        )}

                        {copyState === 'conflict' && (
                            <button
                                onClick={confirmMerge}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors border-none cursor-pointer"
                            >
                                Merge
                            </button>
                        )}

                        {copyState === 'error' && (
                            <button
                                onClick={reset}
                                className="px-4 py-2 rounded-lg font-bold text-white bg-[#3ea6ff] hover:bg-[#3ea6ff]/90 transition-colors border-none cursor-pointer"
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

// Sub-component for channel selection option
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

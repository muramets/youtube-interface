import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Scissors, X } from 'lucide-react';
import type { TrendNiche } from '../../../core/types/trends';
import { useTrendStore } from '../../../core/stores/trends/trendStore';

interface ChannelStat {
    channelId: string;
    channelTitle: string;
    videoCount: number;
}

interface SplitNicheModalProps {
    isOpen: boolean;
    onClose: () => void;
    niche: TrendNiche;
    channelStats: ChannelStat[];
}

/**
 * Modal shown when attempting to convert a global niche with multi-channel videos to local.
 * Offers two options:
 * 1. Remove videos from other channels (keep only one channel's videos)
 * 2. Split into multiple local niches (one per channel)
 */
export const SplitNicheModal: React.FC<SplitNicheModalProps> = ({
    isOpen,
    onClose,
    niche,
    channelStats
}) => {
    const { splitNicheToLocal, removeVideosFromOtherChannels } = useTrendStore();
    const [isProcessing, setIsProcessing] = React.useState(false);

    if (!isOpen) return null;

    // Sort by video count descending
    const sortedStats = [...channelStats].sort((a, b) => b.videoCount - a.videoCount);
    const primaryChannel = sortedStats[0];
    const totalVideos = sortedStats.reduce((sum, s) => sum + s.videoCount, 0);

    const handleRemoveOthers = async () => {
        if (!primaryChannel) return;
        setIsProcessing(true);
        try {
            await removeVideosFromOtherChannels(niche.id, primaryChannel.channelId);
            onClose();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSplitToLocal = async () => {
        setIsProcessing(true);
        try {
            const channelDataMap = new Map(
                sortedStats.map(s => [s.channelId, { channelTitle: s.channelTitle, videoCount: s.videoCount }])
            );
            await splitNicheToLocal(niche.id, channelDataMap);
            onClose();
        } finally {
            setIsProcessing(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4 animate-scale-up"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-500/20 rounded-lg">
                            <AlertTriangle size={18} className="text-yellow-400" />
                        </div>
                        <h2 className="text-base font-semibold text-white">Cannot convert directly</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-4">
                    <p className="text-sm text-text-secondary">
                        "<span className="text-white font-medium">{niche.name}</span>" contains <span className="text-white font-medium">{totalVideos} videos</span> from <span className="text-white font-medium">{sortedStats.length} channels</span>:
                    </p>

                    {/* Channel List */}
                    <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                        {sortedStats.map((stat, index) => (
                            <div
                                key={stat.channelId}
                                className={`flex items-center justify-between px-3 py-2 rounded-lg ${index === 0 ? 'bg-white/10' : 'bg-white/5'
                                    }`}
                            >
                                <span className="text-sm text-white truncate flex-1 mr-2">
                                    {stat.channelTitle}
                                </span>
                                <span className="text-xs text-text-secondary whitespace-nowrap">
                                    {stat.videoCount} videos
                                    {index === 0 && <span className="text-green-400 ml-1">(primary)</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-white/10 space-y-2">
                    {/* Option 1: Remove from other channels */}
                    <button
                        onClick={handleRemoveOthers}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-left group disabled:opacity-50"
                    >
                        <div>
                            <div className="text-sm text-white font-medium">Remove from other channels</div>
                            <div className="text-xs text-text-secondary mt-0.5">
                                Keep {primaryChannel?.videoCount || 0} videos from {primaryChannel?.channelTitle || 'primary channel'}
                            </div>
                        </div>
                        <X size={16} className="text-red-400 opacity-60 group-hover:opacity-100" />
                    </button>

                    {/* Option 2: Split to local niches */}
                    <button
                        onClick={handleSplitToLocal}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-left group disabled:opacity-50"
                    >
                        <div>
                            <div className="text-sm text-white font-medium">Convert to {sortedStats.length} local niches</div>
                            <div className="text-xs text-text-secondary mt-0.5">
                                Create a separate "{niche.name}" for each channel
                            </div>
                        </div>
                        <Scissors size={16} className="text-blue-400 opacity-60 group-hover:opacity-100" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

import React from 'react';
import { createPortal } from 'react-dom';
import { Globe, Merge, Settings, X, Check } from 'lucide-react';
import type { TrendNiche } from '../../../core/types/trends';
import { useTrendStore } from '../../../core/stores/trendStore';

interface NicheWithMeta {
    niche: TrendNiche;
    channelTitle: string;
    videoCount: number;
}

interface MergeNichesModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceNiche: TrendNiche;
    matchingNiches: NicheWithMeta[];
}

/**
 * Modal shown when making a local niche global and same-name niches exist.
 * Offers Quick Actions:
 * 1. Merge all — combines all matching niches into one global
 * 2. Make global (this only) — just converts this niche, keeps others local
 * 3. Custom selection — checkbox list for selective merge
 */
export const MergeNichesModal: React.FC<MergeNichesModalProps> = ({
    isOpen,
    onClose,
    sourceNiche,
    matchingNiches
}) => {
    const { mergeNichesToGlobal, updateNiche } = useTrendStore();
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [showCustom, setShowCustom] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
        new Set(matchingNiches.map(m => m.niche.id))
    );

    if (!isOpen) return null;

    const totalMatchingVideos = matchingNiches.reduce((sum, m) => sum + m.videoCount, 0);
    const allNicheIds = [sourceNiche.id, ...matchingNiches.map(m => m.niche.id)];

    // Calculate totals for merge preview
    const sourceVideoCount = matchingNiches.find(m => m.niche.id === sourceNiche.id)?.videoCount || 0;
    const selectedCount = selectedIds.size;
    const selectedVideosTotal = matchingNiches
        .filter(m => selectedIds.has(m.niche.id))
        .reduce((sum, m) => sum + m.videoCount, 0) + sourceVideoCount;

    const handleMergeAll = async () => {
        setIsProcessing(true);
        try {
            await mergeNichesToGlobal(allNicheIds, sourceNiche.id);
            onClose();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleThisOnly = async () => {
        setIsProcessing(true);
        try {
            await updateNiche(sourceNiche.id, { type: 'global' });
            onClose();
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCustomMerge = async () => {
        if (selectedIds.size === 0) {
            // Just make global without merge
            await handleThisOnly();
            return;
        }

        setIsProcessing(true);
        try {
            const nicheIdsToMerge = [sourceNiche.id, ...Array.from(selectedIds)];
            await mergeNichesToGlobal(nicheIdsToMerge, sourceNiche.id);
            onClose();
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleSelection = (nicheId: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(nicheId)) {
            newSet.delete(nicheId);
        } else {
            newSet.add(nicheId);
        }
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === matchingNiches.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(matchingNiches.map(m => m.niche.id)));
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
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Globe size={18} className="text-blue-400" />
                        </div>
                        <h2 className="text-base font-semibold text-white">Make "{sourceNiche.name}" global</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-text-secondary hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4">
                    {!showCustom ? (
                        // Quick Actions View
                        <div className="space-y-4">
                            <p className="text-sm text-text-secondary">
                                Found <span className="text-white font-medium">{matchingNiches.length} other local niches</span> with this name ({totalMatchingVideos} videos total).
                            </p>

                            <div className="space-y-2">
                                {/* Option 1: Merge All */}
                                <button
                                    onClick={handleMergeAll}
                                    disabled={isProcessing}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg transition-colors text-left group disabled:opacity-50"
                                >
                                    <div>
                                        <div className="text-sm text-white font-medium flex items-center gap-2">
                                            <Merge size={14} className="text-blue-400" />
                                            Merge all {matchingNiches.length + 1} niches
                                        </div>
                                        <div className="text-xs text-text-secondary mt-0.5">
                                            Create 1 global niche with {totalMatchingVideos + sourceVideoCount} videos
                                        </div>
                                    </div>
                                </button>

                                {/* Option 2: This Only */}
                                <button
                                    onClick={handleThisOnly}
                                    disabled={isProcessing}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-left group disabled:opacity-50"
                                >
                                    <div>
                                        <div className="text-sm text-white font-medium flex items-center gap-2">
                                            <Globe size={14} className="text-text-secondary" />
                                            Make global (this only)
                                        </div>
                                        <div className="text-xs text-text-secondary mt-0.5">
                                            Keep other local niches separate
                                        </div>
                                    </div>
                                </button>

                                {/* Option 3: Custom */}
                                <button
                                    onClick={() => setShowCustom(true)}
                                    disabled={isProcessing}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-left group disabled:opacity-50"
                                >
                                    <div>
                                        <div className="text-sm text-white font-medium flex items-center gap-2">
                                            <Settings size={14} className="text-text-secondary" />
                                            Custom selection...
                                        </div>
                                        <div className="text-xs text-text-secondary mt-0.5">
                                            Choose which niches to merge
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    ) : (
                        // Custom Selection View
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <button
                                    onClick={() => setShowCustom(false)}
                                    className="text-sm text-text-secondary hover:text-white transition-colors"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={toggleAll}
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    {selectedIds.size === matchingNiches.length ? 'Deselect all' : 'Select all'}
                                </button>
                            </div>

                            <p className="text-sm text-text-secondary">
                                Select niches to merge with "{sourceNiche.name}":
                            </p>

                            {/* Checkbox List */}
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                {matchingNiches.map(m => (
                                    <label
                                        key={m.niche.id}
                                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${selectedIds.has(m.niche.id) ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-white/5 hover:bg-white/10 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.has(m.niche.id)
                                                ? 'bg-blue-500 border-blue-500'
                                                : 'border-white/30'
                                                }`}>
                                                {selectedIds.has(m.niche.id) && <Check size={12} className="text-white" />}
                                            </div>
                                            <span className="text-sm text-white truncate">{m.channelTitle}</span>
                                        </div>
                                        <span className="text-xs text-text-secondary whitespace-nowrap ml-2">
                                            {m.videoCount} videos
                                        </span>
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={selectedIds.has(m.niche.id)}
                                            onChange={() => toggleSelection(m.niche.id)}
                                        />
                                    </label>
                                ))}
                            </div>

                            {/* Preview */}
                            <div className="px-3 py-2 bg-white/5 rounded-lg text-xs text-text-secondary">
                                Result: Global "{sourceNiche.name}" with {selectedVideosTotal} videos
                            </div>

                            {/* Apply Button */}
                            <button
                                onClick={handleCustomMerge}
                                disabled={isProcessing}
                                className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                                {selectedIds.size > 0
                                    ? `Merge ${selectedCount + 1} niches`
                                    : 'Make global (no merge)'
                                }
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

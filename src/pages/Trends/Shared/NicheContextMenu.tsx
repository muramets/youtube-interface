import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, Globe, Pencil, Trash2 } from 'lucide-react';
import type { TrendNiche } from '../../../core/types/trends';
import { useTrendStore } from '../../../core/stores/trendStore';
import { useNicheAnalysis, type ChannelStat, type NicheWithMeta } from '../hooks/useNicheAnalysis';
import { SplitNicheModal } from './SplitNicheModal';
import { MergeNichesModal } from './MergeNichesModal';

interface NicheContextMenuProps {
    niche: TrendNiche;
    isOpen: boolean;
    onClose: () => void;
    position?: { x: number; y: number };
    anchorRef?: React.RefObject<HTMLElement>;
    onRename: () => void;
    onDelete: () => void;
}

export const NicheContextMenu: React.FC<NicheContextMenuProps> = ({
    niche,
    isOpen,
    onClose,
    position,
    onRename,
    onDelete
}) => {
    const { updateNiche } = useTrendStore();
    const { computeChannelStats, findMatchingNiches } = useNicheAnalysis();

    // Modal states - managed independently from context menu lifecycle
    // When user triggers split/merge, menu closes but modal stays open
    const [showSplitModal, setShowSplitModal] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [channelStats, setChannelStats] = useState<ChannelStat[]>([]);
    const [matchingNiches, setMatchingNiches] = useState<NicheWithMeta[]>([]);

    // Component renders if menu is open OR any modal is open
    // This allows modals to persist after context menu is closed
    if (!isOpen && !showSplitModal && !showMergeModal) return null;

    /**
     * GLOBAL vs LOCAL NICHE CONVERSION LOGIC:
     * 
     * GLOBAL → LOCAL ("Make local"):
     * - If niche has videos from MULTIPLE channels → Show SplitNicheModal
     *   - User can choose to split into multiple local niches (one per channel)
     *   - Or remove videos from other channels and keep only one channel
     * - If niche has videos from SINGLE channel → Convert directly
     * - If niche has NO videos but has channelId → Convert directly using that channelId
     * - If niche has NO videos and NO channelId → Alert user, cannot convert
     * 
     * LOCAL → GLOBAL ("Make global"):
     * - If OTHER local niches with SAME NAME exist → Show MergeNichesModal
     *   - User can merge all same-name niches into one global
     *   - Or make only this niche global without merging
     *   - Or custom select which niches to merge
     * - If NO matching niches found → Convert directly
     */
    const handleToggleType = () => {
        if (niche.type === 'global') {
            // Global → Local: Check if multi-channel scenario
            const stats = computeChannelStats(niche.id);

            if (stats.length > 1) {
                // Multi-channel: Show split modal for user decision
                setChannelStats(stats);
                setShowSplitModal(true);
                onClose();
                return;
            }

            // Single channel or no videos: simple conversion
            if (stats.length === 1) {
                updateNiche(niche.id, { type: 'local', channelId: stats[0].channelId });
            } else if (niche.channelId) {
                updateNiche(niche.id, { type: 'local' });
            } else {
                alert("Cannot convert to local: No channel association found.");
                return;
            }
        } else {
            // Local → Global: Check for same-name niches to potentially merge
            const matching = findMatchingNiches(niche.name, niche.id);

            if (matching.length > 0) {
                // Found matching niches: show merge modal for user decision
                setMatchingNiches(matching);
                setShowMergeModal(true);
                onClose();
                return;
            }

            // No matching niches: simple conversion
            updateNiche(niche.id, { type: 'global' });
        }

        onClose();
    };

    const content = (
        <div
            className="fixed z-[9999] bg-bg-secondary/95 backdrop-blur-md border border-white/10 rounded-lg py-1 shadow-xl animate-fade-in min-w-[140px]"
            style={position ? { left: position.x, top: position.y } : undefined}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Toggle Global/Local */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleToggleType();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
                {niche.type === 'global' ? <Home size={10} /> : <Globe size={10} />}
                {niche.type === 'global' ? 'Make local' : 'Make global'}
            </button>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRename();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Pencil size={10} />
                Rename
            </button>

            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/5 transition-colors flex items-center gap-2"
            >
                <Trash2 size={10} />
                Delete
            </button>
        </div>
    );

    return (
        <>
            {/* Context Menu */}
            {isOpen && (
                position ? (
                    createPortal(
                        <>
                            <div className="fixed inset-0 z-[9998] cursor-default" onClick={(e) => { e.stopPropagation(); onClose(); }} />
                            {content}
                        </>,
                        document.body
                    )
                ) : content
            )}

            {/* Split Modal (Global → Local with multi-channel) */}
            <SplitNicheModal
                isOpen={showSplitModal}
                onClose={() => setShowSplitModal(false)}
                niche={niche}
                channelStats={channelStats}
            />

            {/* Merge Modal (Local → Global with same-name detection) */}
            <MergeNichesModal
                isOpen={showMergeModal}
                onClose={() => setShowMergeModal(false)}
                sourceNiche={niche}
                matchingNiches={matchingNiches}
            />
        </>
    );
};

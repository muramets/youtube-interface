import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, Globe, Pencil, Trash2 } from 'lucide-react';
import type { TrendNiche } from '../../../types/trends';
import { useTrendStore } from '../../../stores/trendStore';
import { SplitNicheModal } from './SplitNicheModal';
import { MergeNichesModal } from './MergeNichesModal';

interface NicheContextMenuProps {
    niche: TrendNiche;
    isOpen: boolean;
    onClose: () => void;
    position?: { x: number; y: number }; // If not provided, assumed relative parent logic
    anchorRef?: React.RefObject<HTMLElement>; // For simple dropdowns
    onRename: () => void;
    onDelete: () => void;
}

interface ChannelStat {
    channelId: string;
    channelTitle: string;
    videoCount: number;
}

interface NicheWithMeta {
    niche: TrendNiche;
    channelTitle: string;
    videoCount: number;
}

export const NicheContextMenu: React.FC<NicheContextMenuProps> = ({
    niche,
    isOpen,
    onClose,
    position,
    onRename,
    onDelete
}) => {
    const { updateNiche, videos, videoNicheAssignments, niches, channels } = useTrendStore();

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
     * Compute channel stats for a global niche.
     * Returns list of channels that have videos assigned to this niche.
     */
    const computeChannelStats = (): ChannelStat[] => {
        const statsMap = new Map<string, { channelId: string; channelTitle: string; videoCount: number }>();

        // Find all videos assigned to this niche
        Object.entries(videoNicheAssignments).forEach(([videoId, assignments]) => {
            const isAssigned = assignments.some(a => a.nicheId === niche.id);
            if (isAssigned) {
                const video = videos.find(v => v.id === videoId);
                if (video) {
                    const existing = statsMap.get(video.channelId);
                    const channel = channels.find(c => c.id === video.channelId);
                    const channelTitle = channel?.title || video.channelTitle || 'Unknown Channel';

                    if (existing) {
                        existing.videoCount++;
                    } else {
                        statsMap.set(video.channelId, {
                            channelId: video.channelId,
                            channelTitle,
                            videoCount: 1
                        });
                    }
                }
            }
        });

        return Array.from(statsMap.values());
    };

    /**
     * Find other local niches with the same name (case-insensitive).
     */
    const findMatchingNiches = (): NicheWithMeta[] => {
        const normalizedName = niche.name.toLowerCase().trim();

        return niches
            .filter(n =>
                n.id !== niche.id &&
                n.type === 'local' &&
                n.name.toLowerCase().trim() === normalizedName
            )
            .map(n => {
                // Count videos for this niche
                let videoCount = 0;
                Object.values(videoNicheAssignments).forEach(assignments => {
                    if (assignments.some(a => a.nicheId === n.id)) {
                        videoCount++;
                    }
                });

                const channel = channels.find(c => c.id === n.channelId);

                return {
                    niche: n,
                    channelTitle: channel?.title || 'Unknown Channel',
                    videoCount
                };
            });
    };

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
            const stats = computeChannelStats();

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
            const matching = findMatchingNiches();

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

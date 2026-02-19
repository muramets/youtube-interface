import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Trash2, RefreshCw, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { TrendsChannelItem } from './TrendsChannelItem';
import { TrendsChannelSkeleton } from './TrendsChannelSkeleton';
import { CollapsibleNicheList } from './CollapsibleNicheList';
import { SidebarDivider } from '../../../components/Layout/Sidebar';
import { Dropdown } from '../../../components/ui/molecules/Dropdown';
import { ConfirmationModal } from '../../../components/ui/organisms/ConfirmationModal';
import { CopyChannelModal } from './CopyChannelModal';
import { useTrendsSidebar } from './hooks/useTrendsSidebar';
import { useTrendStore } from '../../../core/stores/trends/trendStore';
import type { TrendChannel } from '../../../core/types/trends';

export const TrendsSidebarSection: React.FC<{ expanded: boolean }> = ({ expanded }) => {
    const {
        channels,
        selectedChannelId,
        isOnTrendsPage,
        menuState,
        channelToDelete,
        isLoadingChannels,
        setMenuState,
        setChannelToDelete,
        setAddChannelModalOpen,
        handleTrendsClick,
        handleChannelClick,
        handleToggleVisibility,
        handleRemoveChannel,
        handleSyncChannel
    } = useTrendsSidebar();

    const { niches, videos, videoNicheAssignments, trendsFilters, setTrendsFilters, setChannelRootFilters, nicheFilters, setNicheFilters, hiddenVideos, setFilterMode, setSelectedChannelId } = useTrendStore();

    // Persist Trends section collapse state
    const [isContentExpanded, setIsContentExpanded] = useState(() => {
        const saved = localStorage.getItem('trends-section-expanded');
        return saved !== null ? saved === 'true' : true;
    });
    useEffect(() => {
        localStorage.setItem('trends-section-expanded', String(isContentExpanded));
    }, [isContentExpanded]);

    // State for copy channel modal
    const [channelToCopy, setChannelToCopy] = useState<TrendChannel | null>(null);

    // Derived active niche state from filters
    const activeNicheIds = React.useMemo(() => {
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        return nicheFilter ? (nicheFilter.value as string[]) : [];
    }, [trendsFilters]);

    /**
     * Handle niche click in sidebar.
     * 
     * FILTER STORAGE:
     * - channelRootFilters[channelId]: ROOT state (empty or UNASSIGNED filter)
     * - nicheFilters[nicheId]: Per-niche state (including TRASH)
     * 
     * CLICK BEHAVIORS:
     * - Click different niche: Save current state, load target niche state
     * - Click same active niche: Reset to clean niche state (only niche filter)
     * - Click TRASH: Load from nicheFilters['TRASH']
     */
    const handleNicheClick = (id: string | null, channelId?: string) => {
        if (!id) return;

        // Check if this is a global niche
        const clickedNiche = niches.find(n => n.id === id);
        const isGlobalNiche = clickedNiche?.type === 'global';

        // Step 1: Save current state before switching
        const currentNicheFilter = trendsFilters.find(f => f.type === 'niche');
        const isUnassigned = currentNicheFilter && (currentNicheFilter.value as string[]).includes('UNASSIGNED');

        if (currentNicheFilter && !isUnassigned) {
            // In a real niche (including TRASH) → save to nicheFilters
            const activeIds = currentNicheFilter.value as string[];
            if (activeIds.length === 1) {
                setNicheFilters(activeIds[0], trendsFilters);
            }
        } else if (selectedChannelId) {
            // In ROOT or UNASSIGNED → save to channelRootFilters
            setChannelRootFilters(selectedChannelId, trendsFilters);
        }

        /**
         * Step 2: Handle channel selection based on niche type
         * 
         * GLOBAL NICHES behave like a "virtual channel" that shows videos from ALL channels:
         * - Clear selectedChannelId to null (triggers loading all visible channels)
         * - No channel is highlighted in sidebar
         * - Videos from all visible channels are displayed
         * 
         * LOCAL NICHES require a channel context:
         * - Set selectedChannelId to the niche's channel
         * - That channel is highlighted in sidebar
         * - Only videos from that channel are displayed
         */
        if (isGlobalNiche) {
            // GLOBAL NICHE: Clear channel selection to show videos from ALL visible channels
            setSelectedChannelId(null);
        } else {
            // LOCAL NICHE or TRASH: Requires a channel context
            const targetChannelId = channelId || selectedChannelId;
            if (!targetChannelId) return;

            if (selectedChannelId !== targetChannelId) {
                handleChannelClick(targetChannelId);
            }
        }

        // Step 3: Load target niche state
        if (id === 'TRASH') {
            // TRASH has dedicated storage
            const savedTrash = nicheFilters['TRASH'] || [];
            if (savedTrash.length > 0) {
                setTrendsFilters(savedTrash);
            } else {
                setTrendsFilters([{
                    id: crypto.randomUUID(),
                    type: 'niche',
                    operator: 'contains',
                    value: ['TRASH'],
                    label: 'Niche: Untracked'
                }]);
                setFilterMode('filtered');
            }
            return;
        }

        // Normal niche handling
        const savedFilters = nicheFilters[id];
        const currentActiveNiche = trendsFilters.find(f => f.type === 'niche');
        const isActive = currentActiveNiche && (currentActiveNiche.value as string[]).includes(id);

        // For global niches, we don't check selectedChannelId match since we cleared it
        const shouldResetToClean = isActive && (isGlobalNiche || selectedChannelId === channelId);

        if (shouldResetToClean) {
            // Clicking same active niche → reset to clean state
            setNicheFilters(id, trendsFilters);
            const nicheName = niches.find(n => n.id === id)?.name || 'Niche';
            setTrendsFilters([{
                id: crypto.randomUUID(),
                type: 'niche',
                operator: 'contains',
                value: [id],
                label: `Niche: ${nicheName}`
            }]);
            return;
        }

        // Load saved or create fresh niche filter
        if (savedFilters && savedFilters.length > 0) {
            setTrendsFilters(savedFilters);
        } else {
            const nicheName = niches.find(n => n.id === id)?.name || 'Niche';
            setTrendsFilters([{
                id: crypto.randomUUID(),
                type: 'niche',
                operator: 'contains',
                value: [id],
                label: `Niche: ${nicheName}`
            }]);
        }
    };

    // Compute set of channels that have hidden videos
    const trashCounts = React.useMemo(() => {
        const counts = new Map<string, number>();
        hiddenVideos.forEach(hv => {
            if (hv.channelId) {
                counts.set(hv.channelId, (counts.get(hv.channelId) || 0) + 1);
            }
        });
        return counts;
    }, [hiddenVideos]);

    // Compute view counts dynamically based on currently loaded videos
    const nicheViewCounts = React.useMemo(() => {
        const counts = new Map<string, number>();
        const hiddenIds = new Set(hiddenVideos.map(hv => hv.id));

        videos.forEach(v => {
            if (hiddenIds.has(v.id)) return;

            // Get all niche assignments for this video (array-based)
            const assignments = videoNicheAssignments[v.id] || [];
            const nicheIds = assignments.length > 0
                ? assignments.map(a => a.nicheId)
                : (v.nicheId ? [v.nicheId] : []);

            nicheIds.forEach(nicheId => {
                counts.set(nicheId, (counts.get(nicheId) || 0) + v.viewCount);
            });
        });
        return counts;
    }, [videos, videoNicheAssignments, hiddenVideos]);

    // Compute total view counts per channel
    const channelViewCounts = React.useMemo(() => {
        const counts = new Map<string, number>();
        videos.forEach(v => {
            counts.set(v.channelId, (counts.get(v.channelId) || 0) + v.viewCount);
        });
        return counts;
    }, [videos]);

    // Sort channels by total view count 
    // Priorities: 
    // 1. Channel's persisted totalViewCount (global stats)
    // 2. Computed view count from currently loaded videos (fallback)
    const sortedChannels = React.useMemo(() => {
        return [...channels].sort((a, b) => {
            const viewsA = a.totalViewCount ?? (channelViewCounts.get(a.id) || 0);
            const viewsB = b.totalViewCount ?? (channelViewCounts.get(b.id) || 0);
            return viewsB - viewsA;
        });
    }, [channels, channelViewCounts]);

    const getNicheViewCount = (niche: { id: string, viewCount?: number }) => {
        const computed = nicheViewCounts.get(niche.id);
        return computed !== undefined ? computed : (niche.viewCount || 0);
    };

    const globalNiches = niches
        .filter(n => n.type === 'global')
        .map(n => ({ ...n, viewCount: getNicheViewCount(n) }))
        .sort((a, b) => b.viewCount - a.viewCount);

    const getLocalNiches = (channelId: string) => niches
        .filter(n => n.type === 'local' && n.channelId === channelId)
        .map(n => ({ ...n, viewCount: getNicheViewCount(n) }))
        .sort((a, b) => b.viewCount - a.viewCount);

    return (
        <>
            {expanded && (
                <div className="mt-2">
                    <SidebarDivider />
                    <div className="">
                        {/* Trends Header - Clickable */}
                        <div
                            className={`w-full flex items-center justify-between py-2.5 px-3 mb-2 rounded-lg transition-all duration-200 group ${isOnTrendsPage && selectedChannelId === null
                                ? 'bg-sidebar-active text-text-primary'
                                : 'text-text-secondary hover:bg-sidebar-hover hover:text-text-primary'
                                }`}
                        >
                            {/* Main Click Target */}
                            <div
                                className="flex items-center gap-6 flex-1 cursor-pointer"
                                onClick={handleTrendsClick}
                            >
                                <TrendingUp
                                    size={24}
                                    strokeWidth={isOnTrendsPage && selectedChannelId === null ? 2.5 : 1.5}
                                    className="transition-all"
                                />
                                <span className={`text-sm ${isOnTrendsPage && selectedChannelId === null ? 'font-medium' : 'font-normal'}`}>Trends</span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                                {/* Toggle Collapse */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsContentExpanded(!isContentExpanded);
                                    }}
                                    className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
                                >
                                    {isContentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>

                                {/* Add Channel */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setAddChannelModalOpen(true);
                                    }}
                                    className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
                                    title="Add channel"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Content Wrapper */}
                        {isContentExpanded && (
                            <div className="px-3 pb-2">
                                {/* Global Niches */}
                                {globalNiches.length > 0 && (
                                    <div className="mb-3">
                                        <CollapsibleNicheList
                                            niches={globalNiches}
                                            activeNicheIds={activeNicheIds}
                                            onNicheClick={handleNicheClick}
                                            storageKey="global"
                                        />
                                    </div>
                                )}

                                {/* Channel List */}
                                {isLoadingChannels ? (
                                    <TrendsChannelSkeleton />
                                ) : channels.length === 0 ? (
                                    <div className="text-text-tertiary text-xs px-2 py-1">
                                        No channels tracked
                                    </div>
                                ) : (
                                    <ul className="space-y-0.5">
                                        {sortedChannels.map((channel: TrendChannel) => {
                                            const trashCount = trashCounts.get(channel.id) || 0;
                                            // Prefer persisted total, fallback to loaded total
                                            const viewCount = channel.totalViewCount ?? (channelViewCounts.get(channel.id) || 0);
                                            return (
                                                <TrendsChannelItem
                                                    key={channel.id}
                                                    channel={channel}
                                                    isActive={isOnTrendsPage && selectedChannelId === channel.id}
                                                    onChannelClick={handleChannelClick}
                                                    onToggleVisibility={handleToggleVisibility}
                                                    onOpenMenu={(e, channelId) => {
                                                        if (menuState.channelId === channelId) {
                                                            setMenuState({ anchorEl: null, channelId: null });
                                                        } else {
                                                            setMenuState({ anchorEl: e.currentTarget as HTMLElement, channelId });
                                                        }
                                                    }}
                                                    niches={getLocalNiches(channel.id)}
                                                    activeNicheIds={activeNicheIds}
                                                    onNicheClick={handleNicheClick}
                                                    trashCount={trashCount}
                                                    viewCount={viewCount}
                                                    isMenuOpen={menuState.channelId === channel.id}
                                                />
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    <Dropdown
                        isOpen={!!menuState.anchorEl}
                        onClose={() => setMenuState({ anchorEl: null, channelId: null })}
                        anchorEl={menuState.anchorEl}
                        width={180}
                    >
                        <div className="p-1 space-y-0.5">
                            <button
                                onClick={handleSyncChannel}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                            >
                                <RefreshCw size={14} />
                                <span>Sync</span>
                            </button>
                            <button
                                onClick={() => {
                                    const channel = channels.find((c: TrendChannel) => c.id === menuState.channelId);
                                    if (channel) setChannelToCopy(channel);
                                    setMenuState({ anchorEl: null, channelId: null });
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                            >
                                <Copy size={14} />
                                <span>Copy to channel...</span>
                            </button>
                            <button
                                onClick={() => {
                                    const channel = channels.find((c: TrendChannel) => c.id === menuState.channelId);
                                    if (channel) setChannelToDelete(channel);
                                    setMenuState({ anchorEl: null, channelId: null });
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-white/5 rounded cursor-pointer transition-colors text-left"
                            >
                                <Trash2 size={14} />
                                <span>Remove channel</span>
                            </button>
                        </div>
                    </Dropdown>

                    <ConfirmationModal
                        isOpen={!!channelToDelete}
                        onClose={() => setChannelToDelete(null)}
                        onConfirm={handleRemoveChannel}
                        title="Remove Channel"
                        message={`Are you sure you want to remove "${channelToDelete?.title}"? This will delete all tracked data for this channel.`}
                        confirmLabel="Remove"
                    />

                    <CopyChannelModal
                        isOpen={!!channelToCopy}
                        onClose={() => setChannelToCopy(null)}
                        trendChannel={channelToCopy}
                    />

                </div>
            )}
        </>
    );
};

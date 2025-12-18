import React, { useState, useEffect } from 'react';
import { Plus, TrendingUp, Trash2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { TrendsChannelItem } from './TrendsChannelItem';
import { TrendsChannelSkeleton } from './TrendsChannelSkeleton';
import { CollapsibleNicheList } from './CollapsibleNicheList';
import { SidebarDivider } from '../../Layout/Sidebar';
import { Dropdown } from '../../Shared/Dropdown';
import { ConfirmationModal } from '../../Shared/ConfirmationModal';
import { useTrendsSidebar } from './hooks/useTrendsSidebar';
import { useTrendStore } from '../../../stores/trendStore';
import type { TrendChannel } from '../../../types/trends';

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

    const { niches, videos, videoNicheAssignments, trendsFilters, addTrendsFilter, removeTrendsFilter, hiddenVideos } = useTrendStore();

    // Persist Trends section collapse state
    const [isContentExpanded, setIsContentExpanded] = useState(() => {
        const saved = localStorage.getItem('trends-section-expanded');
        return saved !== null ? saved === 'true' : true;
    });
    useEffect(() => {
        localStorage.setItem('trends-section-expanded', String(isContentExpanded));
    }, [isContentExpanded]);

    // Derived active niche state from filters
    const activeNicheIds = React.useMemo(() => {
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        return nicheFilter ? (nicheFilter.value as string[]) : [];
    }, [trendsFilters]);

    const handleNicheClick = (id: string | null) => {
        if (!id) return;

        // "Untracked" (TRASH) mode is exclusive.
        if (id === 'TRASH') {
            const existingFilter = trendsFilters.find(f => f.type === 'niche');
            if (existingFilter) {
                removeTrendsFilter(existingFilter.id);
            }
            addTrendsFilter({
                type: 'niche',
                operator: 'contains',
                value: ['TRASH'],
                label: 'Niche: Untracked'
            });
            return;
        }

        // Find the niche to check if it's local and needs channel switching
        const targetNiche = niches.find(n => n.id === id);

        // If clicking a local niche for a channel that isn't selected, switch to that channel
        if (targetNiche?.type === 'local' && targetNiche.channelId && selectedChannelId !== targetNiche.channelId) {
            handleChannelClick(targetNiche.channelId);
            // We just switched channels, any previous niche filters were cleared by handleChannelClick.
            // Now apply the new niche filter.
            addTrendsFilter({
                type: 'niche',
                operator: 'contains',
                value: [id],
                label: `Niche: ${targetNiche.name}`
            });
            return;
        }

        // Standard toggle logic for existing context
        const existingFilter = trendsFilters.find(f => f.type === 'niche');
        if (existingFilter) {
            removeTrendsFilter(existingFilter.id);
            const currentlySelected = (existingFilter.value as string[]) || [];

            let nextSelection = [...currentlySelected];

            // Ensure TRASH is removed if it was present
            if (nextSelection.includes('TRASH')) {
                nextSelection = nextSelection.filter(sid => sid !== 'TRASH');
            }

            if (nextSelection.includes(id)) {
                // Toggle off
                nextSelection = nextSelection.filter(sid => sid !== id);
            } else {
                // Toggle on
                nextSelection = [...nextSelection, id];
            }

            // Apply update only if we still have selections
            if (nextSelection.length > 0) {
                const nicheNames = niches
                    .filter(n => nextSelection.includes(n.id))
                    .map(n => n.name)
                    .join(', ');

                addTrendsFilter({
                    type: 'niche',
                    operator: 'contains',
                    value: nextSelection,
                    label: nextSelection.length > 3 ? `${nextSelection.length} niches` : `Niche: ${nicheNames}`
                });
            }
        } else {
            // No previous filter, simple add
            const nicheName = niches.find(n => n.id === id)?.name || 'Niche';
            addTrendsFilter({
                type: 'niche',
                operator: 'contains',
                value: [id],
                label: `Niche: ${nicheName}`
            });
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
                                                    onOpenMenu={(e, channelId) => setMenuState({ anchorEl: e.currentTarget as HTMLElement, channelId })}
                                                    niches={getLocalNiches(channel.id)}
                                                    activeNicheIds={activeNicheIds}
                                                    onNicheClick={handleNicheClick}
                                                    trashCount={trashCount}
                                                    viewCount={viewCount}
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

                </div>
            )}
        </>
    );
};

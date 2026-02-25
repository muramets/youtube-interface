import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTrendStore } from '../../core/stores/trends/trendStore';
import { TimelineCanvas } from './Timeline/TimelineCanvas';
import { TrendsTable } from './Table/TrendsTable';
import { TrendsHeader } from './Header/TrendsHeader';
import { useFilteredVideos } from './hooks/useFilteredVideos';
import { useFrozenStats } from './Timeline/hooks/useFrozenStats';
import { useTrendVideos } from './hooks/useTrendVideos';
import { TrendsFloatingBar } from './Timeline/TrendsFloatingBar';
import { useSelectionState } from './Timeline/hooks/useSelectionState';
import type { TrendVideo } from '../../core/types/trends';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';

export const TrendsPage: React.FC = () => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { channels, selectedChannelId, setSelectedChannelId, timelineConfig, setTimelineConfig, trendsFilters, setTrendsFilters, filterMode, videos, hiddenVideos, isLoadingChannels, isAppliedFromAllChannels } = useTrendStore();
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);
    const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');

    // Shared Selection State (Lifted)
    const {
        selectionState,
        handleVideoClick,
        clearSelection,
        dockFloatingBar,
        setSelectionState
    } = useSelectionState();

    // Use extracted hook for video loading
    const { isLoading: isVideosLoading, allChannelsHidden } = useTrendVideos({
        userUid: user?.uid,
        currentChannelId: currentChannel?.id
    });

    // Unified loading state
    useEffect(() => {
        setIsLoadingLocal(isVideosLoading);
    }, [isVideosLoading]);

    // Derived loading state for UI
    const isLoading = isLoadingLocal;

    // Clear selection when changing channels to avoid "ghost" cross-channel selection leaks
    useEffect(() => {
        clearSelection();
    }, [selectedChannelId, clearSelection]);


    // Calculate Global Percentile Map
    const globalPercentileMap = useMemo(() => {
        if (videos.length === 0) return new Map<string, string>();
        const sortedByViews = [...videos].sort((a, b) => b.viewCount - a.viewCount);
        const map = new Map<string, string>();
        sortedByViews.forEach((v, i) => {
            const percentile = (i / videos.length) * 100;
            let group: string;
            if (percentile <= 1) group = 'Top 1%';
            else if (percentile <= 5) group = 'Top 5%';
            else if (percentile <= 20) group = 'Top 20%';
            else if (percentile <= 80) group = 'Middle 60%';
            else group = 'Bottom 20%';
            map.set(v.id, group);
        });
        return map;
    }, [videos]);

    // Apply Filters using extracted hook
    const filteredVideos = useFilteredVideos({
        videos,
        trendsFilters,
        hiddenVideos,
        selectedChannelId,
        globalPercentileMap
    });

    // All videos without hidden (global context for the current channel/view)
    const allVideos = useMemo(() => {
        const hiddenIds = new Set(hiddenVideos.map(hv => hv.id));
        return videos.filter(v => {
            if (hiddenIds.has(v.id)) return false;
            // Crucial: Limit context to the currently selected channel!
            if (selectedChannelId && v.channelId !== selectedChannelId) return false;
            return true;
        });
    }, [videos, hiddenVideos, selectedChannelId]);

    // List of active niche IDs (excluding TRASH and UNASSIGNED)
    const { activeNicheIds, hasUnassignedFilter } = useMemo(() => {
        const nicheFilter = trendsFilters.find(f => f.type === 'niche');
        if (!nicheFilter) return { activeNicheIds: [], hasUnassignedFilter: false };
        const nicheIds = (nicheFilter.value as string[]) || [];
        // TRASH and UNASSIGNED are special modes, not real niche filters
        return {
            activeNicheIds: nicheIds.filter(id => id !== 'TRASH' && id !== 'UNASSIGNED'),
            hasUnassignedFilter: nicheIds.includes('UNASSIGNED')
        };
    }, [trendsFilters]);

    // Generate Filter Hash for Smart Auto-Updates
    // This allows us to distinguish between "Filter/Niche Switch" (Auto-Update) 
    // and "Global Visibility Toggle" (Manual Update)
    const filterHash = useMemo(() => {
        const nicheKey = activeNicheIds.sort().join(',');
        const otherFiltersKey = trendsFilters
            .filter(f => f.type !== 'niche')
            .map(f => `${f.type}:${f.operator}:${f.value}`)
            .sort()
            .join('|');

        // Include selectedChannelId so switching channels triggers auto-fit
        // AND include hasUnassignedFilter so toggling it triggers a hash change (and thus auto-fit)
        return `${selectedChannelId || 'global'}:${nicheKey}:${hasUnassignedFilter ? 'unassigned' : ''}:${otherFiltersKey}`;
    }, [activeNicheIds, trendsFilters, selectedChannelId, hasUnassignedFilter]);

    // Managed Stats Logic
    const { currentStats, frozenStats, shouldAutoFit, refreshStats, skipAutoFitRef } = useFrozenStats({
        allVideos,
        filteredVideos,
        channels,
        selectedChannelId,
        filterMode,
        hasUnassignedFilter,
        filterHash
    });

    // Prepare Selection Data
    const selectedVideos = useMemo(() => {
        return filteredVideos.filter(v => selectionState.selectedIds.has(v.id));
    }, [filteredVideos, selectionState.selectedIds]);

    const floatingBarPosition = useMemo(() => {
        if (selectionState.selectedIds.size === 0 || !selectionState.lastAnchor) return { x: 0, y: 0 };
        return selectionState.lastAnchor;
    }, [selectionState.lastAnchor, selectionState.selectedIds.size]);

    // Handle Table Selection Toggles
    const handleToggleSelection = useCallback((video: TrendVideo, position: { x: number, y: number }) => {
        // Force additive selection (like holding Cmd/Ctrl) for better Table UX
        handleVideoClick(video, position.x, position.y, true);
    }, [handleVideoClick]);

    // Handle channel click in table view → navigate to that channel with current filters
    const handleChannelClick = useCallback((channelId: string) => {
        const store = useTrendStore.getState();
        // Save All Channels filters before switching
        store.setChannelRootFilters('__global__', store.trendsFilters);
        // Strip niche filters (niches are per-channel, not transferable)
        const transferrable = store.trendsFilters.filter(f => f.type !== 'niche');
        setSelectedChannelId(channelId);
        setTrendsFilters(transferrable);
        store.setIsAppliedFromAllChannels(transferrable.length > 0);
    }, [setSelectedChannelId, setTrendsFilters]);

    // Save propagated filters as channel's own filters
    const handleSaveForChannel = useCallback(() => {
        const store = useTrendStore.getState();
        if (store.selectedChannelId) {
            store.setChannelRootFilters(store.selectedChannelId, store.trendsFilters);
        }
        store.setIsAppliedFromAllChannels(false);
    }, []);

    // Clear all propagated filters
    const handleClearApplied = useCallback(() => {
        setTrendsFilters([]);
        useTrendStore.getState().setIsAppliedFromAllChannels(false);
    }, [setTrendsFilters]);

    // Handle back to all channels from breadcrumb
    const handleBackToChannels = useCallback(() => {
        // Save current channel filters before leaving
        const store = useTrendStore.getState();
        if (store.selectedChannelId) {
            store.setChannelRootFilters(store.selectedChannelId, store.trendsFilters);
        }
        setSelectedChannelId(null);
        // Restore global (All Channels) filters
        const globalFilters = useTrendStore.getState().channelRootFilters['__global__'];
        setTrendsFilters(globalFilters?.length > 0 ? globalFilters : []);
    }, [setSelectedChannelId, setTrendsFilters]);

    const handleToggleAll = (videosToSelect: TrendVideo[]) => {
        if (videosToSelect.length === 0) return;

        const allSelected = videosToSelect.every(v => selectionState.selectedIds.has(v.id));

        if (allSelected) {
            // Deselect all visible
            clearSelection();
        } else {
            // Select all visible
            const newSet = new Set(selectionState.selectedIds);
            videosToSelect.forEach(v => newSet.add(v.id));

            // For Select All, we pick a center-ish or top-right position for the bar if it's not already docked
            const defaultPos = { x: window.innerWidth / 2, y: window.innerHeight - 150 };

            setSelectionState({
                selectedIds: newSet,
                lastAnchor: selectionState.lastAnchor || defaultPos,
                hasDocked: true // Auto dock for bulk selection
            });
        }
    };

    return (
        <div className="flex flex-col h-full bg-bg-primary relative">
            <TrendsHeader
                title={selectedChannelId ? channels.find(c => c.id === selectedChannelId)?.title || 'Unknown Channel' : 'All Channels'}
                videoCount={filteredVideos.length}
                channelCount={selectedChannelId ? 1 : channels.length}
                showChannelCount={!selectedChannelId}
                timelineConfig={timelineConfig}
                setTimelineConfig={setTimelineConfig}
                isLoading={isLoading || isLoadingChannels}
                availableMinDate={currentStats?.minDate}
                availableMaxDate={currentStats?.maxDate}
                currentViewMode={viewMode}
                onViewModeChange={setViewMode}
                filteredVideos={filteredVideos}
                isInsideChannel={!!selectedChannelId}
                onBackToChannels={handleBackToChannels}
                isAppliedFromAllChannels={isAppliedFromAllChannels}
                onSaveForChannel={handleSaveForChannel}
                onClearApplied={handleClearApplied}
            />

            {viewMode === 'timeline' ? (
                <TimelineCanvas
                    key={selectedChannelId || 'all'}
                    videos={filteredVideos}
                    allVideos={allVideos}
                    isLoading={isLoading || isLoadingChannels}
                    percentileMap={globalPercentileMap}
                    frozenStats={frozenStats}
                    currentStats={currentStats}
                    shouldAutoFit={shouldAutoFit}
                    onRequestStatsRefresh={refreshStats}
                    skipAutoFitRef={skipAutoFitRef}
                    filterHash={filterHash}
                    allChannelsHidden={allChannelsHidden}
                    // Selection Props
                    activeSelectionState={selectionState}
                    onVideoClick={handleVideoClick}
                    onClearSelection={clearSelection}
                    onDockFloatingBar={dockFloatingBar}
                />
            ) : (
                <TrendsTable
                    videos={filteredVideos}
                    channels={channels}
                    channelId={selectedChannelId || ''}
                    mode={selectedChannelId ? 'videos' : 'channels'}
                    // Selection Props
                    selectedIds={selectionState.selectedIds}
                    onToggleSelection={handleToggleSelection}
                    onToggleAll={() => handleToggleAll(filteredVideos)}
                    onChannelClick={handleChannelClick}
                />
            )}

            {/* Shared Floating Bar */}
            {selectedVideos.length > 0 && (
                <TrendsFloatingBar
                    videos={selectedVideos}
                    position={floatingBarPosition}
                    onClose={clearSelection}
                    isDocked={selectionState.hasDocked}
                    onActiveMenuChange={() => { }} // Optional if not needed at page level yet
                />
            )}
        </div>
    );
};

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TrafficTable } from './components/TrafficTable';
import { TrafficHeader } from './components/TrafficHeader';
import { TrafficModals } from './components/TrafficModals';
import { TrafficFilterChips } from './components/TrafficFilterChips';
import { TrafficErrorState } from './components/TrafficErrorState';
import { TrafficFloatingBar } from './components/TrafficFloatingBar';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { useTrafficDataLoader } from './hooks/useTrafficDataLoader';
import { useTrafficSelection } from './hooks/useTrafficSelection';
import { useTrafficFilters } from './hooks/useTrafficFilters';
import { useSettings } from '../../../../core/hooks/useSettings';
import { formatPremiumPeriod } from './utils/dateUtils';
import { useTrafficNicheStore } from '../../../../core/stores/useTrafficNicheStore';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';

interface TrafficTabProps {
    video: VideoDetails;
    activeVersion: number;
    viewingVersion?: number | 'draft';
    viewingPeriodIndex?: number;
    selectedSnapshot?: string | null;
    // Shared state from DetailsLayout
    trafficData: any | null;
    isLoadingData: boolean;
    isSaving: boolean;
    handleCsvUpload: (sources: any[], totalRow?: any, file?: File) => Promise<string | null>;
    onSnapshotClick?: (id: string) => void;
    packagingHistory?: any[]; // Passed to resolve version aliases
}

export const TrafficTab: React.FC<TrafficTabProps> = ({
    video: _video,
    activeVersion,
    viewingVersion,
    viewingPeriodIndex = 0,
    selectedSnapshot,
    trafficData,
    isLoadingData: isLoading,
    handleCsvUpload,
    onSnapshotClick,
    packagingHistory = []
}) => {
    // Scroll detection for sticky header
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // View Mode State: 'cumulative' shows total views, 'delta' shows new views since last snapshot
    const [viewMode, setViewMode] = useState<'cumulative' | 'delta'>('delta');

    // Modals State
    const [isMapperOpen, setIsMapperOpen] = useState(false);
    const [failedFile, setFailedFile] = useState<File | null>(null);

    // Custom hooks
    // BUSINESS LOGIC: Data Loading & Error Handling
    // Now exposes error state and retry capability
    const { displayedSources, isLoadingSnapshot, error, retry } = useTrafficDataLoader({
        trafficData,
        viewingVersion,
        viewingPeriodIndex,
        activeVersion,
        viewMode,
        selectedSnapshot,
        packagingHistory
    });

    const { selectedIds, toggleSelection, toggleAll } = useTrafficSelection();

    /**
     * BUSINESS LOGIC: Filter Context Key
     * 
     * Determines the unique context for filter persistence.
     * Each snapshot or version+period combination gets its own filter state.
     */
    const filterContextKey = useMemo(() => {
        if (selectedSnapshot) {
            return `snapshot-${selectedSnapshot}`;
        }
        return `version-${viewingVersion}-period-${viewingPeriodIndex}`;
    }, [selectedSnapshot, viewingVersion, viewingPeriodIndex]);

    // Filters Logic with Context-Aware Persistence
    const { filters, addFilter, removeFilter, clearFilters, applyFilters } = useTrafficFilters({
        contextKey: filterContextKey
    });
    const filteredSources = useMemo(() => applyFilters(displayedSources), [displayedSources, applyFilters]);

    // Settings (for CTR rules)
    const { trafficSettings } = useSettings();
    const ctrRules = trafficSettings?.ctrRules || [];

    // Niche Store Management
    const { initializeSubscriptions, cleanup } = useTrafficNicheStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();

    // Initialize niche subscriptions when user/channel are available
    useEffect(() => {
        if (user?.uid && currentChannel?.id) {
            initializeSubscriptions(user.uid, currentChannel.id);
        }
        return () => {
            cleanup();
        };
    }, [user?.uid, currentChannel?.id, initializeSubscriptions, cleanup]);

    // Detect scroll for sticky header shadow
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsScrolled(!entry.isIntersecting),
            { threshold: 0 }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    // Wrapper to catch upload errors and open mapper
    const handleUploadWithErrorTracking = async (sources: any[], totalRow?: any, file?: File) => {
        // If sources is empty and we have a file, it means parsing failed
        if (sources.length === 0 && file) {
            setFailedFile(file);
            setIsMapperOpen(true);
            return;
        }

        try {
            const newSnapshotId = await handleCsvUpload(sources, totalRow, file);
            if (newSnapshotId && onSnapshotClick) {
                onSnapshotClick(newSnapshotId);
            }
        } catch (error) {
            console.error('Upload failed:', error);
        }
    };

    // Derived UI State
    const isViewingOldVersion = viewingVersion && viewingVersion !== activeVersion;
    const headerTitle = 'Suggested Traffic';
    const isEmpty = displayedSources.length === 0;

    /**
     * BUSINESS LOGIC: Check if current viewing context has a snapshot with data
     * 
     * This determines whether to show action buttons (Filter, CTR Settings, Update CSV).
     * We need to check if there's a snapshot for the CURRENT PERIOD, not just any snapshot for the version.
     * 
     * Cases:
     * 1. Viewing a snapshot directly -> always has data (by definition)
     * 2. Viewing active version -> check if current period has a snapshot
     * 3. Viewing historical period -> check if that period has a snapshot
     */
    const hasExistingSnapshot = React.useMemo(() => {
        // If viewing a specific snapshot, it exists by definition
        if (selectedSnapshot) return true;

        const snapshots = trafficData?.snapshots || [];

        // Find snapshots for the viewing version
        const versionSnapshots = snapshots.filter((s: any) => s.version === viewingVersion);
        if (versionSnapshots.length === 0) return false;

        // Get the period we're viewing
        const versionData = packagingHistory.find((v: any) => v.versionNumber === viewingVersion);
        if (!versionData?.activePeriods) return false;

        const period = versionData.activePeriods[viewingPeriodIndex];
        if (!period) return false;

        // Check if any snapshot exists within this period's time range
        const periodStart = period.startDate;
        const periodEnd = period.endDate;

        const hasSnapshotInPeriod = versionSnapshots.some((s: any) => {
            const matchesStart = s.timestamp >= (periodStart - 5000);
            const matchesEnd = periodEnd ? s.timestamp <= (periodEnd + 5000) : true;
            return matchesStart && matchesEnd;
        });

        return hasSnapshotInPeriod;
    }, [trafficData?.snapshots, viewingVersion, viewingPeriodIndex, selectedSnapshot, packagingHistory]);

    // Compute Version Label (with Alias Support)
    // Returns object with main label and optional period label for separate styling
    const versionLabel = React.useMemo(() => {
        if (viewingVersion === 'draft') return { main: 'Draft', period: null };
        if (typeof viewingVersion === 'number') {
            // 1. Build the map (same logic as PackagingNav)
            const map = new Map<number, number>();
            const canonicalIds = Array.from(new Set(
                packagingHistory.map((v: any) => v.cloneOf || v.versionNumber)
            )).sort((a: number, b: number) => a - b);

            canonicalIds.forEach((id, index) => {
                map.set(id, index + 1);
            });

            // 2. Get the visual number for current viewing version
            const currentVersionData = packagingHistory.find((v: any) => v.versionNumber === viewingVersion);
            const canonicalId = currentVersionData?.cloneOf || viewingVersion;
            const visualNumber = map.get(canonicalId) || canonicalId;

            const main = `Version ${visualNumber}`;
            let period: string | null = null;

            // 3. Add period label if version has multiple active periods
            if (currentVersionData?.activePeriods && currentVersionData.activePeriods.length > 1) {
                const periodData = currentVersionData.activePeriods[viewingPeriodIndex];
                if (periodData) {
                    period = formatPremiumPeriod(periodData.startDate, periodData.endDate ?? null);
                }
            }

            return { main, period };
        }
        return null;
    }, [viewingVersion, viewingPeriodIndex, packagingHistory]);

    /**
     * BUSINESS LOGIC: Check if there are snapshots in previous versions
     * 
     * Determines if this is the "first version with traffic data".
     * A version is "first" if its oldest active period has closingSnapshotId === null.
     * This means there was no previous version active when this version was activated.
     * 
     * Example: v.2 is first if it was activated without any previous version having data.
     */
    // Check if there are snapshots in previous versions (Global Time-Based)
    const hasPreviousSnapshots = React.useMemo(() => {
        if (!viewingVersion || viewingVersion === 'draft') return false;

        // Find the current version's data
        const currentVersionData = packagingHistory.find((v: any) => v.versionNumber === viewingVersion);
        if (!currentVersionData?.activePeriods || currentVersionData.activePeriods.length === 0) {
            return false;
        }

        // Get the period we're viewing
        const viewingPeriod = currentVersionData.activePeriods[viewingPeriodIndex];
        if (!viewingPeriod) return false;

        // GLOBAL TIME-BASED CHECK:
        // Are there any snapshots OLDER than this period's start?
        // This matches the logic in useTrafficDataLoader
        const allSnapshots = trafficData?.snapshots || [];
        const hasOlderSnapshots = allSnapshots.some((s: any) => s.timestamp < viewingPeriod.startDate);

        return hasOlderSnapshots;
    }, [viewingVersion, viewingPeriodIndex, packagingHistory, trafficData?.snapshots]);

    // Check if this is the first snapshot of a version (for specific message)
    const isFirstSnapshot = React.useMemo(() => {
        if (!selectedSnapshot) return false;

        const snapshots = trafficData?.snapshots || [];
        // Get snapshots for this version only
        const versionSnapshots = snapshots
            .filter((s: any) => s.version === viewingVersion)
            .sort((a: any, b: any) => a.timestamp - b.timestamp);

        // Check if selected is the first one
        return versionSnapshots.length > 0 && versionSnapshots[0].id === selectedSnapshot;
    }, [selectedSnapshot, viewingVersion, trafficData?.snapshots]);

    // Show actions if: data exists OR (empty but has snapshots - could be delta mode)
    const shouldShowActions = !isEmpty || hasExistingSnapshot;

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div ref={sentinelRef} className="h-0" />

            {/* Sticky Header */}
            <TrafficHeader
                headerTitle={headerTitle}
                versionLabel={versionLabel} // Use computed alias
                isViewingOldVersion={!!isViewingOldVersion}
                viewingVersion={viewingVersion}
                shouldShowActions={shouldShowActions}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                isLoading={isLoading}
                hasExistingSnapshot={hasExistingSnapshot}
                onUpload={handleUploadWithErrorTracking}
                isScrolled={isScrolled}
                filters={filters}
                onAddFilter={addFilter}
                onRemoveFilter={removeFilter}
            />

            {/* Main Content - Table Area */}
            <div className="px-6 pb-0 pt-6 min-h-0 flex-1 flex flex-col overflow-hidden">
                <div className="w-full max-w-[1050px] relative flex-1 flex flex-col min-h-0">
                    {error ? (
                        <div className="flex-1 min-h-[400px]">
                            <TrafficErrorState error={error} onRetry={retry} />
                        </div>
                    ) : (
                        <>
                            <TrafficFilterChips
                                filters={filters}
                                onRemoveFilter={removeFilter}
                                onClearAll={clearFilters}
                            />
                            <div className="flex-1 min-h-0 relative w-full flex flex-col">
                                <TrafficTable
                                    data={filteredSources}
                                    groups={trafficData?.groups || []}
                                    selectedIds={selectedIds}
                                    isLoading={isLoading || isLoadingSnapshot}
                                    ctrRules={ctrRules}
                                    viewMode={viewMode}
                                    onToggleSelection={toggleSelection}
                                    onToggleAll={toggleAll}
                                    activeVersion={activeVersion}
                                    viewingVersion={viewingVersion}
                                    onUpload={handleUploadWithErrorTracking}
                                    hasExistingSnapshot={hasExistingSnapshot}
                                    hasPreviousSnapshots={hasPreviousSnapshots}
                                    isFirstSnapshot={isFirstSnapshot}
                                    hasActiveFilters={filters.length > 0}
                                >
                                    {/* Floating Action Bar - Absolute position relative to TrafficTable root */}
                                    {selectedIds.size > 0 && (
                                        <TrafficFloatingBar
                                            videos={displayedSources.filter(s => s.videoId && selectedIds.has(s.videoId))}
                                            position={{ x: 0, y: 0 }}
                                            onClose={() => toggleAll([])}
                                            isDocked={true}
                                            dockingStrategy="absolute"
                                        />
                                    )}
                                </TrafficTable>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modals */}
            <TrafficModals
                isMapperOpen={isMapperOpen}
                failedFile={failedFile}
                onMapperClose={() => setIsMapperOpen(false)}
                onCsvUpload={handleCsvUpload}
            />
        </div>
    );
};

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TrafficTable } from './components/TrafficTable';
import { TrafficHeader } from './components/TrafficHeader';
import { TrafficModals } from './components/TrafficModals';
import { TrafficEmptyState } from './components/TrafficEmptyState';
import { TrafficFilterChips } from './components/TrafficFilterChips';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { useTrafficDataLoader } from './hooks/useTrafficDataLoader';
import { useTrafficSelection } from './hooks/useTrafficSelection';
import { useTrafficFilters } from './hooks/useTrafficFilters';
import { useSettings } from '../../../../core/hooks/useSettings';

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
    const { displayedSources, isLoadingSnapshot } = useTrafficDataLoader({
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
    const hasExistingSnapshot = (trafficData?.snapshots || []).some((s: any) => s.version === activeVersion);

    // Compute Version Label (with Alias Support)
    // If viewingVersion is "draft", show "Draft"
    // If viewingVersion is a number, lookup in history for cloneOf alias
    // Compute Version Label (Visual Mapping)
    // We want the label to match the sidebar's visual sequence (v.1, v.2, v.3...)
    // regardless of internal gaps or clones.
    const versionLabel = React.useMemo(() => {
        if (viewingVersion === 'draft') return 'Draft';
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

            return `Version ${visualNumber}`;
        }
        return undefined;
    }, [viewingVersion, packagingHistory]);

    // Show actions if: data exists OR (empty but has snapshots - could be delta mode)
    const shouldShowActions = !isEmpty || hasExistingSnapshot;

    return (
        <div className="flex-1 flex flex-col">
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

            {/* Main Content - Table with its own scroll */}
            <div className="px-6 pb-6 pt-6">
                <div className="max-w-[1050px]" style={{ minHeight: '200px', maxHeight: 'calc(100vh - 200px)' }}>
                    <TrafficFilterChips
                        filters={filters}
                        onRemoveFilter={removeFilter}
                        onClearAll={clearFilters}
                    />

                    {isEmpty && !isLoading && !isLoadingSnapshot ? (
                        <TrafficEmptyState
                            onUpload={handleUploadWithErrorTracking}
                            hasExistingSnapshot={hasExistingSnapshot}
                            mode="no-data"
                        />
                    ) : (
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
                            hasActiveFilters={filters.length > 0}
                        />
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

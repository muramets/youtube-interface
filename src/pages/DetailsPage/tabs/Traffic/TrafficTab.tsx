import React, { useState, useRef, useEffect } from 'react';
import { TrafficTable } from './components/TrafficTable';
import { TrafficHeader } from './components/TrafficHeader';
import { TrafficModals } from './components/TrafficModals';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { useTrafficDataLoader } from './hooks/useTrafficDataLoader';
import { useTrafficSelection } from './hooks/useTrafficSelection';
import { useSettings } from '../../../../core/hooks/useSettings';

interface TrafficTabProps {
    video: VideoDetails;
    activeVersion: number;
    viewingVersion?: number | 'draft';
    selectedSnapshot?: string | null;
    // Shared state from DetailsLayout
    trafficData: any | null;
    isLoadingData: boolean;
    isSaving: boolean;
    handleCsvUpload: (sources: any[], totalRow?: any, file?: File) => Promise<string | null>;
    onSnapshotClick?: (id: string) => void;
}

export const TrafficTab: React.FC<TrafficTabProps> = ({
    video: _video,
    activeVersion,
    viewingVersion,
    selectedSnapshot,
    trafficData,
    isLoadingData: isLoading,
    handleCsvUpload,
    onSnapshotClick
}) => {
    // Scroll detection for sticky header
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // View Mode State: 'cumulative' shows total views, 'delta' shows new views since last snapshot
    const [viewMode, setViewMode] = useState<'cumulative' | 'delta'>('cumulative');

    // Modals State
    const [isMapperOpen, setIsMapperOpen] = useState(false);
    const [failedFile, setFailedFile] = useState<File | null>(null);

    // Custom hooks
    const { displayedSources, isLoadingSnapshot } = useTrafficDataLoader({
        trafficData,
        viewingVersion,
        activeVersion,
        viewMode,
        selectedSnapshot
    });

    const { selectedIds, toggleSelection, toggleAll } = useTrafficSelection();

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

    // Show actions if: data exists OR (empty but has snapshots - could be delta mode)
    const shouldShowActions = !isEmpty || hasExistingSnapshot;

    return (
        <div className="flex-1 flex flex-col">
            <div ref={sentinelRef} className="h-0" />

            {/* Sticky Header */}
            <TrafficHeader
                headerTitle={headerTitle}
                isViewingOldVersion={!!isViewingOldVersion}
                viewingVersion={viewingVersion}
                shouldShowActions={shouldShowActions}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                isLoading={isLoading}
                hasExistingSnapshot={hasExistingSnapshot}
                onUpload={handleUploadWithErrorTracking}
                isScrolled={isScrolled}
            />

            {/* Main Content - Table with its own scroll */}
            <div className="px-6 pb-6 pt-6">
                <div className="max-w-[1050px]" style={{ minHeight: '200px', maxHeight: 'calc(100vh - 200px)' }}>
                    <TrafficTable
                        data={displayedSources}
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
                    />
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

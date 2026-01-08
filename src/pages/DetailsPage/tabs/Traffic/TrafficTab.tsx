import React, { useState, useRef, useEffect, startTransition } from 'react';
import { SegmentedControl } from '../../../../components/ui/molecules/SegmentedControl';
import { FilterDropdown } from '../../../../components/ui/molecules/FilterDropdown';
import { TrafficTable } from './components/TrafficTable';
import { TrafficUploader } from './components/TrafficUploader';
import { ColumnMapperModal } from './modals/ColumnMapperModal';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { parseTrafficCsv } from '../../../../core/utils/csvParser';
import { TrafficService } from '../../../../core/services/TrafficService';

interface TrafficTabProps {
    video: VideoDetails;
    activeVersion: number;
    viewingVersion?: number | 'draft';
    selectedSnapshot?: string | null;
    // Shared state from DetailsLayout
    trafficData: any | null;
    isLoadingData: boolean;
    isSaving: boolean;
    handleCsvUpload: (sources: any[], totalRow?: any, file?: File) => Promise<void>;
}

export const TrafficTab: React.FC<TrafficTabProps> = ({
    video: _video,
    activeVersion,
    viewingVersion,
    selectedSnapshot,
    trafficData,
    isLoadingData: isLoading,
    isSaving,
    handleCsvUpload
}) => {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // View Mode State: 'cumulative' shows total views, 'delta' shows new views since last snapshot
    const [viewMode, setViewMode] = useState<'cumulative' | 'delta'>('cumulative');

    // Modals State
    const [isMapperOpen, setIsMapperOpen] = useState(false);
    const [failedFile, setFailedFile] = useState<File | null>(null);

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
            await handleCsvUpload(sources, totalRow, file);
        } catch (error) {
            console.error('Upload failed:', error);
        }
    };



    // State for displayed sources (async loading support)
    const [displayedSources, setDisplayedSources] = useState<any[]>([]);
    const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);

    // Load displayed data based on selected snapshot, version, and view mode
    useEffect(() => {
        const loadData = async () => {
            if (!trafficData?.sources) {
                setDisplayedSources([]);
                return;
            }

            // Priority 1: Specific snapshot selected
            if (selectedSnapshot) {
                setIsLoadingSnapshot(true);
                try {
                    const snapshot = trafficData.snapshots?.find((s: any) => s.id === selectedSnapshot);
                    if (snapshot) {
                        // Load from Storage if storagePath exists
                        if (snapshot.storagePath) {
                            const { downloadCsvSnapshot } = await import('../../../../core/services/storageService');
                            const { parseTrafficCsv } = await import('../../../../core/utils/csvParser');

                            const blob = await downloadCsvSnapshot(snapshot.storagePath);
                            const file = new File([blob], 'snapshot.csv', { type: 'text/csv' });
                            const { sources } = await parseTrafficCsv(file);
                            setDisplayedSources(sources);
                        } else if (snapshot.sources) {
                            // Legacy: sources in Firestore
                            setDisplayedSources(snapshot.sources);
                        } else {
                            setDisplayedSources([]);
                        }
                    } else {
                        setDisplayedSources([]);
                    }
                } catch (error) {
                    console.error('Failed to load snapshot:', error);
                    setDisplayedSources([]);
                } finally {
                    setIsLoadingSnapshot(false);
                }
                return;
            }

            // Priority 2: Version selected (no specific snapshot)
            if (viewingVersion === 'draft' || viewingVersion === activeVersion) {
                // Current version - synchronous
                if (viewMode === 'delta') {
                    // Delta: show new views since last snapshot
                    const delta = TrafficService.calculateVersionDelta(
                        trafficData.sources,
                        activeVersion,
                        trafficData.snapshots || []
                    );
                    setDisplayedSources(delta);
                } else {
                    // Cumulative: show total views
                    setDisplayedSources(trafficData.sources);
                }
            } else {
                // Historical version - async (may load from Storage)
                setIsLoadingSnapshot(true);
                try {
                    const sources = await TrafficService.getVersionSources(
                        viewingVersion as number,
                        trafficData.snapshots || []
                    );
                    setDisplayedSources(sources);
                } catch (error) {
                    console.error('Failed to load version sources:', error);
                    setDisplayedSources([]);
                } finally {
                    setIsLoadingSnapshot(false);
                }
            }
        };

        loadData();
    }, [trafficData, viewingVersion, activeVersion, viewMode, selectedSnapshot]);

    // Derived UI State
    const isViewingOldVersion = viewingVersion && viewingVersion !== activeVersion;
    const headerTitle = 'Suggested Traffic';
    const isEmpty = displayedSources.length === 0;

    return (
        <div className="flex-1 flex flex-col">
            <div ref={sentinelRef} className="h-0" />

            {/* Sticky Header */}
            <div className={`sticky top-0 z-10 px-6 py-4 transition-shadow duration-200 bg-video-edit-bg ${isScrolled ? 'shadow-[0_2px_8px_rgba(0,0,0,0.3)]' : ''}`}>
                <div className="flex items-center justify-between gap-4 max-w-[1050px]">
                    <div>
                        <h1 className="text-2xl font-medium text-text-primary">{headerTitle}</h1>
                        {isViewingOldVersion && (
                            <p className="text-sm text-text-secondary mt-1">
                                Viewing stats for Version {viewingVersion}
                            </p>
                        )}
                    </div>

                    {/* Actions - Only show if not empty */}
                    {!isEmpty && (
                        <div className="flex gap-2">
                            {/* View Mode Filter Menu */}
                            {!isLoading && (viewingVersion === 'draft' || viewingVersion === activeVersion) && (
                                <FilterDropdown align="right" width="280px">
                                    <div className="py-2">
                                        <div className="px-4 py-3 border-b border-[#2a2a2a]">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
                                                    View Mode
                                                </span>
                                            </div>
                                            <SegmentedControl
                                                options={[
                                                    { value: 'cumulative', label: 'Cumulative' },
                                                    { value: 'delta', label: 'Delta' }
                                                ]}
                                                value={viewMode}
                                                onChange={(val) => setViewMode(val as 'cumulative' | 'delta')}
                                            />
                                            <div className="mt-2 text-[10px] text-text-tertiary leading-relaxed grid">
                                                <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${viewMode === 'cumulative' ? 'opacity-100' : 'opacity-0'}`}>
                                                    Show total accumulated views
                                                </span>
                                                <span className={`col-start-1 row-start-1 transition-opacity duration-150 ${viewMode === 'delta' ? 'opacity-100' : 'opacity-0'}`}>
                                                    Show new views since last snapshot
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </FilterDropdown>
                            )}

                            {!isLoading && (
                                <TrafficUploader
                                    isCompact
                                    onUpload={handleUploadWithErrorTracking}
                                    isLoading={isSaving}
                                    hasExistingSnapshot={
                                        (trafficData?.snapshots || []).some((s: any) => s.version === activeVersion)
                                    }
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content - Table with its own scroll */}
            <div className="px-6 pb-6 pt-6">
                <div className="max-w-[1050px]" style={{ height: 'calc(100vh - 200px)' }}>
                    <TrafficTable
                        data={displayedSources}
                        groups={trafficData?.groups || []}
                        totalRow={trafficData?.totalRow}
                        selectedIds={selectedIds}
                        isLoading={isLoading || isLoadingSnapshot}
                        onToggleSelection={(id) => {
                            const newSet = new Set(selectedIds);
                            if (newSet.has(id)) newSet.delete(id);
                            else newSet.add(id);
                            setSelectedIds(newSet);
                        }}
                        onToggleAll={(ids) => {
                            // Use startTransition to defer the heavy state update
                            // This keeps the checkbox UI responsive while React batches the re-renders
                            startTransition(() => {
                                if (ids.every(i => selectedIds.has(i))) {
                                    setSelectedIds(new Set());
                                } else {
                                    setSelectedIds(new Set(ids));
                                }
                            });
                        }}
                        activeVersion={activeVersion}
                        viewingVersion={viewingVersion}
                        onUpload={handleUploadWithErrorTracking}
                        hasExistingSnapshot={(trafficData?.snapshots || []).some((s: any) => s.version === activeVersion)}
                    />
                </div>
            </div>

            {/* Modals */}
            <ColumnMapperModal
                isOpen={isMapperOpen}
                onClose={() => setIsMapperOpen(false)}
                file={failedFile}
                onConfirm={async (mapping) => {
                    if (!failedFile) return;
                    try {
                        const { sources, totalRow } = await parseTrafficCsv(failedFile, mapping);
                        await handleCsvUpload(sources, totalRow, failedFile);
                        setIsMapperOpen(false);
                    } catch (e) {
                        alert("Mapping failed to produce valid data.");
                    }
                }}
            />
        </div>
    );
};

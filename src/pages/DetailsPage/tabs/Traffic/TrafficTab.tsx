import React, { useState, useRef, useEffect, startTransition } from 'react';
import { TrafficTable } from './components/TrafficTable';
import { TrafficUploader } from './components/TrafficUploader';
import { ColumnMapperModal } from './modals/ColumnMapperModal';
import { useTrafficData } from './hooks/useTrafficData';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { parseTrafficCsv } from '../../../../core/utils/csvParser';
import { TrafficService } from '../../../../core/services/TrafficService';
import { BarChart3, TrendingUp } from 'lucide-react';

interface TrafficTabProps {
    video: VideoDetails;
    activeVersion: number;
    viewingVersion?: number | 'draft';
    selectedSnapshot?: string | null; // If set, show this specific snapshot
}

export const TrafficTab: React.FC<TrafficTabProps> = ({ video, activeVersion, viewingVersion, selectedSnapshot }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // View Mode State: 'cumulative' shows total views, 'delta' shows new views since last snapshot
    const [viewMode, setViewMode] = useState<'cumulative' | 'delta'>('cumulative');

    // Modals State
    const [isMapperOpen, setIsMapperOpen] = useState(false);
    const [failedFile, setFailedFile] = useState<File | null>(null);

    const {
        trafficData,
        isLoading,
        handleCsvUpload
    } = useTrafficData({
        userId: user?.uid || '',
        channelId: currentChannel?.id || '',
        video
    });

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
            await handleCsvUpload(sources, totalRow);
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
                    const snapshot = trafficData.snapshots?.find(s => s.id === selectedSnapshot);
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

                    {/* Actions */}
                    <div className="flex gap-2">
                        {/* View Mode Toggle */}
                        {!isLoading && (viewingVersion === 'draft' || viewingVersion === activeVersion) && (
                            <div className="flex gap-1 bg-bg-secondary rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('cumulative')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'cumulative'
                                        ? 'bg-accent text-white'
                                        : 'text-text-secondary hover:text-text-primary'
                                        }`}
                                    title="Show total views (cumulative)"
                                >
                                    <BarChart3 size={16} />
                                    Cumulative
                                </button>
                                <button
                                    onClick={() => setViewMode('delta')}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'delta'
                                        ? 'bg-accent text-white'
                                        : 'text-text-secondary hover:text-text-primary'
                                        }`}
                                    title="Show new views since last snapshot (delta)"
                                >
                                    <TrendingUp size={16} />
                                    Delta
                                </button>
                            </div>
                        )}

                        {!isLoading && (
                            <TrafficUploader
                                isCompact
                                onUpload={handleUploadWithErrorTracking}
                                hasExistingSnapshot={
                                    (trafficData?.snapshots || []).some(s => s.version === activeVersion)
                                }
                            />
                        )}
                    </div>
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
                        await handleCsvUpload(sources, totalRow);
                        setIsMapperOpen(false);
                    } catch (e) {
                        alert("Mapping failed to produce valid data.");
                    }
                }}
            />
        </div>
    );
};

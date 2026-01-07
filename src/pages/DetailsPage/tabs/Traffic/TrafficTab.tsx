import React, { useState, useRef, useEffect, useMemo, startTransition } from 'react';
import { TrafficTable } from './components/TrafficTable';
import { TrafficUploader } from './components/TrafficUploader';
import { ColumnMapperModal } from './components/ColumnMapperModal';
import { VersionPills } from './components/VersionPills';
import { useTrafficData } from './hooks/useTrafficData';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';
import type { VideoDetails } from '../../../../core/utils/youtubeApi';
import { parseTrafficCsv } from '../../../../core/utils/csvParser';
import { TrafficService } from '../../../../core/services/TrafficService';

interface TrafficTabProps {
    video: VideoDetails;
    activeVersion: number;
    viewingVersion?: number | 'draft';
}

export const TrafficTab: React.FC<TrafficTabProps> = ({ video, activeVersion, viewingVersion }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Version Selection State
    const [selectedVersion, setSelectedVersion] = useState<number | 'draft'>(viewingVersion || activeVersion);

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

    // Build version list from snapshots
    const versionList = useMemo(() => {
        const versions: Array<{ version: number | 'draft'; label: string }> = [];

        // Add saved versions from snapshots (sorted)
        const sortedSnapshots = [...(trafficData?.snapshots || [])].sort((a, b) => a.version - b.version);
        sortedSnapshots.forEach(snap => {
            versions.push({
                version: snap.version,
                label: `v.${snap.version}`
            });
        });

        // Add current version (always show)
        const hasDraft = viewingVersion === 'draft';
        const currentVersionExists = versions.some(v => v.version === activeVersion);

        // DEBUG: Phantom Draft Analysis
        console.log('[TrafficTab] Analyzing Version State:', {
            activeVersion,
            viewingVersion,
            hasDraft,
            currentVersionExists,
            snapshotsCount: trafficData?.snapshots?.length || 0,
            isLoading: isLoading
        });

        if (!currentVersionExists) {
            versions.push({
                version: activeVersion,
                label: hasDraft ? 'Draft' : `v.${activeVersion}`
            });
        }

        return versions;
    }, [trafficData, activeVersion, viewingVersion]);

    // Calculate displayed data based on selected version
    const displayedSources = useMemo(() => {
        if (!trafficData?.sources) return [];

        if (selectedVersion === 'draft' || selectedVersion === activeVersion) {
            // Current version - show delta from previous snapshot
            return TrafficService.calculateVersionDelta(
                trafficData.sources,
                activeVersion,
                trafficData.snapshots || []
            );
        } else {
            // Historical version - show snapshot data
            return TrafficService.getVersionSources(
                selectedVersion as number,
                trafficData.snapshots || []
            );
        }
    }, [trafficData, selectedVersion, activeVersion]);

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
                        {!isLoading && (
                            <TrafficUploader
                                isCompact
                                onUpload={handleUploadWithErrorTracking}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content - Table with its own scroll */}
            <div className="px-6 pb-6">
                {/* Version Pills - Always show */}
                <div className="mb-6 max-w-[1050px]">
                    <VersionPills
                        versions={versionList}
                        activeVersion={selectedVersion}
                        onVersionChange={setSelectedVersion}
                    />
                </div>

                <div className="max-w-[1050px]" style={{ height: 'calc(100vh - 200px)' }}>
                    <TrafficTable
                        data={displayedSources}
                        groups={trafficData?.groups || []}
                        totalRow={trafficData?.totalRow}
                        selectedIds={selectedIds}
                        isLoading={isLoading}
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
                        viewingVersion={selectedVersion}
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

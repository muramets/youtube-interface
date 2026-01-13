import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { TrafficTable, type SortConfig, type SortKey } from './components/TrafficTable';
import { TrafficHeader } from './components/TrafficHeader';
import { TrafficModals } from './components/TrafficModals';
import { TrafficFilterChips } from './components/TrafficFilterChips';
import { TrafficErrorState } from './components/TrafficErrorState';
import { TrafficFloatingBar } from './components/TrafficFloatingBar';
// MissingTitlesModal is now wrapped in TrafficModals
import { useMissingTitles, repairTrafficSources } from './hooks/useMissingTitles';
import { generateTrafficCsv } from './utils/csvGenerator';
import { useApiKey } from '../../../../core/hooks/useApiKey';
import { useSuggestedVideos } from './hooks/useSuggestedVideos';


// ... imports

import type { VideoDetails } from '../../../../core/utils/youtubeApi';

import { useTrafficSelection } from './hooks/useTrafficSelection';
import { useSettings } from '../../../../core/hooks/useSettings';
import { formatPremiumPeriod } from './utils/dateUtils';
import { useTrafficNicheStore } from '../../../../core/stores/useTrafficNicheStore';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useVideos } from '../../../../core/hooks/useVideos';
import { useSmartNicheSuggestions } from './hooks/useSmartNicheSuggestions';
import { assistantLogger } from '../../../../core/utils/logger';
import { useTrafficTypeStore } from '../../../../core/stores/useTrafficTypeStore';
import { useSmartTrafficAutoApply } from './hooks/useSmartTrafficAutoApply';

import type { TrafficSource } from '../../../../core/types/traffic';

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
    // Lifted Props
    displayedSources: TrafficSource[];
    viewMode: 'cumulative' | 'delta';
    onViewModeChange: (mode: 'cumulative' | 'delta') => void;
    isLoadingSnapshot: boolean;
    error: Error | null;
    retry: () => void;
    // Niche Data
    groups: import('../../../../core/types/traffic').TrafficGroup[];
    // Filter Props (Lifted)
    filters: import('../../../../core/types/traffic').TrafficFilter[];
    onAddFilter: (filter: Omit<import('../../../../core/types/traffic').TrafficFilter, 'id'>) => void;
    onRemoveFilter: (id: string) => void;
    onClearFilters: () => void;
    applyFilters: (sources: import('../../../../core/types/traffic').TrafficSource[], groups?: import('../../../../core/types/traffic').TrafficGroup[]) => import('../../../../core/types/traffic').TrafficSource[];
    // Sorting (Lifted)
    sortConfig: SortConfig | null;
    onSort: (key: SortKey) => void;
    actualTotalRow?: TrafficSource;
    trashMetrics?: import('./hooks/useTrafficDataLoader').TrashMetrics;
    deltaContext?: import('./hooks/useTrafficDataLoader').DeltaContext;
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
    packagingHistory = [],
    // Lifted props
    displayedSources,
    viewMode,
    onViewModeChange: setViewMode,
    isLoadingSnapshot,
    error,
    retry,
    groups,
    filters,
    onAddFilter: addFilter,
    onRemoveFilter: removeFilter,
    onClearFilters: clearFilters,

    applyFilters,
    sortConfig,
    onSort,
    actualTotalRow,
    trashMetrics,
    deltaContext
}) => {
    // Scroll detection for sticky header
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Modals State
    const [isMapperOpen, setIsMapperOpen] = useState(false);
    const [failedFile, setFailedFile] = useState<File | null>(null);
    const [isMissingTitlesModalOpen, setIsMissingTitlesModalOpen] = useState(false);
    const [missingTitlesVariant, setMissingTitlesVariant] = useState<'sync' | 'assistant'>('sync');

    // Pending Upload State (for Pre-Upload Checks)
    const [pendingUpload, setPendingUpload] = useState<{
        sources: TrafficSource[],
        totalRow?: any,
        file?: File
    } | null>(null);

    // Initial Auth & API Key
    const { user } = useAuth();
    const { apiKey } = useApiKey();
    const { currentChannel } = useChannelStore();

    // Video Data: Home Videos + Suggested Videos
    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { suggestedVideos } = useSuggestedVideos(user?.uid || '', currentChannel?.id || '');

    // OPTIMIZATION: Merge home videos and suggested videos for tooltip lookup
    const allVideos = useMemo(() => {
        return [...homeVideos, ...suggestedVideos];
    }, [homeVideos, suggestedVideos]);

    // 1. Existing/Post-Load Missing Titles Logic
    const {
        missingCount: existingMissingCount,
        unenrichedCount: existingUnenrichedCount,
        estimatedQuota: existingEstimatedQuota,
        fetchMissingTitles: fetchExistingMissingTitles,
        isRestoring: isRestoringExisting
    } = useMissingTitles({
        displayedSources,
        userId: user?.uid || '',
        channelId: currentChannel?.id || '',
        trafficVideoId: _video.id,
        activeVersion,
        apiKey: apiKey || '',
        currentSnapshotId: selectedSnapshot,
        cachedVideos: allVideos,
        onDataRestored: (_newSources, newSnapshotId) => {
            setIsMissingTitlesModalOpen(false);

            // Force reload of traffic data (CSV) because in-place update won't change ID
            if (retry) {
                retry();
            }

            if (onSnapshotClick) {
                onSnapshotClick(newSnapshotId); // Reload with new snapshot
            }
        },
        trafficData
    });

    // 2. Pre-Upload Pending Logic
    const pendingMissingCount = useMemo(() => {
        if (!pendingUpload) return 0;
        return pendingUpload.sources.filter(s => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === '')).length;
    }, [pendingUpload]);

    const pendingEstimatedQuota = Math.ceil(pendingMissingCount / 50) * 7;
    const [isRestoringPending, setIsRestoringPending] = useState(false);

    // Determines which "mode" the modal is in
    const isPendingMode = !!pendingUpload;
    const estimatedQuota = isPendingMode ? pendingEstimatedQuota : existingEstimatedQuota;
    const isRestoring = isPendingMode ? isRestoringPending : isRestoringExisting;

    // Auto-open modal if missing titles detected in displayed data (only if not pending)
    // AND if user has not explicitly dismissed/handled it (could add flag, but current logic is fine)
    useEffect(() => {
        if (!pendingUpload && existingMissingCount > 0 && !isRestoringExisting) {
            setIsMissingTitlesModalOpen(true);
        }
    }, [existingMissingCount, isRestoringExisting, pendingUpload]);


    // Filter Logic and Selection...

    const { selectedIds, toggleSelection, toggleAll } = useTrafficSelection();

    // Niche Store Management - Consolidated
    const {
        niches: allNiches,
        assignments: allAssignments,
        assignVideoToTrafficNiche,
        initializeSubscriptions,
        cleanup
    } = useTrafficNicheStore();

    // Check if this is the first snapshot of a version (for specific message)
    const isFirstSnapshot = React.useMemo(() => {
        // 1. Specific Snapshot Selection
        if (selectedSnapshot) {
            const snapshots = trafficData?.snapshots || [];
            const versionSnapshots = snapshots
                .filter((s: any) => s.version === viewingVersion)
                .sort((a: any, b: any) => a.timestamp - b.timestamp);
            return versionSnapshots.length > 0 && versionSnapshots[0].id === selectedSnapshot;
        }

        // 2. Viewing a Version (History Mode)
        if (viewingVersion !== 'draft' && packagingHistory.length > 0) {
            // Sort history to find the absolute oldest version
            const sortedHistory = [...packagingHistory].sort((a, b) => a.versionNumber - b.versionNumber);
            const isOldestVersion = sortedHistory[0].versionNumber === viewingVersion;

            // If we are viewing the oldest version AND the first period (start of time)
            // Then this is effectively the "First Snapshot" state
            if (isOldestVersion && (!viewingPeriodIndex || viewingPeriodIndex === 0)) {
                return true;
            }
        }

        return false;
        return false;
    }, [selectedSnapshot, viewingVersion, trafficData?.snapshots, packagingHistory, viewingPeriodIndex]);

    // Traffic Type Store
    const {
        edges: trafficEdges,
        initialize: initTrafficTypes,
        setTrafficType: toggleTrafficType,
        deleteTrafficType
    } = useTrafficTypeStore();

    // Initialize store when video changes
    useEffect(() => {
        if (_video.id) {
            initTrafficTypes(_video.id);
        }
    }, [_video.id, initTrafficTypes]);

    // Filters are now managed by parent (DetailsLayout)
    const filteredSources = useMemo(() => {
        // Force empty if First Version in Delta Mode (Growth Analysis requires history)
        if (viewMode === 'delta' && isFirstSnapshot) {
            return [];
        }

        // Inject Traffic Type for Sorting/Filtering before applying other filters
        // We do this by creating a synthetic property on the source objects if needed, 
        // but sorting is handled by the table using the edges map or we can enrich here.
        // BETTER: Enrich here so "applyFilters" could potentially filter by type in future.
        const enrichedSources = displayedSources.map(s => ({
            ...s,
            trafficType: s.videoId ? trafficEdges[s.videoId]?.type : undefined
        }));

        let sources = applyFilters(enrichedSources, groups);

        // Global Trash Filter: Hide videos assigned to Trash
        const trashNiche = allNiches.find(n => n.name.trim().toLowerCase() === 'trash');
        const isFilteringTrash = trashNiche && filters.some(f => {
            if (f.type !== 'niche') return false;
            // Check for array or single value
            if (Array.isArray(f.value)) {
                return f.value.includes(trashNiche.id);
            }
            return f.value === trashNiche.id;
        });

        if (trashNiche && !isFilteringTrash) {
            const trashVideoIds = new Set(
                allAssignments
                    .filter(a => a.nicheId === trashNiche.id)
                    .map(a => a.videoId)
            );
            sources = sources.filter(s => !s.videoId || !trashVideoIds.has(s.videoId));
        }

        return sources;
    }, [displayedSources, applyFilters, groups, allNiches, allAssignments, viewMode, isFirstSnapshot, filters, trafficEdges]);

    // Handle Traffic Type Toggle
    const handleToggleTrafficType = useCallback((videoId: string, currentType?: import('../../../../core/types/videoTrafficType').TrafficType) => {
        // 3-State Cycle: Unknown -> Autoplay -> Click -> Unknown (delete)

        if (!currentType) {
            toggleTrafficType(videoId, 'autoplay', 'manual');
        } else if (currentType === 'autoplay') {
            toggleTrafficType(videoId, 'user_click', 'manual');
        } else if (currentType === 'user_click') {
            // Cycle back to unset
            deleteTrafficType(videoId);
        }
    }, [toggleTrafficType, deleteTrafficType]);

    // OPTIMIZATION: Memoize array props to prevent TrafficTable re-renders.
    // Without memoization, `|| []` creates a new array reference each render.
    const { trafficSettings } = useSettings();
    const ctrRules = useMemo(() => trafficSettings?.ctrRules || [], [trafficSettings?.ctrRules]);
    // groups is now passed as prop

    // user and currentChannel hooks moved up

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

    // -------------------------------------------------------------------------
    // SMART ASSISTANT LOGIC
    // -------------------------------------------------------------------------
    const [isAssistantEnabled, setIsAssistantEnabled] = useState(false);

    // Auto-Apply Logic: Automatically tag videos as "Autoplay" if 0 Imp / >0 Views
    useSmartTrafficAutoApply(isAssistantEnabled, filteredSources);

    // Connect to the Store to get assignment history - ALREADY DESTRUCTURED ABOVE

    const { getSuggestion } = useSmartNicheSuggestions(
        displayedSources,
        allAssignments,
        allNiches,
        allVideos
    );

    // Wrapper to respect the toggle state
    const getActiveSuggestion = useCallback((videoId: string) => {
        if (!isAssistantEnabled) return null;
        const suggestion = getSuggestion(videoId);
        return suggestion ? suggestion.targetNiche : null;
    }, [isAssistantEnabled, getSuggestion]);

    // Handle Confirmation (Single or Bulk)
    const handleConfirmSuggestion = useCallback(async (videoId: string, targetNiche: import('../../../../core/types/suggestedTrafficNiches').SuggestedTrafficNiche) => {
        if (!user?.uid || !currentChannel?.id) return;

        // Check if we have multiple selected items including this one
        const isBulkAction = selectedIds.has(videoId) && selectedIds.size > 1;

        if (isBulkAction) {
            // Bulk Confirm: Apply to ALL selected videos that have THIS SAME suggestion
            // Logic: Iterate selected IDs -> check if they have a suggestion -> if match targetNiche -> assign
            const promises: Promise<void>[] = [];

            selectedIds.forEach(selectedId => {
                const suggestion = getActiveSuggestion(selectedId);
                // We confirm for all selected videos that are suggested the SAME niche
                if (suggestion && suggestion.id === targetNiche.id) {
                    promises.push(assignVideoToTrafficNiche(selectedId, targetNiche.id, user.uid, currentChannel!.id));
                }
            });

            await Promise.all(promises);
            // Optionally clear selection? keeping it seems better flow
        } else {
            // Single Confirm
            await assignVideoToTrafficNiche(videoId, targetNiche.id, user.uid, currentChannel.id);
        }
    }, [user?.uid, currentChannel?.id, selectedIds, getActiveSuggestion, assignVideoToTrafficNiche]);

    // -------------------------------------------------------------------------

    const [isSkipping, setIsSkipping] = useState(false);

    // Wrapper to catch upload errors and open mapper - memoized to prevent re-renders
    const handleUploadWithErrorTracking = React.useCallback(async (sources: any[], totalRow?: any, file?: File) => {
        // If sources is empty and we have a file, it means parsing failed
        if (sources.length === 0 && file) {
            setFailedFile(file);
            setIsMapperOpen(true);
            return;
        }

        let wasPatched = false;

        // OPTIMIZATION: Try to patch missing titles from cache (allVideos) before checking
        // This prevents the assistant modal from appearing if we already know the data
        const patchedSources = sources.map(s => {
            if (s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === '')) {
                const cachedVideo = allVideos.find(v => v.id === s.videoId);
                if (cachedVideo) {
                    wasPatched = true;
                    return {
                        ...s,
                        sourceTitle: cachedVideo.title || s.sourceTitle,
                        channelId: cachedVideo.channelId || s.channelId,
                        // We can also patch other fields if needed
                    };
                }
            }
            return s;
        });

        // PRE-CHECK: Missing Titles (on patched data)
        const hasMissingTitles = patchedSources.some((s: any) => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === ''));

        if (hasMissingTitles && file) {
            setPendingUpload({ sources: patchedSources, totalRow, file });
            setIsMissingTitlesModalOpen(true);
            return;
        }

        try {
            let finalFile = file;

            // If we patched any data, we MUST regenerate the CSV file so that the
            // patches are persisted in Storage (the source of truth)
            if (wasPatched && file) {
                const newCsvContent = generateTrafficCsv(patchedSources, totalRow);
                finalFile = new File([newCsvContent], file.name, { type: "text/csv" });
                console.log('[TrafficTab] Regenerated CSV with patched titles from cache');
            }

            // Upload the patched sources and potentially regenerated file
            const newSnapshotId = await handleCsvUpload(patchedSources, totalRow, finalFile);
            if (newSnapshotId && onSnapshotClick) {
                onSnapshotClick(newSnapshotId);
            }
        } catch (error) {
            console.error('Upload failed:', error);
        }
    }, [handleCsvUpload, onSnapshotClick, allVideos]);

    // Handler for Syncing Pending Upload
    const handleConfirmPendingSync = async () => {
        if (!pendingUpload) return;
        setIsRestoringPending(true);
        try {
            // Repair sources
            const repairedSources = await repairTrafficSources(
                pendingUpload.sources,
                user?.uid || '',
                currentChannel?.id || '',
                apiKey || '',
                allVideos
            );

            // Generate new CSV from repaired sources
            const newCsvContent = generateTrafficCsv(repairedSources, pendingUpload.totalRow);
            const repairedFile = new File([newCsvContent], pendingUpload.file?.name || 'traffic_data.csv', { type: "text/csv" });

            // Proceed with upload
            const newSnapshotId = await handleCsvUpload(repairedSources, pendingUpload.totalRow, repairedFile);

            if (newSnapshotId && onSnapshotClick) {
                onSnapshotClick(newSnapshotId);
            }

            // Cleanup
            setPendingUpload(null);
            setIsMissingTitlesModalOpen(false);

        } catch (err) {
            console.error("Failed to repair pending upload:", err);
            // Optionally show error toast
        } finally {
            setIsRestoringPending(false);
        }
    };

    const handleRepairConfirm = async () => {
        await fetchExistingMissingTitles();
        setIsMissingTitlesModalOpen(false);
        // If we were prompted by the Assistant, auto-enable it after successful sync
        if (missingTitlesVariant === 'assistant') {
            setIsAssistantEnabled(true);
        }
    };

    // Handler for Skipping Pending Sync (Upload as is)
    const handleSkipPendingSync = async () => {
        if (!pendingUpload || isSkipping || isRestoringPending) return;

        setIsSkipping(true);
        try {
            // Upload original data (or whatever was patched before determining it was still incomplete)
            const newSnapshotId = await handleCsvUpload(pendingUpload.sources, pendingUpload.totalRow, pendingUpload.file);

            if (newSnapshotId && onSnapshotClick) {
                onSnapshotClick(newSnapshotId);
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setPendingUpload(null);
            setIsMissingTitlesModalOpen(false);
            setIsSkipping(false);
        }
    };


    // Derived UI State
    const isViewingOldVersion = viewingVersion && viewingVersion !== activeVersion;
    const headerTitle = 'Suggested Traffic';
    const isEmpty = displayedSources.length === 0;

    // OPTIMIZATION: Memoize FloatingBar props to prevent re-renders from affecting TrafficTable.
    // These are stable references that only change when selection or data actually changes.
    const selectedTrafficVideos = useMemo(
        () => displayedSources.filter(s => s.videoId && selectedIds.has(s.videoId)),
        [displayedSources, selectedIds]
    );
    const clearFloatingBar = React.useCallback(() => toggleAll([]), [toggleAll]);

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
                groups={groups}
                trafficSources={displayedSources}
                missingTitlesCount={existingMissingCount}
                onOpenMissingTitles={() => {
                    setMissingTitlesVariant('sync');
                    setIsMissingTitlesModalOpen(true);
                }}
                isAssistantEnabled={isAssistantEnabled}
                onToggleAssistant={() => {
                    assistantLogger.debug('onToggleAssistant clicked', {
                        currentEnabled: isAssistantEnabled,
                        missingCount: existingMissingCount,
                        unenrichedCount: existingUnenrichedCount
                    });

                    // Smart Check: If we have missing titles OR unenriched data, prompt to sync first
                    if (!isAssistantEnabled && (existingMissingCount > 0 || existingUnenrichedCount > 0)) {
                        assistantLogger.info('Blocking assistant activation, prompting for sync');
                        setMissingTitlesVariant('assistant');
                        setIsMissingTitlesModalOpen(true);
                        return;
                    }
                    assistantLogger.debug('Toggling assistant state');
                    setIsAssistantEnabled(prev => !prev);
                }}
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
                                    isViewingSnapshot={!!selectedSnapshot}
                                    hasActiveFilters={filters.length > 0}
                                    onSwitchToTotal={() => setViewMode('cumulative')}
                                    videos={allVideos}
                                    sortConfig={sortConfig}
                                    onSort={onSort}
                                    getSuggestion={getActiveSuggestion}
                                    onConfirmSuggestion={handleConfirmSuggestion}
                                    actualTotalRow={actualTotalRow}
                                    trashMetrics={trashMetrics}
                                    deltaContext={deltaContext}
                                    // Traffic Type Props
                                    trafficEdges={trafficEdges}
                                    onToggleTrafficType={handleToggleTrafficType}
                                />

                                {/* Floating Action Bar - Positioned absolutely relative to parent container */}
                                {selectedIds.size > 0 && (
                                    <TrafficFloatingBar
                                        videos={selectedTrafficVideos}
                                        homeVideos={homeVideos}
                                        position={{ x: 0, y: 0 }}
                                        onClose={clearFloatingBar}
                                        isDocked={true}
                                        dockingStrategy="absolute"
                                    />
                                )}
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

                // Missing Titles Props
                isMissingTitlesOpen={isMissingTitlesModalOpen}
                missingTitlesCount={isPendingMode ? pendingMissingCount : (existingMissingCount + existingUnenrichedCount)}
                estimatedQuota={estimatedQuota}
                onMissingTitlesConfirm={isPendingMode ? handleConfirmPendingSync : handleRepairConfirm}
                onMissingTitlesClose={() => {
                    if (isPendingMode) {
                        handleSkipPendingSync();
                    } else {
                        setIsMissingTitlesModalOpen(false);
                    }
                }}
                isRestoringTitles={isRestoring}
                missingTitlesVariant={missingTitlesVariant}
            />
        </div>
    );
};

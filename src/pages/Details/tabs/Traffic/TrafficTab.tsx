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
import { exportTrafficCsv, downloadCsv, generateExportFilename, generateDiscrepancyReport } from './utils/exportTrafficCsv';
import { useApiKey } from '../../../../core/hooks/useApiKey';
import { useSuggestedVideoLookup } from './hooks/useSuggestedVideoLookup';
import { useAppContextStore } from '../../../../core/stores/appContextStore';
import type { SuggestedTrafficContext, SuggestedVideoItem } from '../../../../core/types/appContext';


// ... imports

import type { VideoDetails } from '../../../../core/utils/youtubeApi';

import { useTrafficSelection } from './hooks/useTrafficSelection';
import { useSettings } from '../../../../core/hooks/useSettings';
import { formatPremiumPeriod } from './utils/dateUtils';
import { useTrafficNicheStore } from '../../../../core/stores/useTrafficNicheStore';
import { useTrafficNoteStore } from '../../../../core/stores/useTrafficNoteStore';
import { useAuth } from '../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../core/stores/channelStore';
import { useVideos } from '../../../../core/hooks/useVideos';
import { useSmartNicheSuggestions } from './hooks/useSmartNicheSuggestions';
import { assistantLogger } from '../../../../core/utils/logger';
import { useTrafficTypeStore } from '../../../../core/stores/useTrafficTypeStore';
import { useSmartTrafficAutoApply } from './hooks/useSmartTrafficAutoApply';
import { useViewerTypeStore } from '../../../../core/stores/useViewerTypeStore';
import { useTrendStore } from '../../../../core/stores/trendStore';
import { useSmartViewerTypeAutoApply } from './hooks/useSmartViewerTypeAutoApply';
import { useVideoReactionStore } from '../../../../core/stores/useVideoReactionStore';

import type { TrafficSource } from '../../../../core/types/traffic';

interface TrafficTabProps {
    video: VideoDetails;
    activeVersion: number;
    viewingVersion?: number | 'draft';
    viewingPeriodIndex?: number;
    selectedSnapshot?: string | null;
    // Shared state from DetailsLayout
    trafficData: import('../../../../core/types/traffic').TrafficData | null;
    isLoadingData: boolean;
    isSaving: boolean;
    handleCsvUpload: (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => Promise<string | null>;
    onSnapshotClick?: (id: string) => void;
    packagingHistory?: import('../../../../core/types/versioning').PackagingVersion[]; // Passed to resolve version aliases
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
        totalRow?: TrafficSource,
        file?: File
    } | null>(null);

    // Initial Auth & API Key
    const { user } = useAuth();
    const { apiKey } = useApiKey();
    const { currentChannel } = useChannelStore();

    // Video Data: Home Videos + per-document suggested video lookup
    const { videos: homeVideos } = useVideos(user?.uid || '', currentChannel?.id || '');

    // Extract video IDs from displayedSources for on-demand Firestore queries
    const sourceVideoIds = useMemo(() => {
        return displayedSources
            .map(s => s.videoId)
            .filter((id): id is string => !!id);
    }, [displayedSources]);

    // Fetch only the needed suggested videos (not the entire 4650-doc collection)
    const { videoMap: suggestedVideoMap } = useSuggestedVideoLookup(
        sourceVideoIds,
        user?.uid || '',
        currentChannel?.id || ''
    );

    // Merge home videos and fetched suggested videos for downstream consumers
    const allVideos = useMemo(() => {
        return [...homeVideos, ...Array.from(suggestedVideoMap.values())];
    }, [homeVideos, suggestedVideoMap]);

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
            assistantLogger.debug('[DEBUG-MODAL] onDataRestored called', {
                newSnapshotId,
                newSourcesCount: _newSources.length,
                newSourcesWithChannelId: _newSources.filter(s => !!s.channelId).length,
                newSourcesWithoutChannelId: _newSources.filter(s => s.videoId && !s.channelId).length
            });
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

    const pendingEstimatedQuota = Math.ceil(pendingMissingCount / 50) * 2;
    const [isRestoringPending, setIsRestoringPending] = useState(false);

    // Determines which "mode" the modal is in
    const isPendingMode = !!pendingUpload;
    const estimatedQuota = isPendingMode ? pendingEstimatedQuota : existingEstimatedQuota;
    const isRestoring = isPendingMode ? isRestoringPending : isRestoringExisting;

    // Auto-open modal if missing titles detected in displayed data (only if not pending)
    // AND if user has not explicitly dismissed/handled it (could add flag, but current logic is fine)
    useEffect(() => {
        if (!pendingUpload && existingMissingCount > 0 && !isRestoringExisting) {
            assistantLogger.debug('[DEBUG-MODAL] Auto-open: missing titles detected', {
                existingMissingCount,
                isRestoringExisting
            });
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
        addTrafficNiche,
        initializeSubscriptions,
        cleanup
    } = useTrafficNicheStore();

    // Traffic Notes Store
    const {
        initializeSubscription: initNotes,
        cleanup: cleanupNotes,
        notes: noteEdges
    } = useTrafficNoteStore();

    // Video Reactions Store (star/like/dislike — channel-level)
    const {
        initializeSubscription: initReactions,
        cleanup: cleanupReactions,
        toggleReaction,
        reactions: reactionEdges
    } = useVideoReactionStore();

    // Check if this is the first snapshot of a version (for specific message)
    const isFirstSnapshot = React.useMemo(() => {
        // 1. Specific Snapshot Selection
        if (selectedSnapshot) {
            const snapshots = trafficData?.snapshots || [];
            const versionSnapshots = snapshots
                .filter((s: import('../../../../core/types/traffic').TrafficSnapshot) => s.version === viewingVersion)
                .sort((a: import('../../../../core/types/traffic').TrafficSnapshot, b: import('../../../../core/types/traffic').TrafficSnapshot) => a.timestamp - b.timestamp);
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
    }, [selectedSnapshot, viewingVersion, trafficData?.snapshots, packagingHistory, viewingPeriodIndex]);

    // Compute effective snapshot ID for per-snapshot edge storage
    // Uses selectedSnapshot if available, otherwise finds latest snapshot for current version/period
    const effectiveSnapshotId = useMemo(() => {
        // 1. Specific snapshot selected
        if (selectedSnapshot) {
            return selectedSnapshot;
        }

        // 2. Find latest snapshot for current version/period
        const snapshots = trafficData?.snapshots || [];
        const versionSnapshots = snapshots
            .filter((s: import('../../../../core/types/traffic').TrafficSnapshot) => s.version === viewingVersion)
            .sort((a: import('../../../../core/types/traffic').TrafficSnapshot, b: import('../../../../core/types/traffic').TrafficSnapshot) => b.timestamp - a.timestamp); // Newest first

        if (versionSnapshots.length > 0) {
            return versionSnapshots[0].id;
        }

        // 3. No snapshots available - use a placeholder
        // This will result in an empty edges state until a snapshot exists
        return null;
    }, [selectedSnapshot, viewingVersion, trafficData?.snapshots]);

    // Traffic Type Store
    const {
        edges: trafficEdges,
        initialize: initTrafficTypes,
        setTrafficType: toggleTrafficType,
        deleteTrafficType
    } = useTrafficTypeStore();

    // Viewer Type Store
    const {
        edges: viewerEdges,
        initialize: initViewerTypes,
        setViewerType: updateViewerType,
        deleteViewerType: deleteViewerTypeRecord
    } = useViewerTypeStore();

    // Initialize store when video or snapshot changes
    useEffect(() => {
        if (user?.uid && _video.id && effectiveSnapshotId) {
            initTrafficTypes(user.uid, _video.id, effectiveSnapshotId);
            initViewerTypes(user.uid, _video.id, effectiveSnapshotId);
        }
    }, [user?.uid, _video.id, effectiveSnapshotId, initTrafficTypes, initViewerTypes]);

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
        const enrichedSources = displayedSources.map(s => {
            const cachedVideo = s.videoId ? allVideos.find(v => v.id === s.videoId) : undefined;
            return {
                ...s,
                publishedAt: s.publishedAt || cachedVideo?.publishedAt,
                trafficType: s.videoId ? trafficEdges[s.videoId]?.type : undefined,
                trafficSource: s.videoId ? trafficEdges[s.videoId]?.source : undefined,
                viewerType: s.videoId ? viewerEdges[s.videoId]?.type : undefined,
                viewerSource: s.videoId ? viewerEdges[s.videoId]?.source : undefined,
                description: s.videoId ? cachedVideo?.description : undefined,
                tags: s.videoId ? cachedVideo?.tags : undefined
            };
        });

        let sources = applyFilters(enrichedSources, groups);

        // Global Trash Filter: Hide videos assigned to Trash
        const trashNiche = allNiches.find(n => n.name.trim().toLowerCase() === 'trash');
        const isFilteringTrash = trashNiche && filters.some(f => {
            if (f.type !== 'niche') return false;
            // Check for array or single value
            if (Array.isArray(f.value)) {
                return (f.value as string[]).includes(trashNiche.id);
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
    }, [displayedSources, applyFilters, groups, allNiches, allAssignments, viewMode, isFirstSnapshot, filters, trafficEdges, viewerEdges, allVideos]);

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

    // Handle Viewer Type Toggle
    const handleToggleViewerType = useCallback((videoId: string, currentType?: import('../../../../core/types/viewerType').ViewerType) => {
        // Cycle: bouncer -> trialist -> explorer -> interested -> core -> passive -> unset
        const types: import('../../../../core/types/viewerType').ViewerType[] = ['bouncer', 'trialist', 'explorer', 'interested', 'core', 'passive'];

        if (!currentType) {
            updateViewerType(videoId, types[0], 'manual');
        } else {
            const index = types.indexOf(currentType);
            if (index === types.length - 1) {
                deleteViewerTypeRecord(videoId);
            } else {
                updateViewerType(videoId, types[index + 1], 'manual');
            }
        }
    }, [updateViewerType, deleteViewerTypeRecord]);

    // Build reaction lookup map (videoId -> reaction) for TrafficTable
    const reactionMap = useMemo(() => {
        const map: Record<string, import('../../../../core/types/videoReaction').VideoReaction> = {};
        for (const edge of reactionEdges) {
            map[edge.videoId] = edge.reaction;
        }
        return map;
    }, [reactionEdges]);

    // Handle Reaction Toggle
    const handleToggleReaction = useCallback((videoId: string, reaction: import('../../../../core/types/videoReaction').VideoReaction) => {
        if (!user?.uid || !currentChannel?.id) return;
        toggleReaction(videoId, reaction, user.uid, currentChannel.id);
    }, [toggleReaction, user?.uid, currentChannel?.id]);

    // Build note lookup map (videoId -> text) for CSV export
    const noteMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const edge of noteEdges) {
            map[edge.videoId] = edge.text;
        }
        return map;
    }, [noteEdges]);

    // Handle CSV Export
    const handleExport = useCallback(() => {
        // Build assignments map
        const assignmentsMap: Record<string, string> = {};
        allAssignments.forEach(a => {
            assignmentsMap[a.videoId] = a.nicheId;
        });

        // Calculate table sums (same logic as TrafficTable)
        const tableSum = filteredSources.reduce((acc, s) => ({
            impressions: acc.impressions + s.impressions,
            views: acc.views + s.views
        }), { impressions: 0, views: 0 });

        // Generate Discrepancy Reports
        const reports: string[] = [];

        // 1. Impressions Discrepancy
        if (actualTotalRow) {
            const impReport = generateDiscrepancyReport(
                actualTotalRow.impressions,
                tableSum.impressions,
                trashMetrics?.impressions,
                deltaContext?.impressions,
                deltaContext?.isIncomplete
            );
            if (impReport) {
                reports.push(`[IMPRESSIONS REPORT]\n# ${impReport}`);
            }

            // 2. Views Discrepancy
            const viewsReport = generateDiscrepancyReport(
                actualTotalRow.views,
                tableSum.views,
                trashMetrics?.views,
                deltaContext?.views, // Pass full DeltaContext object if it matches MetricDelta structure?
                // Wait, deltaContext.views IS MetricDelta { previous, current, delta }
                deltaContext?.isIncomplete
            );
            if (viewsReport) {
                reports.push(`[VIEWS REPORT]\n# ${viewsReport}`);
            }
        }

        const sourcesToExport = selectedIds.size > 0
            ? filteredSources.filter(s => s.videoId && selectedIds.has(s.videoId))
            : filteredSources;

        const csvContent = exportTrafficCsv({
            sources: sourcesToExport,
            totalRow: actualTotalRow,
            niches: allNiches,
            assignments: assignmentsMap,
            trafficEdges,
            viewerEdges,
            noteMap,
            reactionMap,
            warnings: [],
            discrepancyReport: reports.length > 0 ? reports.join('\n# \n# ') : undefined,
            metadata: {
                viewMode,
                snapshotId: effectiveSnapshotId,
                filters,
                videoTitle: _video.title
            }
        });

        const filename = generateExportFilename(_video.title, viewMode) + (selectedIds.size > 0 ? '_selected' : '');
        downloadCsv(csvContent, filename);
    }, [filteredSources, actualTotalRow, allNiches, allAssignments, trafficEdges, viewerEdges, noteMap, reactionMap, viewMode, effectiveSnapshotId, filters, _video.title, trashMetrics, deltaContext, selectedIds]);

    // Handle Image Export (ZIP)
    const handleExportImages = useCallback(async () => {
        // 1. Filter sources based on selection
        const sourcesToExport = selectedIds.size > 0
            ? filteredSources.filter(s => s.videoId && selectedIds.has(s.videoId))
            : filteredSources;

        // 2. Prepare lookup map for thumbnails (Enrichment)
        const videoMap = new Map(allVideos.map(v => [v.id, v]));

        // 3. Filter sources that have thumbnails (either in source or in enriched video data)
        const images: { id: string; url: string }[] = [];

        sourcesToExport.forEach(s => {
            if (!s.videoId) return;

            let url = s.thumbnail;

            // If missing in source, try lookup
            if (!url) {
                const video = videoMap.get(s.videoId);
                if (video) {
                    url = video.thumbnail;
                }
            }

            if (url) {
                images.push({
                    id: s.videoId,
                    url: url
                });
            }
        });

        if (images.length === 0) {
            console.warn('No images found to export');
            return;
        }

        const filename = generateExportFilename(_video.title, viewMode).replace('.csv', selectedIds.size > 0 ? '_selected_covers.zip' : '_covers.zip');

        // Dynamic import to avoid circular dependencies if any, although zipUtils is leaf.
        const { downloadImagesAsZip } = await import('../../../../core/types/../../core/utils/zipUtils');
        await downloadImagesAsZip(images, filename);

    }, [filteredSources, _video.title, viewMode, selectedIds, allVideos]);

    // -------------------------------------------------------------------------
    // BRIDGE: Sync selected traffic videos → appContextStore for AI chat
    // Same pattern as PlaylistDetailPage — reactive useEffect
    // -------------------------------------------------------------------------
    const setContextItems = useAppContextStore(s => s.setItems);
    const clearContextItems = useAppContextStore(s => s.clearItems);
    const contextVersion = useAppContextStore(s => s.version);

    useEffect(() => {
        if (selectedIds.size === 0) {
            clearContextItems();
            return;
        }

        // Build enriched suggested video items from selected rows
        const selectedSources = filteredSources.filter(s => s.videoId && selectedIds.has(s.videoId));
        const suggestedVideos: SuggestedVideoItem[] = selectedSources.map(s => {
            const vid = s.videoId!;
            const cachedVideo = allVideos.find(v => v.id === vid);
            const nicheAssignment = allAssignments.find(a => a.videoId === vid);
            const niche = nicheAssignment ? allNiches.find(n => n.id === nicheAssignment.nicheId) : undefined;

            return {
                videoId: vid,
                title: s.sourceTitle,
                // CSV metrics
                impressions: s.impressions,
                ctr: s.ctr,
                views: s.views,
                avgViewDuration: s.avgViewDuration,
                watchTimeHours: s.watchTimeHours,
                // YouTube API data (from cache)
                thumbnailUrl: s.thumbnail || cachedVideo?.thumbnail,
                channelTitle: s.channelTitle || cachedVideo?.channelTitle,
                publishedAt: s.publishedAt || cachedVideo?.publishedAt,
                duration: cachedVideo?.duration,
                description: cachedVideo?.description,
                tags: cachedVideo?.tags,
                viewCount: cachedVideo?.viewCount,
                likeCount: cachedVideo?.likeCount,
                subscriberCount: cachedVideo?.subscriberCount,
                // Smart Assistant labels
                trafficType: trafficEdges[vid]?.type,
                viewerType: viewerEdges[vid]?.type,
                niche: niche?.name,
                nicheProperty: niche?.property,
            };
        });

        const context: SuggestedTrafficContext = {
            type: 'suggested-traffic',
            sourceVideo: {
                videoId: _video.id,
                title: _video.title,
                description: _video.description || '',
                tags: _video.tags || [],
                thumbnailUrl: _video.customImage || _video.thumbnail,
                viewCount: _video.mergedVideoData?.viewCount || _video.viewCount,
                publishedAt: _video.mergedVideoData?.publishedAt || _video.publishedAt,
                duration: _video.mergedVideoData?.duration || _video.duration,
            },
            suggestedVideos,
        };

        setContextItems([context]);
    }, [selectedIds, filteredSources, allVideos, allAssignments, allNiches, trafficEdges, viewerEdges, _video, setContextItems, clearContextItems, contextVersion]);

    // Cleanup on unmount — clear context when leaving the Traffic tab
    useEffect(() => {
        return () => clearContextItems();
    }, [clearContextItems]);

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
            initNotes(user.uid, currentChannel.id);
            initReactions(user.uid, currentChannel.id);
        }
        return () => {
            cleanup();
            cleanupNotes();
            cleanupReactions();
        };
    }, [user?.uid, currentChannel?.id, initializeSubscriptions, cleanup, initNotes, cleanupNotes, initReactions, cleanupReactions]);

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

    // Auto-Apply Viewer Types Logic
    useSmartViewerTypeAutoApply(isAssistantEnabled, filteredSources, _video);

    // Connect to the Store to get assignment history - ALREADY DESTRUCTURED ABOVE

    // Get Trends store data for cross-tab niche suggestions
    const { niches: trendsNiches, videoNicheAssignments: trendsVideoAssignments } = useTrendStore();

    const { getSuggestion } = useSmartNicheSuggestions(
        displayedSources,
        allAssignments,
        allNiches,
        allVideos,
        trendsNiches,
        trendsVideoAssignments,
        isAssistantEnabled
    );

    // Wrapper to respect the toggle state - returns FULL suggestion for reason check
    const getActiveSuggestion = useCallback((videoId: string) => {
        if (!isAssistantEnabled) return null;
        return getSuggestion(videoId);
    }, [isAssistantEnabled, getSuggestion]);



    // Handle Confirmation (Single or Bulk)
    // Now handles both channel-based AND Trends-based suggestions
    const handleConfirmSuggestion = useCallback(async (videoId: string, targetNiche: import('../../../../core/types/suggestedTrafficNiches').SuggestedTrafficNiche) => {
        if (!user?.uid || !currentChannel?.id) return;

        const suggestion = getSuggestion(videoId);

        // Check if this is a Trends-based suggestion
        if (suggestion?.reason === 'trends' && suggestion.trendsNiche) {
            // MATCH BY NAME: Find existing Traffic niche with same name (case-insensitive)
            const existingNiche = allNiches.find(
                n => n.name.toLowerCase() === suggestion.trendsNiche!.name.toLowerCase()
            );

            let finalNicheId: string;

            if (existingNiche) {
                // Use existing niche
                finalNicheId = existingNiche.id;
            } else {
                // Create new niche with Trends name and color
                // Generate a stable ID that we control - this ID is used directly in Firestore
                const nicheId = `trends-import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                await addTrafficNiche(
                    {
                        id: nicheId,
                        name: suggestion.trendsNiche.name,
                        color: suggestion.trendsNiche.color,
                        channelId: currentChannel.id
                    },
                    user.uid,
                    currentChannel.id
                );
                // Use the ID we generated - no need to search, we control the ID
                finalNicheId = nicheId;
            }

            // Assign video to the matched/created niche
            await assignVideoToTrafficNiche(videoId, finalNicheId, user.uid, currentChannel.id);
            return;
        }

        // Standard channel-based suggestion flow
        const isBulkAction = selectedIds.has(videoId) && selectedIds.size > 1;

        if (isBulkAction) {
            const promises: Promise<void>[] = [];

            selectedIds.forEach(selectedId => {
                const sug = getActiveSuggestion(selectedId);
                if (sug && sug.targetNiche.id === targetNiche.id) {
                    promises.push(assignVideoToTrafficNiche(selectedId, targetNiche.id, user.uid, currentChannel!.id));
                }
            });

            await Promise.all(promises);
        } else {
            await assignVideoToTrafficNiche(videoId, targetNiche.id, user.uid, currentChannel.id);
        }
    }, [user?.uid, currentChannel, selectedIds, getActiveSuggestion, assignVideoToTrafficNiche, getSuggestion, allNiches, addTrafficNiche]); // Changed createNiche to addTrafficNiche

    // -------------------------------------------------------------------------

    const [isSkipping, setIsSkipping] = useState(false);

    // Wrapper to catch upload errors and open mapper - memoized to prevent re-renders
    const handleUploadWithErrorTracking = React.useCallback(async (sources: TrafficSource[], totalRow?: TrafficSource, file?: File) => {
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
        const hasMissingTitles = patchedSources.some((s: TrafficSource) => s.videoId && (!s.sourceTitle || s.sourceTitle.trim() === ''));

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
                assistantLogger.info('Regenerated CSV with patched titles from cache');
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

        // Check if any snapshots exist for the viewing version
        // Simple check — no period matching needed. If version has snapshots, data exists.
        return snapshots.some((s: import('../../../../core/types/traffic').TrafficSnapshot) => s.version === viewingVersion);
    }, [trafficData?.snapshots, viewingVersion, selectedSnapshot]);

    // Compute Version Label (with Alias Support)
    // Returns object with main label and optional period label for separate styling
    const versionLabel = React.useMemo(() => {
        if (viewingVersion === 'draft') return { main: 'Draft', period: null };
        if (typeof viewingVersion === 'number') {
            // 1. Build the map (same logic as PackagingNav)
            const map = new Map<number, number>();
            const canonicalIds = Array.from(new Set(
                packagingHistory.map((v: import('../../../../core/types/versioning').PackagingVersion) => v.cloneOf || v.versionNumber)
            )).sort((a: number, b: number) => a - b);

            canonicalIds.forEach((id, index) => {
                map.set(id, index + 1);
            });

            // 2. Get the visual number for current viewing version
            const currentVersionData = packagingHistory.find((v: import('../../../../core/types/versioning').PackagingVersion) => v.versionNumber === viewingVersion);
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
        const currentVersionData = packagingHistory.find((v: import('../../../../core/types/versioning').PackagingVersion) => v.versionNumber === viewingVersion);
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
        const hasOlderSnapshots = allSnapshots.some((s: import('../../../../core/types/traffic').TrafficSnapshot) => s.timestamp < viewingPeriod.startDate);

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
                    assistantLogger.debug('[DEBUG-MODAL] onToggleAssistant clicked', {
                        currentEnabled: isAssistantEnabled,
                        missingCount: existingMissingCount,
                        unenrichedCount: existingUnenrichedCount,
                        willBlock: !isAssistantEnabled && (existingMissingCount > 0 || existingUnenrichedCount > 0),
                        cachedVideosCount: allVideos.length,
                        displayedSourcesCount: displayedSources.length
                    });

                    // Smart Check: If we have missing titles OR unenriched data, prompt to sync first
                    if (!isAssistantEnabled && (existingMissingCount > 0 || existingUnenrichedCount > 0)) {
                        assistantLogger.info('[DEBUG-MODAL] Blocking assistant activation', {
                            missingCount: existingMissingCount,
                            unenrichedCount: existingUnenrichedCount,
                            reason: existingMissingCount > 0 ? 'missingTitles' : 'unenriched'
                        });
                        setMissingTitlesVariant('assistant');
                        setIsMissingTitlesModalOpen(true);
                        return;
                    }
                    assistantLogger.debug('[DEBUG-MODAL] Toggling assistant state');
                    setIsAssistantEnabled(prev => !prev);
                }}
                onExport={handleExport}
                onExportImages={handleExportImages}
            />

            {/* Main Content - Table Area */}
            <div className="px-6 pb-0 pt-6 min-h-0 flex-1 flex flex-col overflow-hidden">
                <div className="w-full max-w-[1320px] relative flex-1 flex flex-col min-h-0">
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
                                    currentVideo={_video}
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
                                    // Viewer Type Props
                                    viewerEdges={viewerEdges}
                                    onToggleViewerType={handleToggleViewerType}
                                    // Video Reaction Props
                                    reactionMap={reactionMap}
                                    onToggleReaction={handleToggleReaction}
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

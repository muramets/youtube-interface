import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import type { GalleryItem } from '../../core/types/gallery';
import { DetailsSidebar } from './Sidebar/DetailsSidebar';
import { PackagingTab } from './tabs/Packaging/PackagingTab';
import { TrafficTab } from './tabs/Traffic/TrafficTab';
import { GalleryTab } from './tabs/Gallery/GalleryTab';
import { EditingTab } from './tabs/Editing';
import { GalleryDndProvider } from './tabs/Gallery/GalleryDndProvider';
import { usePackagingVersions } from './tabs/Packaging/hooks/usePackagingVersions';
import { useTrafficFilters } from './tabs/Traffic/hooks/useTrafficFilters';
import { useTrafficData } from './tabs/Traffic/hooks/useTrafficData';
import { useTrafficDataLoader } from './tabs/Traffic/hooks/useTrafficDataLoader';
import { type SortConfig } from './tabs/Traffic/components/TrafficTable';

// ... existing imports ...


import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';
import { useVersionManagement } from './hooks/useVersionManagement';
import { useSnapshotManagement } from './hooks/useSnapshotManagement';
import { useModalState } from './hooks/useModalState';
import { DetailsModals } from './components/DetailsModals';
import { useTrafficNicheStore } from '../../core/stores/trends/useTrafficNicheStore';
import { TrafficSnapshotService } from '../../core/services/traffic';
import { VersionService } from './services/VersionService';

// Static wrapper component to prevent re-mounting issues
const GalleryDndWrapper: React.FC<{
    isActive: boolean;
    items: GalleryItem[];
    onReorder: (items: GalleryItem[]) => Promise<void>;
    onMoveToSource: (itemId: string, sourceId: string) => Promise<void>;
    children: React.ReactNode;
}> = ({ isActive, items, onReorder, onMoveToSource, children }) => {
    // Always render provider if active to maintain React tree stability
    // even if items are empty. This prevents unmounting/remounting of children
    // (Sidebar/GalleryTab) when items load or change.
    if (isActive) {
        return (
            <GalleryDndProvider
                items={items}
                onReorder={onReorder}
                onMoveToSource={onMoveToSource}
            >
                {children}
            </GalleryDndProvider>
        );
    }
    return <>{children}</>;
};

interface DetailsLayoutProps {
    video: VideoDetails;
    playlistId?: string;
}

export const DetailsLayout: React.FC<DetailsLayoutProps> = ({ video, playlistId }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');


    // URL State for Tab Persistence
    const [searchParams, setSearchParams] = useSearchParams();

    // URL as Single Source of Truth for Tab State
    // No useState, no useEffect sync - just derive from URL
    const urlTab = searchParams.get('tab') as 'packaging' | 'traffic' | 'gallery' | 'editing' | null;
    const activeTab: 'packaging' | 'traffic' | 'gallery' | 'editing' =
        (urlTab && ['packaging', 'traffic', 'gallery', 'editing'].includes(urlTab)) ? urlTab : 'packaging';

    // URL-based tab navigation (replacement for setActiveTab)
    const navigateToTab = useCallback((tab: 'packaging' | 'traffic' | 'gallery' | 'editing') => {
        setSearchParams(prev => {
            prev.set('tab', tab);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    const [isFormDirty, setIsFormDirty] = useState(false);

    // Ref to save/discard actions registered by PackagingTab
    type PackagingActions = { save: () => Promise<void>; discard: () => void };
    const packagingActionsRef = useRef<PackagingActions | null>(null);

    // Persist selected snapshot across navigation (per video)
    const snapshotStorageKey = `traffic-snapshot:${video.id}`;
    const [selectedSnapshot, setSelectedSnapshotRaw] = useState<string | null>(() => {
        try { return sessionStorage.getItem(snapshotStorageKey); } catch { return null; }
    });
    const setSelectedSnapshot = useCallback((id: string | null) => {
        setSelectedSnapshotRaw(id);
        try {
            if (id) sessionStorage.setItem(snapshotStorageKey, id);
            else sessionStorage.removeItem(snapshotStorageKey);
        } catch { /* quota exceeded — ignore */ }
    }, [snapshotStorageKey]);

    // Gallery Sources state (lifted for sidebar access)
    const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
    const [isAddSourceModalOpen, setIsAddSourceModalOpen] = useState(false);

    // Gallery items state for DndProvider (registered by GalleryTab)
    const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);

    // Refs for gallery handlers (registered by GalleryTab)
    const deleteSourceRef = React.useRef<((sourceId: string) => Promise<void>) | null>(null);
    const updateSourceRef = React.useRef<((sourceId: string, data: { type?: import('../../core/types/gallery').GallerySourceType; label?: string; url?: string }) => Promise<void>) | null>(null);
    const moveItemToSourceRef = React.useRef<((itemId: string, newSourceId: string) => Promise<void>) | null>(null);
    const reorderItemsRef = React.useRef<((items: GalleryItem[]) => Promise<void>) | null>(null);

    // Stable callback for dirty state changes (prevents infinite loop)
    const handleDirtyChange = useCallback((dirty: boolean) => {
        setIsFormDirty(dirty);
    }, []);

    // Memoize packagingHistory to prevent new array reference on each render
    const stablePackagingHistory = useMemo(
        () => video.packagingHistory || [],
        [video.packagingHistory]
    );

    // Version management
    const versions = usePackagingVersions({
        initialHistory: stablePackagingHistory,
        initialCurrentVersion: video.currentPackagingVersion || 1,
        // USER REQUIREMENT: Only show Draft in sidebar if explicitly saved/managed as draft
        isDraft: !!video.isDraft,
        initialActiveVersion: video.activeVersion
    });

    // Modal state management
    const {
        modalState,
        openSwitchConfirm,
        openDeleteConfirm,
        openSnapshotRequest,
        closeModal
    } = useModalState();

    // Traffic data
    const trafficState = useTrafficData({
        userId: user?.uid || '',
        channelId: currentChannel?.id || '',
        video
    });

    // Niche Data (Live from Store)
    const { niches, assignments } = useTrafficNicheStore();

    // Convert store data to TrafficGroup[] for Sidebar consumption
    const groups = useMemo(() => {
        return niches.map(niche => ({
            id: niche.id,
            name: niche.name,
            color: niche.color,
            property: niche.property,
            videoIds: assignments
                .filter(a => a.nicheId === niche.id)
                .map(a => a.videoId)
        }));
    }, [niches, assignments]);

    // OPTIMIZATION: Stabilize references to prevent useTrafficDataLoader effect re-runs.
    // Defense-in-depth: useTrafficDataLoader also has skip logic, but stable references
    // prevent the effect from running at all when parent re-renders due to useVideos.
    const memoizedTrafficData = useMemo(() => trafficState.trafficData, [trafficState.trafficData]);
    const memoizedPackagingHistory = useMemo(() => versions.packagingHistory, [versions.packagingHistory]);

    // Traffic View Mode (Lifted State from TrafficTab)
    const [trafficViewMode, setTrafficViewMode] = useState<'cumulative' | 'delta'>('delta');

    // Sort State (Lifted)
    const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'views', direction: 'desc' });

    /**
     * BUSINESS LOGIC: Filter Context Key
     * Lifted from TrafficTab to share filter state between Tab and Sidebar.
     */
    const filterContextKey = useMemo(() => {
        if (selectedSnapshot) {
            return `snapshot-${selectedSnapshot}`;
        }
        return `version-${versions.viewingVersion}-period-${versions.viewingPeriodIndex}`;
    }, [selectedSnapshot, versions.viewingVersion, versions.viewingPeriodIndex]);

    // Filters Logic with Context-Aware Persistence
    const { filters, addFilter, removeFilter, clearFilters, applyFilters } = useTrafficFilters({
        contextKey: filterContextKey
    });

    // Determine Active Niche ID from filters (use LAST applied niche filter to reflect current navigation state)
    const activeNicheId = useMemo(() => {
        // Search in reverse to find the most recently added niche filter
        // useful if user has 'Unassigned' (old) + 'Niche X' (new)
        for (let i = filters.length - 1; i >= 0; i--) {
            const f = filters[i];
            if (f.type === 'niche' && Array.isArray(f.value) && f.value.length > 0) {
                return String(f.value[0]);
            }
        }
        return null;
    }, [filters]);

    // Traffic Data Loader (Lifted to provide data to Sidebar)
    const trafficLoader = useTrafficDataLoader({
        trafficData: memoizedTrafficData,
        viewingVersion: versions.viewingVersion,
        viewingPeriodIndex: versions.viewingPeriodIndex,
        activeVersion: typeof versions.activeVersion === 'number' ? versions.activeVersion : 0,
        viewMode: trafficViewMode,
        selectedSnapshot,
        packagingHistory: memoizedPackagingHistory,
        groups: groups
    });

    // Helper: Find latest snapshot ID for a given version
    const getLatestSnapshotId = useCallback((targetVersion: number | 'draft'): string | null => {
        const snapshots = trafficState.trafficData?.snapshots || [];
        const versionSnapshots = snapshots
            .filter(s => s.version === targetVersion)
            .sort((a, b) => b.timestamp - a.timestamp);
        return versionSnapshots.length > 0 ? versionSnapshots[0].id : null;
    }, [trafficState.trafficData?.snapshots]);

    // RENDER-PHASE AUTO-SELECT: Synchronously select latest snapshot when traffic tab
    // is active and no snapshot is selected. This eliminates the ~850ms useEffect delay.
    // Pattern: same as DetailsSidebar's render-phase activeTab sync (lines 104-107).
    if (activeTab === 'traffic' && !selectedSnapshot) {
        const latestId = getLatestSnapshotId(versions.viewingVersion);
        if (latestId) {
            setSelectedSnapshot(latestId);
        }
    }

    // Version management handlers
    const versionMgmt = useVersionManagement({
        versions,
        isFormDirty,
        video,
        user,
        currentChannel,
        updateVideo: async (params) => { await updateVideo(params); },
        showToast: (msg, type) => console.log(`[Toast] ${type}: ${msg}`), // TODO: use uiStore
        setSelectedSnapshot,
        activeTab,
        selectedSnapshot,
        trafficState,
        onOpenSwitchConfirm: openSwitchConfirm,
        onOpenDeleteConfirm: openDeleteConfirm,
        onOpenSnapshotRequest: (params) => openSnapshotRequest(params)
    });

    // ── Unsaved-changes guard ─────────────────────────────────────────────────
    // All dirty-check logic flows through SWITCH_CONFIRM (useModalState).
    // targetTab is set when the trigger is a tab click; absent for version switches.
    // Browser Back is not blocked: useBlocker requires createBrowserRouter.
    //
    // "Save": persist form, then navigate to targetTab
    const handleSaveThenNavigate = useCallback(async () => {
        if (modalState.type !== 'SWITCH_CONFIRM' || !modalState.targetTab) return;
        const targetTab = modalState.targetTab;
        closeModal();
        try {
            await packagingActionsRef.current?.save();
            navigateToTab(targetTab as 'packaging' | 'traffic' | 'gallery' | 'editing');
        } catch {
            /* Save failed — stay on tab */
        }
    }, [modalState, closeModal, navigateToTab]);

    // "Discard" / confirm switch — context-aware
    const handleConfirmSwitch = useCallback((targetVersion: number | 'draft') => {
        if (modalState.type !== 'SWITCH_CONFIRM') return;
        if (modalState.targetTab) {
            // Tab-navigation context: discard form, navigate
            const targetTab = modalState.targetTab as 'packaging' | 'traffic' | 'gallery' | 'editing';
            packagingActionsRef.current?.discard();
            navigateToTab(targetTab);
        } else {
            // Version-switch context: existing behaviour
            versionMgmt.confirmSwitch(targetVersion);
        }
    }, [modalState, navigateToTab, versionMgmt]);
    // ─────────────────────────────────────────────────
    // Snapshot management handlers
    const snapshotMgmt = useSnapshotManagement({
        video,
        versions,
        trafficState,
        user,
        currentChannel,
        updateVideo,
        showToast: (msg, type) => console.log(`[Toast] ${type}: ${msg}`), // TODO: use uiStore
        setSelectedSnapshot,
        setActiveTab: navigateToTab,
        selectedSnapshot,
        snapshotRequest: modalState.type === 'SNAPSHOT_REQUEST' ? {
            isForCreateVersion: modalState.isForCreateVersion,
            versionToRestore: modalState.versionToRestore,
            resolveCallback: modalState.resolveCallback,
            versionNumber: modalState.versionNumber,
            context: modalState.context
        } : {
            isForCreateVersion: false,
            versionToRestore: null,
            resolveCallback: null,
            versionNumber: undefined,
            context: undefined
        },
        onOpenSnapshotRequest: openSnapshotRequest,
        closeSnapshotModal: closeModal
    });

    // Helper: Get display title (use first A/B title if available)
    const getDisplayTitle = () => {
        if (video.abTestTitles && video.abTestTitles.length > 0) {
            return video.abTestTitles[0];
        }
        return video.title;
    };

    // Auto-switch to active version when switching tabs
    // Using direct closure values (simpler, React Compiler compatible)
    const handleTabChange = useCallback((newTab: 'packaging' | 'traffic' | 'gallery' | 'editing') => {
        // Skip if same tab (activeTab is derived from URL)
        if (newTab === activeTab) return;

        // Guard: if leaving Packaging with unsaved changes → open unified SWITCH_CONFIRM
        if (isFormDirty && activeTab === 'packaging' && newTab !== 'packaging') {
            openSwitchConfirm(versions.activeVersion, newTab);
            return;
        }

        // When entering Traffic tab → switch to active version if needed
        if (newTab === 'traffic') {
            const isNotViewingActive = versions.viewingVersion !== versions.activeVersion;

            if (isNotViewingActive) {
                versions.switchToVersion(versions.activeVersion);
            }

            // Restore persisted snapshot, or fall back to latest for target version
            const targetVersion = isNotViewingActive ? versions.activeVersion : versions.viewingVersion;
            const persisted = (() => { try { return sessionStorage.getItem(snapshotStorageKey); } catch { return null; } })();
            if (!persisted) {
                const latestId = getLatestSnapshotId(targetVersion);
                setSelectedSnapshot(latestId);
            }
        }

        // When entering Packaging tab → switch to active version
        if (newTab === 'packaging') {
            if (versions.viewingVersion !== versions.activeVersion) {
                versions.switchToVersion(versions.activeVersion);
            }
        }

        // Gallery and Editing tabs don't need version switching

        // Update URL
        setSearchParams(prev => {
            prev.set('tab', newTab);
            return prev;
        }, { replace: true });
    }, [activeTab, isFormDirty, versions, setSearchParams, getLatestSnapshotId, setSelectedSnapshot, snapshotStorageKey, openSwitchConfirm]);

    // Handle draft deletion
    // Latest Ref Pattern: refs for stable handleDeleteDraft callback
    const versionsRef = React.useRef(versions);
    const userRef = React.useRef(user);
    const currentChannelRef = React.useRef(currentChannel);
    const updateVideoRef = React.useRef(updateVideo);
    const videoIdRef = React.useRef(video.id);

    React.useEffect(() => {
        versionsRef.current = versions;
        userRef.current = user;
        currentChannelRef.current = currentChannel;
        updateVideoRef.current = updateVideo;
        videoIdRef.current = video.id;
    }, [versions, user, currentChannel, updateVideo, video.id]);

    const handleDeleteDraft = useCallback(async () => {
        const currentUser = userRef.current;
        const currentChan = currentChannelRef.current;
        const currentVideoId = videoIdRef.current;
        const currentUpdateVideo = updateVideoRef.current;
        const currentVersions = versionsRef.current;

        if (!currentUser?.uid || !currentChan?.id || !currentVideoId) return;

        try {
            // Find the last saved version to switch to
            const lastVersion = currentVersions.packagingHistory.length > 0
                ? Math.max(...currentVersions.packagingHistory.map(v => v.versionNumber))
                : null;

            // Update local state first for immediate UI feedback
            currentVersions.setHasDraft(false);
            if (lastVersion) {
                currentVersions.setActiveVersion(lastVersion);
                currentVersions.switchToVersion(lastVersion);
            }

            // Build rollback updates from the previous version's snapshot
            // so video metadata (title, description, tags, thumbnail, etc.) reverts
            let rollbackUpdates: Record<string, unknown> = {};
            if (lastVersion) {
                const targetVersion = currentVersions.packagingHistory.find(
                    v => v.versionNumber === lastVersion
                );
                if (targetVersion?.configurationSnapshot) {
                    rollbackUpdates = VersionService.prepareRestoreVersionData(
                        lastVersion,
                        targetVersion.configurationSnapshot
                    );
                }
            }

            // Save to Firestore
            await currentUpdateVideo({
                videoId: currentVideoId,
                updates: {
                    isDraft: false,
                    activeVersion: lastVersion || undefined,
                    ...rollbackUpdates
                }
            });

            console.log('[Toast] success: Draft deleted');
        } catch (error) {
            console.error('Failed to delete draft:', error);
            console.log('[Toast] error: Failed to delete draft');
        }
    }, []); // Empty deps = 100% stable callback

    // Handler for updating snapshot metadata (label, activeDate)
    // PATTERN: Optimistic UI — update local state instantly, persist to Firestore in background.
    // Uses Latest Ref Pattern for trafficState to avoid stale closures in stable callback.
    // On Firestore error, rolls back by re-fetching from server.
    const trafficStateRef = React.useRef(trafficState);
    React.useEffect(() => { trafficStateRef.current = trafficState; }, [trafficState]);

    const handleUpdateSnapshotMetadata = useCallback(async (
        snapshotId: string,
        metadata: { label?: string; activeDate?: { start: number; end: number } | null }
    ) => {
        const currentUser = userRef.current;
        const currentChan = currentChannelRef.current;
        const currentVideoId = videoIdRef.current;
        const currentTrafficState = trafficStateRef.current;
        if (!currentUser?.uid || !currentChan?.id || !currentVideoId) return;

        // Optimistic local update — instant UI feedback
        if (currentTrafficState.trafficData) {
            const updatedSnapshots = currentTrafficState.trafficData.snapshots.map(s => {
                if (s.id !== snapshotId) return s;
                const updated = { ...s };
                if (metadata.label !== undefined) {
                    if (metadata.label) {
                        updated.label = metadata.label;
                    } else {
                        delete updated.label;
                    }
                }
                if (metadata.activeDate !== undefined) {
                    if (metadata.activeDate) {
                        updated.activeDate = metadata.activeDate;
                    } else {
                        delete updated.activeDate;
                    }
                }
                return updated;
            });
            currentTrafficState.updateLocalData({
                ...currentTrafficState.trafficData,
                snapshots: updatedSnapshots
            });
        }

        // Persist to Firestore in the background
        try {
            await TrafficSnapshotService.updateMetadata(
                currentUser.uid,
                currentChan.id,
                currentVideoId,
                snapshotId,
                metadata
            );
        } catch (error) {
            console.error('Failed to update snapshot metadata:', error);
            // Rollback: refetch from Firestore on error
            currentTrafficState.refetch();
        }
    }, []);


    // State to track the "previous" niche filter for restoration on "Back" navigation
    const previousNicheFilterRef = React.useRef<import('../../core/types/traffic').TrafficFilter | null>(null);
    const previousSortConfigRef = React.useRef<SortConfig | null>(null);

    // Latest Ref Pattern for filter/snapshot callbacks
    const filtersRef = React.useRef(filters);
    const addFilterRef = React.useRef(addFilter);
    const removeFilterRef = React.useRef(removeFilter);
    const sortConfigRef = React.useRef(sortConfig);
    const activeNicheIdRef = React.useRef(activeNicheId);
    const snapshotMgmtRef = React.useRef(snapshotMgmt);
    const setSortConfigRef = React.useRef(setSortConfig);

    React.useEffect(() => {
        filtersRef.current = filters;
        addFilterRef.current = addFilter;
        removeFilterRef.current = removeFilter;
        sortConfigRef.current = sortConfig;
        activeNicheIdRef.current = activeNicheId;
        snapshotMgmtRef.current = snapshotMgmt;
        setSortConfigRef.current = setSortConfig;
    }, [filters, addFilter, removeFilter, sortConfig, activeNicheId, snapshotMgmt, setSortConfig]);

    // Context-sensitive Add Filter for Sidebar - 100% stable callback
    const handleSidebarAddFilter = React.useCallback((filter: Omit<import('../../core/types/traffic').TrafficFilter, 'id'>) => {
        if (filter.type === 'niche') {
            // If we are starting a navigation chain (ref is null), save the current state

            // Save Sort Config if not already saved (first jump)
            if (previousSortConfigRef.current === null) {
                previousSortConfigRef.current = sortConfigRef.current;
            }

            if (previousNicheFilterRef.current === null) {
                const activeNicheFilter = filtersRef.current.find(f => f.type === 'niche');
                if (activeNicheFilter) {
                    previousNicheFilterRef.current = activeNicheFilter;
                }
            }
        }
        addFilterRef.current(filter);
    }, []);

    // Context-sensitive Remove Filter to clear restoration state
    const handleRemoveFilter = React.useCallback((id: string) => {
        // If user manually removes the active niche filter, we reset our "Back" restoration state
        const removedFilter = filters.find(f => f.id === id);
        if (removedFilter?.type === 'niche') {
            previousNicheFilterRef.current = null;
            previousSortConfigRef.current = null;
        }
        removeFilter(id);
    }, [filters, removeFilter]);

    // OPTIMIZATION: Memoize all callbacks passed to DetailsSidebar to prevent re-renders
    const stableSnapshots = useMemo(() => trafficState.trafficData?.snapshots || [], [trafficState.trafficData?.snapshots]);
    const stableGallerySources = useMemo(() => video.gallerySources || [], [video.gallerySources]);

    const handleSnapshotClickWrapped = useCallback((snapshotId: string) => {
        // FIX: Return to previous niche state (e.g. Unassigned) if it existed, otherwise just clear current niche
        const currentActiveNicheId = activeNicheIdRef.current;
        if (currentActiveNicheId) {
            if (previousNicheFilterRef.current) {
                // Restore the saved "Base" filter (e.g. Unassigned)
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id: _unused, ...filterProps } = previousNicheFilterRef.current;
                addFilterRef.current(filterProps);
                previousNicheFilterRef.current = null; // Reset after restore
            } else {
                // No previous state saved, just clear current niche
                const nicheFilter = filtersRef.current.find(f =>
                    f.type === 'niche' &&
                    Array.isArray(f.value) &&
                    (f.value as string[]).includes(currentActiveNicheId)
                );
                if (nicheFilter) {
                    removeFilterRef.current(nicheFilter.id);
                }
            }

            // Restore Sort
            if (previousSortConfigRef.current) {
                setSortConfigRef.current(previousSortConfigRef.current);
                previousSortConfigRef.current = null;
            }
        }
        // BUSINESS RULE: Auto-switch view mode based on snapshot position
        // - First snapshot (no predecessor) → 'cumulative' (total data)
        //   because delta mode would show empty table (no history to diff against)
        // - Any other snapshot → 'delta' (new/changed sources)
        //   because users primarily care about what changed between snapshots
        const currentTraffic = trafficStateRef.current.trafficData;
        if (currentTraffic) {
            const clickedSnapshot = currentTraffic.snapshots.find(s => s.id === snapshotId);
            if (clickedSnapshot) {
                const versionSnapshots = currentTraffic.snapshots
                    .filter(s => s.version === clickedSnapshot.version)
                    .sort((a, b) => a.timestamp - b.timestamp);
                const isFirst = versionSnapshots.length > 0 && versionSnapshots[0].id === snapshotId;
                if (isFirst) {
                    setTrafficViewMode('cumulative');
                } else {
                    setTrafficViewMode('delta');
                }
            }
        }
        snapshotMgmtRef.current.handleSnapshotClick(snapshotId);
    }, []); // Empty deps = 100% stable callback

    const handleAddSource = useCallback(() => {
        setIsAddSourceModalOpen(true);
    }, []);

    const handleDeleteSource = useCallback((sourceId: string) => {
        if (deleteSourceRef.current) {
            deleteSourceRef.current(sourceId);
        }
    }, []);

    const handleUpdateSource = useCallback((sourceId: string, data: { type?: import('../../core/types/gallery').GallerySourceType; label?: string; url?: string }) => {
        if (updateSourceRef.current) {
            updateSourceRef.current(sourceId, data);
        }
    }, []);

    return (
        <div className="flex-1 flex overflow-hidden bg-video-edit-bg">
            <GalleryDndWrapper
                isActive={activeTab === 'gallery'}
                items={galleryItems}
                onReorder={(items) => reorderItemsRef.current?.(items) || Promise.resolve()}
                onMoveToSource={(itemId, sourceId) => moveItemToSourceRef.current?.(itemId, sourceId) || Promise.resolve()}
            >
                {/* Left Sidebar */}
                <DetailsSidebar
                    video={video}
                    versions={versions.navSortedVersions}
                    viewingVersion={versions.viewingVersion}
                    activeVersion={versions.activeVersion}
                    viewingPeriodIndex={versions.viewingPeriodIndex}
                    hasDraft={versions.hasDraft}
                    onVersionClick={versionMgmt.handleVersionClick}
                    onDeleteVersion={versionMgmt.handleDeleteVersion}
                    onDeleteDraft={handleDeleteDraft}
                    snapshots={stableSnapshots}
                    selectedSnapshot={selectedSnapshot}
                    onSnapshotClick={handleSnapshotClickWrapped}
                    onDeleteSnapshot={snapshotMgmt.handleDeleteSnapshot}
                    onUpdateSnapshotMetadata={handleUpdateSnapshotMetadata}
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    // NEW: Pass live calculated groups (niches)
                    groups={groups}
                    displayedSources={trafficLoader.displayedSources}
                    // Filter control for sidebar interactions
                    onAddFilter={handleSidebarAddFilter}
                    activeNicheId={activeNicheId}
                    playlistId={playlistId}
                    // Gallery Sources props
                    gallerySources={stableGallerySources}
                    activeSourceId={activeSourceId}
                    onSourceClick={setActiveSourceId}
                    onAddSource={handleAddSource}
                    onDeleteSource={handleDeleteSource}
                    onUpdateSource={handleUpdateSource}
                />

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {activeTab === 'packaging' && (
                        <PackagingTab
                            video={video}
                            versionState={versions}
                            onDirtyChange={handleDirtyChange}
                            onRestoreVersion={versionMgmt.handleRestoreVersion}
                            onRequestSnapshot={snapshotMgmt.handleRequestSnapshot}
                            trafficData={trafficState.trafficData}
                            playlistId={playlistId}
                            onRegisterActions={(a) => { packagingActionsRef.current = a; }}
                        />
                    )}
                    {activeTab === 'traffic' && (
                        <TrafficTab
                            video={video}
                            activeVersion={typeof versions.activeVersion === 'number' ? versions.activeVersion : 0}
                            viewingVersion={versions.viewingVersion}
                            viewingPeriodIndex={versions.viewingPeriodIndex}
                            selectedSnapshot={selectedSnapshot}
                            trafficData={memoizedTrafficData}
                            isLoadingData={trafficState.isLoading}
                            isSaving={trafficState.isSaving}
                            handleCsvUpload={trafficState.handleCsvUpload}
                            onSnapshotClick={snapshotMgmt.handleSnapshotClick}
                            packagingHistory={memoizedPackagingHistory}
                            // Lifted props
                            displayedSources={trafficLoader.displayedSources}
                            viewMode={trafficViewMode}
                            onViewModeChange={setTrafficViewMode}
                            isLoadingSnapshot={trafficLoader.isLoadingSnapshot}
                            error={trafficLoader.error}
                            retry={trafficLoader.retry}
                            actualTotalRow={trafficLoader.actualTotalRow}
                            trashMetrics={trafficLoader.trashMetrics}
                            deltaContext={trafficLoader.deltaContext}
                            groups={groups}
                            // Filter props
                            filters={filters}
                            onAddFilter={addFilter}

                            onRemoveFilter={handleRemoveFilter}
                            onClearFilters={clearFilters}
                            applyFilters={applyFilters}
                            sortConfig={sortConfig}
                            onSort={(key) => setSortConfig(current => {
                                if (current?.key === key) {
                                    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
                                }
                                return { key, direction: 'desc' };
                            })}
                        />
                    )}
                    {activeTab === 'gallery' && (
                        <GalleryTab
                            video={video}
                            activeSourceId={activeSourceId}
                            onSourceChange={setActiveSourceId}
                            isAddSourceModalOpen={isAddSourceModalOpen}
                            onCloseAddSourceModal={() => setIsAddSourceModalOpen(false)}
                            onRegisterDeleteSource={(handler) => { deleteSourceRef.current = handler; }}
                            onRegisterUpdateSource={(handler) => { updateSourceRef.current = handler; }}
                            onRegisterMoveItem={(handler) => { moveItemToSourceRef.current = handler; }}
                            onRegisterReorder={(handler) => { reorderItemsRef.current = handler; }}
                            onRegisterItems={setGalleryItems}
                        />
                    )}
                    {activeTab === 'editing' && (
                        <EditingTab video={video} />
                    )}
                </div>
            </GalleryDndWrapper>

            {/* All Modals */}
            <DetailsModals
                modalState={modalState}
                activeVersion={versions.activeVersion}
                videoTitle={getDisplayTitle()}
                onConfirmSwitch={handleConfirmSwitch}
                onSaveThenNavigate={handleSaveThenNavigate}
                onConfirmDelete={(versionNumber) => {
                    versionMgmt.confirmDelete(versionNumber);
                    closeModal();
                }}
                onSnapshotUpload={snapshotMgmt.handleSnapshotUpload}
                onSkipSnapshot={snapshotMgmt.handleSkipSnapshot}
                onClose={closeModal}
            />
        </div>
    );
};

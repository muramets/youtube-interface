import React, { useState, useMemo } from 'react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { DetailsSidebar } from './Sidebar/DetailsSidebar';
import { PackagingTab } from './tabs/Packaging/PackagingTab';
import { TrafficTab } from './tabs/Traffic/TrafficTab';
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
import { useTrafficNicheStore } from '../../core/stores/useTrafficNicheStore';

interface DetailsLayoutProps {
    video: VideoDetails;
}

export const DetailsLayout: React.FC<DetailsLayoutProps> = ({ video }) => {
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');

    // Tab State
    const [activeTab, setActiveTab] = useState<'packaging' | 'traffic'>('packaging');
    const [isFormDirty, setIsFormDirty] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

    // Version management
    const versions = usePackagingVersions({
        initialHistory: video.packagingHistory || [],
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
        setActiveTab,
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
    // Refactored to be an event handler instead of useEffect to avoid cascading renders
    const handleTabChange = (newTab: 'packaging' | 'traffic') => {
        if (newTab === activeTab) return;

        // When entering Traffic tab → switch to active version if needed
        if (newTab === 'traffic') {
            const isNotViewingActive = versions.viewingVersion !== versions.activeVersion;

            // If not viewing active version OR handling a selected snapshot (stale from previous session)
            if (isNotViewingActive || selectedSnapshot) {
                if (isNotViewingActive) {
                    versions.switchToVersion(versions.activeVersion);
                }
                setSelectedSnapshot(null);
            }
        }

        // When entering Packaging tab → switch to active version
        if (newTab === 'packaging') {
            if (versions.viewingVersion !== versions.activeVersion) {
                versions.switchToVersion(versions.activeVersion);
            }
        }

        setActiveTab(newTab);
    };

    // Handle draft deletion
    const handleDeleteDraft = async () => {
        if (!user?.uid || !currentChannel?.id || !video.id) return;

        try {
            // Find the last saved version to switch to
            const lastVersion = versions.packagingHistory.length > 0
                ? Math.max(...versions.packagingHistory.map(v => v.versionNumber))
                : null;

            // Update local state first for immediate UI feedback
            versions.setHasDraft(false);
            if (lastVersion) {
                versions.setActiveVersion(lastVersion);
                versions.switchToVersion(lastVersion);
            }

            // Save to Firestore
            await updateVideo({
                videoId: video.id,
                updates: {
                    isDraft: false,
                    activeVersion: lastVersion || undefined
                }
            });

            console.log('[Toast] success: Draft deleted');
        } catch (error) {
            console.error('Failed to delete draft:', error);
            console.log('[Toast] error: Failed to delete draft');
        }
    };


    // State to track the "previous" niche filter for restoration on "Back" navigation
    const previousNicheFilterRef = React.useRef<import('../../core/types/traffic').TrafficFilter | null>(null);
    const previousSortConfigRef = React.useRef<SortConfig | null>(null);

    // Context-sensitive Add Filter for Sidebar
    const handleSidebarAddFilter = React.useCallback((filter: Omit<import('../../core/types/traffic').TrafficFilter, 'id'>) => {
        if (filter.type === 'niche') {
            // If we are starting a navigation chain (ref is null), save the current state

            // Save Sort Config if not already saved (first jump)
            if (previousSortConfigRef.current === null) {
                previousSortConfigRef.current = sortConfig;
            }

            if (previousNicheFilterRef.current === null) {
                const activeNicheFilter = filters.find(f => f.type === 'niche');
                if (activeNicheFilter) {
                    previousNicheFilterRef.current = activeNicheFilter;
                }
            }
        }
        addFilter(filter);
    }, [filters, addFilter, sortConfig]);

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

    return (
        <div className="flex-1 flex overflow-hidden bg-video-edit-bg">
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
                snapshots={trafficState.trafficData?.snapshots || []}
                selectedSnapshot={selectedSnapshot}
                onSnapshotClick={(snapshotId) => {
                    // FIX: Return to previous niche state (e.g. Unassigned) if it existed, otherwise just clear current niche
                    if (activeNicheId) {
                        if (previousNicheFilterRef.current) {
                            // Restore the saved "Base" filter (e.g. Unassigned)
                            // We use addFilter which will replace the current Niche filter
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            const { id: _unused, ...filterProps } = previousNicheFilterRef.current;
                            addFilter(filterProps);
                            previousNicheFilterRef.current = null; // Reset after restore
                        } else {
                            // No previous state saved, just clear current niche
                            const nicheFilter = filters.find(f =>
                                f.type === 'niche' &&
                                Array.isArray(f.value) &&
                                (f.value as string[]).includes(activeNicheId)
                            );
                            if (nicheFilter) {
                                removeFilter(nicheFilter.id);
                            }
                        }

                        // Restore Sort
                        if (previousSortConfigRef.current) {
                            setSortConfig(previousSortConfigRef.current);
                            previousSortConfigRef.current = null;
                        }
                    }
                    snapshotMgmt.handleSnapshotClick(snapshotId);
                }}
                onDeleteSnapshot={snapshotMgmt.handleDeleteSnapshot}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                // NEW: Pass live calculated groups (niches)
                groups={groups}
                displayedSources={trafficLoader.displayedSources}
                // Filter control for sidebar interactions
                onAddFilter={handleSidebarAddFilter}
                activeNicheId={activeNicheId}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {activeTab === 'packaging' ? (
                    <PackagingTab
                        video={video}
                        versionState={versions}
                        onDirtyChange={(dirty) => {
                            setIsFormDirty(dirty);
                        }}
                        onRestoreVersion={versionMgmt.handleRestoreVersion}
                        onRequestSnapshot={snapshotMgmt.handleRequestSnapshot}
                        trafficData={trafficState.trafficData}
                    />
                ) : (
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
            </div>

            {/* All Modals */}
            <DetailsModals
                modalState={modalState}
                activeVersion={versions.activeVersion}
                videoTitle={getDisplayTitle()}
                onConfirmSwitch={versionMgmt.confirmSwitch}
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

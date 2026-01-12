import React, { useState, useEffect, useMemo } from 'react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { DetailsSidebar } from './Sidebar/DetailsSidebar';
import { PackagingTab } from './tabs/Packaging/PackagingTab';
import { TrafficTab } from './tabs/Traffic/TrafficTab';
import { usePackagingVersions } from './tabs/Packaging/hooks/usePackagingVersions';
import { useTrafficData } from './tabs/Traffic/hooks/useTrafficData';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';
import { useVersionManagement } from './hooks/useVersionManagement';
import { useSnapshotManagement } from './hooks/useSnapshotManagement';
import { useModalState } from './hooks/useModalState';
import { DetailsModals } from './components/DetailsModals';

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

    // OPTIMIZATION: Stabilize references to prevent useTrafficDataLoader effect re-runs.
    // Defense-in-depth: useTrafficDataLoader also has skip logic, but stable references
    // prevent the effect from running at all when parent re-renders due to useVideos.
    const memoizedTrafficData = useMemo(() => trafficState.trafficData, [trafficState.trafficData]);
    const memoizedPackagingHistory = useMemo(() => versions.packagingHistory, [versions.packagingHistory]);

    // Version management handlers
    const versionMgmt = useVersionManagement({
        versions,
        isFormDirty,
        video,
        user,
        currentChannel,
        updateVideo,
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
    const prevActiveTabRef = React.useRef(activeTab);
    useEffect(() => {
        const prevTab = prevActiveTabRef.current;

        // When entering Traffic tab → switch to active version
        // When entering Traffic tab → switch to active version
        if (prevTab !== 'traffic' && activeTab === 'traffic') {
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
        if (prevTab !== 'packaging' && activeTab === 'packaging') {
            if (versions.viewingVersion !== versions.activeVersion) {
                versions.switchToVersion(versions.activeVersion);
            }
        }

        prevActiveTabRef.current = activeTab;
    }, [activeTab, versions]);

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
                onSnapshotClick={snapshotMgmt.handleSnapshotClick}
                onDeleteSnapshot={snapshotMgmt.handleDeleteSnapshot}
                activeTab={activeTab}
                onTabChange={setActiveTab}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {activeTab === 'packaging' ? (
                    <PackagingTab
                        video={video}
                        versionState={versions}
                        onDirtyChange={(dirty) => {
                            setIsFormDirty(dirty);
                            // We could also use isDataDifferent here if we wanted auto-dirty
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

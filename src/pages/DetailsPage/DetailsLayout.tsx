import React, { useState, useEffect } from 'react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { DetailsSidebar } from './Sidebar/DetailsSidebar';
import { PackagingTab } from './tabs/Packaging/PackagingTab';
import { TrafficTab } from './tabs/Traffic/TrafficTab';
import { usePackagingVersions } from './tabs/Packaging/hooks/usePackagingVersions';
import { useTrafficData } from './tabs/Traffic/hooks/useTrafficData';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';
import { useDraftDetection } from './hooks/useDraftDetection';
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

    // Draft detection
    const { hasDraft } = useDraftDetection(video, video.packagingHistory || []);

    // Version management
    const versions = usePackagingVersions({
        initialHistory: video.packagingHistory || [],
        initialCurrentVersion: video.currentPackagingVersion || 1,
        isDraft: video.isDraft || hasDraft,
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
            resolveCallback: modalState.resolveCallback
        } : {
            isForCreateVersion: false,
            versionToRestore: null,
            resolveCallback: null
        },
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
        if (prevTab !== 'traffic' && activeTab === 'traffic') {
            if (versions.viewingVersion !== versions.activeVersion) {
                versions.switchToVersion(versions.activeVersion);
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

    return (
        <div className="flex-1 flex overflow-hidden bg-video-edit-bg">
            {/* Left Sidebar */}
            <DetailsSidebar
                video={video}
                versions={versions.navSortedVersions}
                viewingVersion={versions.viewingVersion}
                activeVersion={versions.activeVersion}
                hasDraft={hasDraft}
                onVersionClick={versionMgmt.handleVersionClick}
                onDeleteVersion={versionMgmt.handleDeleteVersion}
                snapshots={trafficState.trafficData?.snapshots || []}
                selectedSnapshot={selectedSnapshot}
                onSnapshotClick={snapshotMgmt.handleSnapshotClick}
                onDeleteSnapshot={snapshotMgmt.handleDeleteSnapshot}
                activeTab={activeTab}
                onTabChange={setActiveTab}
            />

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'packaging' ? (
                    <PackagingTab
                        video={video}
                        versionState={versions}
                        onDirtyChange={setIsFormDirty}
                        onRestoreVersion={versionMgmt.handleRestoreVersion}
                        onRequestSnapshot={snapshotMgmt.handleRequestSnapshot}
                    />
                ) : (
                    <TrafficTab
                        video={video}
                        activeVersion={typeof versions.activeVersion === 'number' ? versions.activeVersion : 0}
                        viewingVersion={versions.viewingVersion}
                        selectedSnapshot={selectedSnapshot}
                        trafficData={trafficState.trafficData}
                        isLoadingData={trafficState.isLoading}
                        isSaving={trafficState.isSaving}
                        handleCsvUpload={trafficState.handleCsvUpload}
                        onSnapshotClick={snapshotMgmt.handleSnapshotClick}
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

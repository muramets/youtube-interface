import React, { useState, useCallback, useMemo } from 'react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { DetailsSidebar } from './Sidebar/DetailsSidebar';
import { PackagingTab } from './tabs/Packaging/PackagingTab';
import { TrafficTab } from './tabs/Traffic/TrafficTab';
import { usePackagingVersions } from './tabs/Packaging/hooks/usePackagingVersions';
import { useTrafficData } from './tabs/Traffic/hooks/useTrafficData';
import { ConfirmationModal } from '../../components/Shared/ConfirmationModal';
import { SnapshotRequestModal } from './tabs/Traffic/components/SnapshotRequestModal';
import { TrafficService } from '../../core/services/TrafficService';
import { parseTrafficCsv } from '../../core/utils/csvParser';
import { useUIStore } from '../../core/stores/uiStore';
import { useAuth } from '../../core/hooks/useAuth';
import { useChannelStore } from '../../core/stores/channelStore';
import { useVideos } from '../../core/hooks/useVideos';

interface DetailsLayoutProps {
    video: VideoDetails;
}

// Define exact type for activeVersion to match logic usage
export const DetailsLayout: React.FC<DetailsLayoutProps> = ({ video }) => {
    const { showToast } = useUIStore();
    const { user } = useAuth();
    const { currentChannel } = useChannelStore();
    const { updateVideo } = useVideos(user?.uid || '', currentChannel?.id || '');

    // Tab State
    const [activeTab, setActiveTab] = useState<'packaging' | 'traffic'>('packaging');

    // ============================================================================
    // BUSINESS LOGIC: Draft Detection
    // ============================================================================
    // A "draft" exists when current video data differs from the latest saved version.
    // - No versions = new video, no draft (nothing to compare against)
    // - Has versions = compare current title/description/tags/cover to latest snapshot
    const computedHasDraft = useMemo(() => {
        const history = video.packagingHistory || [];

        // If no versions exist yet, we're in a "draft v.1" state by default.
        // This ensures the sidebar sub-items (Draft) are visible.
        if (history.length === 0) return true;

        // Find the latest version
        const latestVersion = history.reduce((max, v) =>
            v.versionNumber > max.versionNumber ? v : max, history[0]);

        const snapshot = latestVersion.configurationSnapshot;
        if (!snapshot) return true; // Treat as draft if snapshot is missing

        // Compare current video data to latest version snapshot
        const videoTitle = video.title || '';
        const videoDescription = video.description || '';
        const videoTags = video.tags || [];
        const videoCover = video.customImage || '';
        const videoAbTestTitles = video.abTestTitles || [];
        const videoAbTestThumbnails = video.abTestThumbnails || [];

        const hasDifference =
            videoTitle !== snapshot.title ||
            videoDescription !== snapshot.description ||
            JSON.stringify(videoTags) !== JSON.stringify(snapshot.tags) ||
            videoCover !== (snapshot.coverImage || '') ||
            JSON.stringify(videoAbTestTitles) !== JSON.stringify(snapshot.abTestTitles || []) ||
            JSON.stringify(videoAbTestThumbnails) !== JSON.stringify(snapshot.abTestThumbnails || []);

        return hasDifference;
    }, [video]);

    // Version management hook
    const versions = usePackagingVersions({
        initialHistory: video.packagingHistory || [],
        initialCurrentVersion: video.currentPackagingVersion || 1,
        isDraft: video.isDraft || computedHasDraft
    });

    // Confirmation modal for switching versions with unsaved changes
    const [switchConfirmation, setSwitchConfirmation] = useState<{
        isOpen: boolean;
        targetVersion: number | 'draft' | null;
    }>({ isOpen: false, targetVersion: null });

    // Confirmation modal for deleting versions
    const [deleteConfirmation, setDeleteConfirmation] = useState<{
        isOpen: boolean;
        versionNumber: number | null;
    }>({ isOpen: false, versionNumber: null });

    // Traffic Data Hook (lifted state)
    const trafficState = useTrafficData({
        userId: user?.uid || '',
        channelId: currentChannel?.id || '',
        video
    });

    // Track if form has unsaved changes (will be set by PackagingTab)
    const [isFormDirty, setIsFormDirty] = useState(false);

    // Snapshot Request Modal State (for restore version)
    const [snapshotRequest, setSnapshotRequest] = useState<{
        isOpen: boolean;
        versionToRestore: number | null;
    }>({ isOpen: false, versionToRestore: null });

    // ============================================================================
    // BUSINESS LOGIC: Version Switch with Dirty Check
    // ============================================================================
    // When user clicks a version in sidebar:
    // - If form is dirty → show confirmation modal first
    // - If form is clean → switch immediately
    // This prevents accidental data loss.


    // Confirm switch (discard changes) -> Then Check for Freeze
    const confirmSwitch = useCallback(() => {
        setSwitchConfirmation(prev => ({ ...prev, isOpen: false }));
        setIsFormDirty(false);

        if (switchConfirmation.targetVersion !== null) {
            processVersionSwitch(switchConfirmation.targetVersion);
        }
    }, [switchConfirmation.targetVersion]);

    // Helper: Centralized Switch Logic
    const processVersionSwitch = (targetVersion: number | 'draft') => {
        // Simply switch version without freeze confirmation
        versions.switchToVersion(targetVersion);
    };

    // Handler when user clicks version in sidebar
    const handleVersionClick = useCallback((versionNumber: number | 'draft') => {
        if (versionNumber === versions.viewingVersion) return;

        if (isFormDirty) {
            // If dirty, ask to discard first
            setSwitchConfirmation({ isOpen: true, targetVersion: versionNumber });
        } else {
            // If clean, proceed to switch logic (which may ask to freeze)
            processVersionSwitch(versionNumber);
        }
    }, [versions.viewingVersion, isFormDirty, versions.activeVersion]);

    // ============================================================================
    // BUSINESS LOGIC: Version Deletion
    // ============================================================================
    // Deleting a version is destructive → always show confirmation modal.
    // Cannot delete the currently active version (business rule enforced in sidebar).
    const handleDeleteVersion = useCallback((versionNumber: number) => {
        setDeleteConfirmation({ isOpen: true, versionNumber });
    }, []);

    // Confirm delete
    const confirmDelete = useCallback(async () => {
        if (deleteConfirmation.versionNumber !== null) {
            const versionToDelete = deleteConfirmation.versionNumber;
            const isActiveDeleted = versions.activeVersion === versionToDelete;

            // Calculate updated data BEFORE calling deleteVersion
            const updatedHistory = versions.packagingHistory.filter(
                v => v.versionNumber !== versionToDelete
            );

            // Calculate new currentPackagingVersion
            const newCurrentVersion = updatedHistory.length === 0
                ? 1
                : Math.max(...updatedHistory.map(v => v.versionNumber)) + 1;

            // NEW LOGIC: If we deleted the ACTIVE version, we should roll back 
            // the video data to the new latest version to avoid creating a draft.
            let rollbackUpdates = {};
            if (isActiveDeleted && updatedHistory.length > 0) {
                // Find the new latest version
                const latestRemaining = updatedHistory.reduce((max, v) =>
                    v.versionNumber > max.versionNumber ? v : max, updatedHistory[0]);

                const snapshot = latestRemaining.configurationSnapshot;
                if (snapshot) {
                    rollbackUpdates = {
                        title: snapshot.title,
                        description: snapshot.description,
                        tags: snapshot.tags,
                        customImage: snapshot.coverImage || '',
                        thumbnail: snapshot.coverImage || '',
                        abTestTitles: snapshot.abTestTitles || [],
                        abTestThumbnails: snapshot.abTestThumbnails || [],
                        abTestResults: snapshot.abTestResults,
                        localizations: snapshot.localizations || {}
                    };
                }
            }

            const willHaveDraft = updatedHistory.length === 0;

            // INSTANT UI UPDATE
            versions.deleteVersion(versionToDelete);
            versions.setCurrentVersionNumber(newCurrentVersion);

            if (willHaveDraft) {
                versions.setHasDraft(true);
            } else {
                versions.setHasDraft(false);
            }

            showToast(`Version ${versionToDelete} deleted`, 'success');

            // Save to Firestore
            if (user?.uid && currentChannel?.id && video.id) {
                updateVideo({
                    videoId: video.id,
                    updates: {
                        ...rollbackUpdates, // Restore data if active version was deleted
                        packagingHistory: updatedHistory,
                        currentPackagingVersion: newCurrentVersion,
                        isDraft: willHaveDraft
                    }
                }).catch(error => {
                    console.error('Failed to save deletion to Firestore:', error);
                    showToast('Failed to save deletion', 'error');
                });
            }
        }
        setDeleteConfirmation({ isOpen: false, versionNumber: null });
    }, [deleteConfirmation.versionNumber, versions, showToast, user, currentChannel, video.id, updateVideo]);

    // ============================================================================
    // BUSINESS LOGIC: Restore Version with Snapshot
    // ============================================================================
    // Handler for restore version button
    const handleRestoreVersion = useCallback(async (versionToRestore: number) => {
        // Check if video is published
        const isPublished = !!video.publishedVideoId;

        if (isPublished) {
            // Show snapshot request modal
            setSnapshotRequest({
                isOpen: true,
                versionToRestore
            });
        } else {
            // Directly restore without snapshot for unpublished videos
            versions.restoreVersion(versionToRestore);

            // Save to Firestore to persist the restoration
            if (user?.uid && currentChannel?.id && video.id) {
                try {
                    // Get the version snapshot to restore data from
                    const versionToRestoreData = versions.packagingHistory.find(
                        v => v.versionNumber === versionToRestore
                    );
                    const snapshot = versionToRestoreData?.configurationSnapshot;

                    if (!snapshot) {
                        showToast('Version data not found', 'error');
                        return;
                    }

                    // Get updated history with new endDate for restored version
                    const updatedHistory = versions.packagingHistory.map(v =>
                        v.versionNumber === versionToRestore
                            ? { ...v, endDate: Date.now() }
                            : v
                    );

                    // Restore both the version metadata AND the actual video data
                    await updateVideo({
                        videoId: video.id,
                        updates: {
                            // Version metadata
                            packagingHistory: updatedHistory,
                            isDraft: false,
                            // Actual video data from snapshot
                            title: snapshot.title,
                            description: snapshot.description,
                            tags: snapshot.tags,
                            customImage: snapshot.coverImage || '',
                            thumbnail: snapshot.coverImage || '',
                            abTestTitles: snapshot.abTestTitles || [],
                            abTestThumbnails: snapshot.abTestThumbnails || [],
                            abTestResults: snapshot.abTestResults,
                            localizations: snapshot.localizations || {}
                        }
                    });
                } catch (error) {
                    console.error('Failed to save restoration to Firestore:', error);
                    showToast('Failed to save restoration', 'error');
                    return;
                }
            }

            showToast(`Restored to v.${versionToRestore}`, 'success');
        }
    }, [video.publishedVideoId, video.id, versions, showToast, user, currentChannel, updateVideo]);

    // Handle snapshot upload from modal
    const handleSnapshotUpload = useCallback(async (file: File) => {
        if (!user?.uid || !currentChannel?.id || !snapshotRequest.versionToRestore) return;

        try {
            const { sources, totalRow } = await parseTrafficCsv(file);
            await TrafficService.createVersionSnapshot(
                user.uid,
                currentChannel.id,
                video.id,
                versions.activeVersion as number,
                sources,
                totalRow
            );

            // Restore the version
            versions.restoreVersion(snapshotRequest.versionToRestore);

            // Get the version snapshot to restore data from
            const versionToRestoreData = versions.packagingHistory.find(
                v => v.versionNumber === snapshotRequest.versionToRestore
            );
            const snapshot = versionToRestoreData?.configurationSnapshot;

            if (!snapshot) {
                showToast('Version data not found', 'error');
                return;
            }

            // Save to Firestore to persist the restoration
            const updatedHistory = versions.packagingHistory.map(v =>
                v.versionNumber === snapshotRequest.versionToRestore
                    ? { ...v, endDate: Date.now() }
                    : v
            );

            await updateVideo({
                videoId: video.id,
                updates: {
                    // Version metadata
                    packagingHistory: updatedHistory,
                    isDraft: false,
                    // Actual video data from snapshot
                    title: snapshot.title,
                    description: snapshot.description,
                    tags: snapshot.tags,
                    customImage: snapshot.coverImage || '',
                    thumbnail: snapshot.coverImage || '',
                    abTestTitles: snapshot.abTestTitles || [],
                    abTestThumbnails: snapshot.abTestThumbnails || [],
                    abTestResults: snapshot.abTestResults,
                    localizations: snapshot.localizations || {}
                }
            });

            setSnapshotRequest({ isOpen: false, versionToRestore: null });
            showToast(`Snapshot saved & restored to v.${snapshotRequest.versionToRestore}`, 'success');
        } catch (err) {
            console.error('Failed to save snapshot:', err);
            showToast('Failed to save snapshot', 'error');
        }
    }, [user, currentChannel, video.id, versions, snapshotRequest, showToast, updateVideo]);

    // Handle skip snapshot (use current data)
    const handleSkipSnapshot = useCallback(async () => {
        if (!user?.uid || !currentChannel?.id || !snapshotRequest.versionToRestore) return;

        try {
            // Use current traffic data (if any) as snapshot
            const currentData = trafficState.trafficData;
            await TrafficService.createVersionSnapshot(
                user.uid,
                currentChannel.id,
                video.id,
                versions.activeVersion as number,
                currentData?.sources || [],
                currentData?.totalRow
            );

            // Restore the version
            versions.restoreVersion(snapshotRequest.versionToRestore);

            // Get the version snapshot to restore data from
            const versionToRestoreData = versions.packagingHistory.find(
                v => v.versionNumber === snapshotRequest.versionToRestore
            );
            const snapshot = versionToRestoreData?.configurationSnapshot;

            if (!snapshot) {
                showToast('Version data not found', 'error');
                return;
            }

            // Save to Firestore to persist the restoration
            const updatedHistory = versions.packagingHistory.map(v =>
                v.versionNumber === snapshotRequest.versionToRestore
                    ? { ...v, endDate: Date.now() }
                    : v
            );

            await updateVideo({
                videoId: video.id,
                updates: {
                    // Version metadata
                    packagingHistory: updatedHistory,
                    isDraft: false,
                    // Actual video data from snapshot
                    title: snapshot.title,
                    description: snapshot.description,
                    tags: snapshot.tags,
                    customImage: snapshot.coverImage || '',
                    thumbnail: snapshot.coverImage || '',
                    abTestTitles: snapshot.abTestTitles || [],
                    abTestThumbnails: snapshot.abTestThumbnails || [],
                    abTestResults: snapshot.abTestResults,
                    localizations: snapshot.localizations || {}
                }
            });

            setSnapshotRequest({ isOpen: false, versionToRestore: null });
            showToast(`Restored to v.${snapshotRequest.versionToRestore}`, 'success');
        } catch (err) {
            console.error('Failed to create snapshot:', err);
            showToast('Failed to create snapshot', 'error');
        }
    }, [user, currentChannel, video.id, versions, trafficState, snapshotRequest, showToast, updateVideo]);


    return (
        <div className="flex-1 flex overflow-hidden bg-video-edit-bg">
            {/* Left Sidebar */}
            <DetailsSidebar
                video={video}
                versions={versions.navSortedVersions}
                viewingVersion={versions.viewingVersion}
                activeVersion={versions.activeVersion}
                hasDraft={versions.hasDraft}
                onVersionClick={handleVersionClick}
                onDeleteVersion={handleDeleteVersion}
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
                        onRestoreVersion={handleRestoreVersion}
                    />
                ) : (
                    <TrafficTab
                        video={video}
                        activeVersion={typeof versions.activeVersion === 'number' ? versions.activeVersion : 0}
                        viewingVersion={versions.viewingVersion}
                    // We could pass trafficState down if TrafficTab accepts it to avoid double hook usage
                    // But TrafficTab currently calls useTrafficData internally.
                    // I should update TrafficTab to accept "trafficState" or just let it be for now?
                    // If I call useTrafficData HERE in layout, I also call it in TrafficTab. 
                    // Double fetching? Yes.
                    // Ideally TrafficTab should accept the data.
                    // For now, I'll update TrafficTab prop interface in a separate step or let it fetch twice (caching might handle it, but inefficient).
                    // Let's refactor TrafficTab to accept props in next step to be clean.
                    // For this ReplaceFileContent, I will assume I pass props, but TS might error if I haven't updated TrafficTab yet.
                    // To avoid TS error NOW, I will render TrafficTab as is, and it will fetch its own data.
                    // The Freeze Logic uses 'trafficState' here.
                    />
                )}
            </div>

            {/* Switch Confirmation Modal */}
            <ConfirmationModal
                isOpen={switchConfirmation.isOpen}
                title="Unsaved Changes"
                message="You have unsaved changes. Are you sure you want to switch versions? Your changes will be lost."
                confirmLabel="Discard Changes"
                cancelLabel="Cancel"
                onConfirm={confirmSwitch}
                onClose={() => setSwitchConfirmation({ isOpen: false, targetVersion: null })}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteConfirmation.isOpen}
                title="Delete Version"
                message={`Are you sure you want to delete v.${deleteConfirmation.versionNumber}? This action cannot be undone.`}
                confirmLabel="Delete"
                cancelLabel="Cancel"
                onConfirm={confirmDelete}
                onClose={() => setDeleteConfirmation({ isOpen: false, versionNumber: null })}
            />

            {/* Snapshot Request Modal (for restore version) */}
            <SnapshotRequestModal
                isOpen={snapshotRequest.isOpen}
                version={versions.activeVersion as number}
                videoTitle={video.title}
                onUpload={handleSnapshotUpload}
                onSkip={handleSkipSnapshot}
                onClose={() => setSnapshotRequest({ isOpen: false, versionToRestore: null })}
            />
        </div>
    );
};

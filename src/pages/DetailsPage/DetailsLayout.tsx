import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { DetailsSidebar } from './Sidebar/DetailsSidebar';
import { PackagingTab } from './tabs/Packaging/PackagingTab';
import { TrafficTab } from './tabs/Traffic/TrafficTab';
import { usePackagingVersions } from './tabs/Packaging/hooks/usePackagingVersions';
import { useTrafficData } from './tabs/Traffic/hooks/useTrafficData';
import { ConfirmationModal } from '../../components/Shared/ConfirmationModal';
import { SnapshotRequestModal } from './tabs/Traffic/modals/SnapshotRequestModal';
import { TrafficService } from '../../core/services/traffic';
import { parseTrafficCsv } from './tabs/Traffic/utils/csvParser';
import { generateSnapshotId } from '../../core/utils/snapshotUtils';
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

        console.log('[DetailsLayout] computedHasDraft:', {
            hasDifference,
            videoTitle,
            snapTitle: snapshot.title,
            videoTagsCount: videoTags.length,
            snapTagsCount: snapshot.tags?.length,
            isDraftFirestore: video.isDraft,
            activeVersionFirestore: video.activeVersion
        });

        return hasDifference;
    }, [video]);

    // Version management hook
    const versions = usePackagingVersions({
        initialHistory: video.packagingHistory || [],
        initialCurrentVersion: video.currentPackagingVersion || 1,
        isDraft: video.isDraft || computedHasDraft,
        initialActiveVersion: video.activeVersion // Honor explicit activeVersion from Firestore
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

    // Snapshot Request Modal State
    const [snapshotRequest, setSnapshotRequest] = useState<{
        isOpen: boolean;
        versionToRestore: number | null;
        isForCreateVersion: boolean; // true = CREATE_VERSION, false = RESTORE_VERSION
        resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
    }>({ isOpen: false, versionToRestore: null, isForCreateVersion: false, resolveCallback: null });

    // Selected Snapshot State (for viewing specific snapshot)
    const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

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

    // Auto-switch to active version when entering Traffic tab
    // We use a ref to track the previous tab to ensure this logic only runs ONCE when switching TO traffic tab
    const prevActiveTabRef = React.useRef(activeTab);

    useEffect(() => {
        const prevTab = prevActiveTabRef.current;
        if (prevTab !== 'traffic' && activeTab === 'traffic') {
            // Just entered Traffic tab -> Switch to active version
            if (versions.viewingVersion !== versions.activeVersion) {
                versions.switchToVersion(versions.activeVersion);
                setSelectedSnapshot(null);
            }
        }
        prevActiveTabRef.current = activeTab;
    }, [activeTab, versions.activeVersion, versions.switchToVersion, versions.viewingVersion]);

    // Handler when user clicks version in sidebar
    const handleVersionClick = useCallback((versionNumber: number | 'draft') => {
        // Allow clicking the current version to clear the selected snapshot
        if (versionNumber === versions.viewingVersion) {
            if (activeTab === 'traffic' && selectedSnapshot) {
                setSelectedSnapshot(null);
            }
            return;
        }

        if (isFormDirty) {
            // If dirty, ask to discard first
            setSwitchConfirmation({ isOpen: true, targetVersion: versionNumber });
        } else {
            // New version selected -> Clear any selected snapshot
            setSelectedSnapshot(null);
            // If clean, proceed to switch logic (which may ask to freeze)
            processVersionSwitch(versionNumber);
        }
    }, [versions.viewingVersion, isFormDirty, versions.activeVersion, activeTab, selectedSnapshot]);

    // Handler when user clicks snapshot in sidebar
    const handleSnapshotClick = useCallback((snapshotId: string) => {
        setSelectedSnapshot(snapshotId);
        setActiveTab('traffic'); // Ensure traffic tab is active
    }, []);

    // Handler when user deletes snapshot
    const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
        // Check if deleting the currently selected snapshot
        const isDeletingActive = selectedSnapshot === snapshotId;

        // Call the deletion handler from useTrafficData
        await trafficState.handleDeleteSnapshot(snapshotId);

        // Navigation fallback if deleting active snapshot
        if (isDeletingActive) {
            const allSnapshots = trafficState.trafficData?.snapshots || [];
            // Find previous snapshot (by timestamp)
            const sortedSnapshots = [...allSnapshots]
                .filter(s => s.id !== snapshotId)
                .sort((a, b) => b.timestamp - a.timestamp);

            if (sortedSnapshots.length > 0) {
                // Switch to previous snapshot
                setSelectedSnapshot(sortedSnapshots[0].id);
            } else {
                // No snapshots left → switch to Traffic tab empty state
                setSelectedSnapshot(null);
                setActiveTab('traffic');
            }
        }
    }, [selectedSnapshot, trafficState, setActiveTab]);

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
                        abTestResults: snapshot.abTestResults || { titles: [], thumbnails: [] },
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
                versionToRestore,
                isForCreateVersion: false,
                resolveCallback: null
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
                            abTestResults: snapshot.abTestResults || { titles: [], thumbnails: [] },
                            localizations: snapshot.localizations || {},
                            activeVersion: versionToRestore
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

    /**
     * BUSINESS LOGIC: Request Snapshot for CREATE_VERSION
     * 
     * Shows SnapshotRequestModal and returns snapshotId when user uploads CSV.
     * Returns null if user skips or cancels.
     * 
     * This is called from PackagingTab when creating a new version for published videos.
     */
    const handleRequestSnapshot = useCallback(async (versionNumber: number): Promise<string | null | undefined> => {
        // If video is not published, skip modal but ensure traffic is cleared for new version
        if (!video.publishedVideoId) {
            console.log('[DetailsLayout] Video unpublished, auto-skipping snapshot and clearing traffic');
            if (user?.uid && currentChannel?.id && video.id) {
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);
                await trafficState.refetch();
            }
            return null; // Equivalent to "Skip"
        }

        return new Promise<string | null | undefined>((resolve) => {
            setSnapshotRequest({
                isOpen: true,
                versionToRestore: versionNumber,
                isForCreateVersion: true,
                resolveCallback: resolve
            });
        });
    }, [video.publishedVideoId, video.id, user, currentChannel, trafficState]);

    // Handle snapshot upload from modal
    const handleSnapshotUpload = useCallback(async (file: File) => {
        if (!user?.uid || !currentChannel?.id) return;

        try {
            const { sources, totalRow } = await parseTrafficCsv(file);
            const timestamp = Date.now();
            const versionNum = snapshotRequest.isForCreateVersion
                ? (versions.activeVersion === 'draft' ? 0 : (versions.activeVersion || 1)) + 1
                : (versions.activeVersion as number);

            const snapshotId = generateSnapshotId(timestamp, versionNum);

            await TrafficService.createVersionSnapshot(
                user.uid,
                currentChannel.id,
                video.id,
                versionNum,
                sources,
                totalRow,
                file // Pass original CSV file for hybrid storage
            );

            console.log('[DetailsLayout] handleSnapshotUpload: isForCreateVersion:', snapshotRequest.isForCreateVersion);
            if (snapshotRequest.isForCreateVersion) {
                // For CREATE_VERSION: 
                // 1. Clear current traffic data to start fresh for new version
                console.log('[DetailsLayout] Clearing traffic data for new version');
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);

                // 2. Refresh traffic state locally
                await trafficState.refetch();

                // 3. Resolve callback
                snapshotRequest.resolveCallback?.(snapshotId);
                setSnapshotRequest({ isOpen: false, versionToRestore: null, isForCreateVersion: false, resolveCallback: null });
                return;
            }

            // For RESTORE_VERSION: continue with restore logic
            if (!snapshotRequest.versionToRestore) return;

            versions.restoreVersion(snapshotRequest.versionToRestore, snapshotId);

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
                    localizations: snapshot.localizations || {},
                    activeVersion: snapshotRequest.versionToRestore
                }
            });

            setSnapshotRequest({ isOpen: false, versionToRestore: null, isForCreateVersion: false, resolveCallback: null });
            showToast(`Snapshot saved & restored to v.${snapshotRequest.versionToRestore}`, 'success');
        } catch (err) {
            console.error('Failed to save snapshot:', err);
            showToast('Failed to save snapshot', 'error');
        }
    }, [user, currentChannel, video.id, versions, snapshotRequest, showToast, updateVideo, trafficState]);

    // Handle skip snapshot
    const handleSkipSnapshot = useCallback(async () => {
        if (snapshotRequest.isForCreateVersion) {
            // For CREATE_VERSION: 
            // 1. Clear current traffic data to start fresh (even if user skipped snapshot upload)
            // Logic: They are starting a new version period, and chose NOT to save old data to storage,
            // but we still must clear the main data so it doesn't bleed into the new version.
            // (Old data is effectively lost if they skip snapshot, or kept in snapshots array if we did an auto-snapshot?
            // Wait, we probably want to auto-archive current sources to a snapshot WITHOUT CSV if they skip?
            // The prompt says "Skip", usually implying "Don't upload CSV".
            // The implementation plan says: "Call TrafficService.clearCurrentTrafficData".

            if (user?.uid && currentChannel?.id && video.id) {
                console.log('[DetailsLayout] handleSkipSnapshot -> clearing data for new version');
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);
                await trafficState.refetch();
            }

            // 2. Return null to indicate skip
            snapshotRequest.resolveCallback?.(null);
            setSnapshotRequest({ isOpen: false, versionToRestore: null, isForCreateVersion: false, resolveCallback: null });
            return;
        }

        // For RESTORE_VERSION: continue with existing logic
        if (!user?.uid || !currentChannel?.id || !snapshotRequest.versionToRestore) {
            // If for some reason we can't proceed with restore, still resolve the callback
            snapshotRequest.resolveCallback?.(null);
            setSnapshotRequest({ isOpen: false, versionToRestore: null, isForCreateVersion: false, resolveCallback: null });
            return;
        }

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
                    localizations: snapshot.localizations || {},
                    activeVersion: snapshotRequest.versionToRestore
                }
            });

            setSnapshotRequest({ isOpen: false, versionToRestore: null, isForCreateVersion: false, resolveCallback: null });
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
                snapshots={trafficState.trafficData?.snapshots || []}
                selectedSnapshot={selectedSnapshot}
                onSnapshotClick={handleSnapshotClick}
                onDeleteSnapshot={handleDeleteSnapshot}
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
                        onRequestSnapshot={handleRequestSnapshot}
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
                        onSnapshotClick={handleSnapshotClick}
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
                onClose={() => {
                    snapshotRequest.resolveCallback?.(undefined);
                    setSnapshotRequest({ isOpen: false, versionToRestore: null, isForCreateVersion: false, resolveCallback: null });
                }}
            />
        </div>
    );
};

import React, { useState, useCallback, useMemo } from 'react';
import { type VideoDetails } from '../../core/utils/youtubeApi';
import { DetailsSidebar } from './Sidebar/DetailsSidebar';
import { PackagingTab } from './tabs/Packaging/PackagingTab';
import { usePackagingVersions } from './tabs/Packaging/hooks/usePackagingVersions';
import { ConfirmationModal } from '../../components/Shared/ConfirmationModal';
import { useUIStore } from '../../core/stores/uiStore';

interface DetailsLayoutProps {
    video: VideoDetails;
}

export const DetailsLayout: React.FC<DetailsLayoutProps> = ({ video }) => {
    const { showToast } = useUIStore();

    // ============================================================================
    // BUSINESS LOGIC: Draft Detection
    // ============================================================================
    // A "draft" exists when current video data differs from the latest saved version.
    // - No versions = new video, no draft (nothing to compare against)
    // - Has versions = compare current title/description/tags/cover to latest snapshot
    const computedHasDraft = useMemo(() => {
        const history = video.packagingHistory || [];
        if (history.length === 0) return false;

        // Find the latest version
        const latestVersion = history.reduce((max, v) =>
            v.versionNumber > max.versionNumber ? v : max, history[0]);

        const snapshot = latestVersion.configurationSnapshot;
        if (!snapshot) return false;

        // Compare current video data to latest version snapshot
        const videoTitle = video.title || '';
        const videoDescription = video.description || '';
        const videoTags = video.tags || [];
        const videoCover = video.customImage || '';
        const videoAbTestTitles = video.abTestTitles || [];
        const videoAbTestThumbnails = video.abTestThumbnails || [];
        const videoAbTestResults = video.abTestResults || { titles: [], thumbnails: [] };

        const hasDifference =
            videoTitle !== snapshot.title ||
            videoDescription !== snapshot.description ||
            JSON.stringify(videoTags) !== JSON.stringify(snapshot.tags) ||
            videoCover !== (snapshot.coverImage || '') ||
            JSON.stringify(videoAbTestTitles) !== JSON.stringify(snapshot.abTestTitles || []) ||
            JSON.stringify(videoAbTestThumbnails) !== JSON.stringify(snapshot.abTestThumbnails || []) ||
            JSON.stringify(videoAbTestResults) !== JSON.stringify(snapshot.abTestResults || { titles: [], thumbnails: [] });

        return hasDifference;
    }, [video]);

    // Version management hook
    console.log('[DEBUG DetailsLayout] video.packagingHistory:', video.packagingHistory);
    console.log('[DEBUG DetailsLayout] video.currentPackagingVersion:', video.currentPackagingVersion);
    console.log('[DEBUG DetailsLayout] computedHasDraft:', computedHasDraft);
    const versions = usePackagingVersions({
        initialHistory: video.packagingHistory || [],
        initialCurrentVersion: video.currentPackagingVersion || 1,
        isDraft: computedHasDraft
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

    // Track if form has unsaved changes (will be set by PackagingTab)
    const [isFormDirty, setIsFormDirty] = useState(false);

    // ============================================================================
    // BUSINESS LOGIC: Version Switch with Dirty Check
    // ============================================================================
    // When user clicks a version in sidebar:
    // - If form is dirty → show confirmation modal first
    // - If form is clean → switch immediately
    // This prevents accidental data loss.
    const handleVersionClick = useCallback((versionNumber: number | 'draft') => {
        // If already viewing this version, do nothing
        if (versionNumber === versions.viewingVersion) return;

        // If form is dirty, show confirmation
        if (isFormDirty) {
            setSwitchConfirmation({ isOpen: true, targetVersion: versionNumber });
        } else {
            versions.switchToVersion(versionNumber);
        }
    }, [versions, isFormDirty]);

    // Confirm switch (discard changes)
    const confirmSwitch = useCallback(() => {
        if (switchConfirmation.targetVersion !== null) {
            versions.switchToVersion(switchConfirmation.targetVersion);
            setIsFormDirty(false);
        }
        setSwitchConfirmation({ isOpen: false, targetVersion: null });
    }, [versions, switchConfirmation.targetVersion]);

    // ============================================================================
    // BUSINESS LOGIC: Version Deletion
    // ============================================================================
    // Deleting a version is destructive → always show confirmation modal.
    // Cannot delete the currently active version (business rule enforced in sidebar).
    const handleDeleteVersion = useCallback((versionNumber: number) => {
        setDeleteConfirmation({ isOpen: true, versionNumber });
    }, []);

    // Confirm delete
    const confirmDelete = useCallback(() => {
        if (deleteConfirmation.versionNumber !== null) {
            versions.deleteVersion(deleteConfirmation.versionNumber);
            showToast(`Version ${deleteConfirmation.versionNumber} deleted`, 'success');
        }
        setDeleteConfirmation({ isOpen: false, versionNumber: null });
    }, [versions, deleteConfirmation.versionNumber, showToast]);

    return (
        <div className="flex-1 flex overflow-hidden bg-video-edit-bg">
            {/* Left Sidebar */}
            <DetailsSidebar
                video={video}
                versions={versions.packagingHistory}
                viewingVersion={versions.viewingVersion}
                activeVersion={versions.activeVersion}
                hasDraft={versions.hasDraft}
                onVersionClick={handleVersionClick}
                onDeleteVersion={handleDeleteVersion}
            />

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto">
                <PackagingTab
                    video={video}
                    versionState={versions}
                    onDirtyChange={setIsFormDirty}
                />
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
        </div>
    );
};

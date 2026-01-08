import { useState, useCallback } from 'react';
import { type VideoDetails, type CoverVersion } from '../../../../../core/utils/youtubeApi';
import { useUIStore } from '../../../../../core/stores/uiStore';
import { useVideos } from '../../../../../core/hooks/useVideos';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useSettings } from '../../../../../core/hooks/useSettings';
import { ChannelService } from '../../../../../core/services/channelService';
import { type VersionState } from '../types';
import { type UsePackagingLocalizationResult } from './usePackagingLocalization';
import { type UsePackagingFormStateResult } from './usePackagingFormState';
import { type UseABTestingResult } from './useABTesting';

interface UsePackagingActionsProps {
    video: VideoDetails;
    versionState: VersionState;
    localization: UsePackagingLocalizationResult;
    formState: UsePackagingFormStateResult;
    abTesting: UseABTestingResult;
    onRequestSnapshot?: (versionNumber: number) => Promise<string | null>; // Returns snapshotId or null if skipped
}

export const usePackagingActions = ({
    video,
    versionState,
    localization,
    formState,
    abTesting,
    onRequestSnapshot
}: UsePackagingActionsProps) => {
    const { user } = useAuth();
    const { currentChannel, setCurrentChannel } = useChannelStore();
    const { cloneSettings } = useSettings();
    const { updateVideo, cloneVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();
    const [isSaving, setIsSaving] = useState(false);
    const [cloningVersion, setCloningVersion] = useState<number | null>(null);

    // Common payload construction
    const buildSavePayload = useCallback(() => {
        const locPayload = localization.getFullPayload();

        return {
            ...locPayload,
            customImage: formState.customImage,
            customImageName: formState.customImageName,
            customImageVersion: formState.customImageVersion,
            publishedVideoId: formState.publishedVideoId,
            videoRender: formState.videoRender,
            audioRender: formState.audioRender,
            coverHistory: formState.pendingHistory,
            abTestTitles: abTesting.titles,
            abTestThumbnails: abTesting.thumbnails,
            abTestResults: abTesting.results
        };
    }, [localization, formState, abTesting]);

    const handleSave = useCallback(async () => {
        if (!user || !currentChannel || !video.id) return;

        // Prevent saving if image is still uploading (blob: URLs are temporary)
        if (formState.customImage.startsWith('blob:')) {
            showToast('Please wait for image upload to complete', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const payload = buildSavePayload();

            // Mark as draft -> switches sidebar to Draft
            versionState.saveDraft();
            const versionPayload = versionState.getVersionsPayload();

            await updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    // Keep thumbnail in sync with customImage (use empty string if deliberately cleared)
                    thumbnail: payload.customImage,
                    // Version data
                    packagingHistory: versionPayload.packagingHistory,
                    currentPackagingVersion: versionPayload.currentPackagingVersion,
                    isDraft: true
                }
            });

            formState.updateSnapshotToCurrent();
            showToast('Saved as draft', 'success');
        } catch (error) {
            console.error('Failed to save video:', error);
            showToast('Failed to save video', 'error');
        } finally {
            setIsSaving(false);
        }
    }, [user, currentChannel, video.id, buildSavePayload, versionState, updateVideo, formState, showToast]);

    /**
     * BUSINESS LOGIC: Save As New Version with CSV Snapshot
     * 
     * For published videos:
     * 1. Request CSV snapshot to close current version's period
     * 2. Create new version with closingSnapshotId
     * 3. Save to Firestore
     * 
     * For unpublished videos:
     * 1. Create new version without snapshot
     * 2. Save to Firestore
     */
    const handleSaveAsNewVersion = useCallback(async () => {
        if (!user || !currentChannel || !video.id) return;

        // Prevent saving if image is still uploading (blob: URLs are temporary)
        if (formState.customImage.startsWith('blob:')) {
            showToast('Please wait for image upload to complete', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const payload = buildSavePayload();
            let closingSnapshotId: string | null = null;

            // Request CSV snapshot for published videos
            if (video.publishedVideoId && onRequestSnapshot) {
                closingSnapshotId = await onRequestSnapshot(versionState.activeVersion as number);
                // If user cancelled, don't create version
                if (closingSnapshotId === null) {
                    setIsSaving(false);
                    return;
                }
            }

            // Create new version - this updates local state via reducer
            const { newVersion, updatedHistory, currentPackagingVersion } = versionState.createVersion({
                title: payload.title,
                description: payload.description,
                tags: payload.tags,
                coverImage: formState.customImage || null,
                abTestTitles: abTesting.titles,
                abTestThumbnails: abTesting.thumbnails,
                abTestResults: abTesting.results,
                localizations: payload.localizations
            }, closingSnapshotId || undefined);

            // Update snapshot and show toast
            formState.updateSnapshotToCurrent();
            showToast(`Saved as v.${newVersion.versionNumber}`, 'success');

            // Save to Firestore in background
            updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    thumbnail: payload.customImage,
                    packagingHistory: updatedHistory,
                    currentPackagingVersion: currentPackagingVersion,
                    isDraft: false
                }
            }).catch(error => {
                console.error('Failed to create version:', error);
                showToast('Failed to save to server', 'error');
            });
        } catch (error) {
            console.error('Failed to create version:', error);
            showToast('Failed to create version', 'error');
        } finally {
            setIsSaving(false);
        }
    }, [user, currentChannel, video.id, video.publishedVideoId, buildSavePayload, versionState, updateVideo, formState, showToast, abTesting, onRequestSnapshot]);

    const handleCancel = useCallback(() => {
        formState.resetToSnapshot(formState.loadedSnapshot);
    }, [formState]);

    const handleCloneFromVersion = useCallback(async (version: CoverVersion) => {
        if (cloningVersion !== null) return;
        setCloningVersion(version.version);
        try {
            await cloneVideo({
                originalVideo: video,
                coverVersion: version,
                cloneDurationSeconds: cloneSettings?.cloneDurationSeconds || 3600
            });

            // Dynamic message based on whether there are unsaved changes
            const message = formState.isDirty
                ? `Thumbnail cloned — save & view`
                : `Thumbnail cloned — click to view`;

            // Show toast with action to save draft and navigate to homepage
            showToast(
                message,
                'success',
                'clickable', // This signals the toast is clickable
                async () => {
                    // Auto-save draft before navigating (only if dirty)
                    if (formState.isDirty) {
                        try {
                            await handleSave();
                        } catch (error) {
                            console.error('Failed to save draft:', error);
                            showToast('Failed to save changes', 'error');
                            return; // Don't navigate if save failed
                        }
                    }
                    // Navigate to homepage to see the cloned video
                    window.location.href = '/';
                }
            );
        } catch {
            showToast('Failed to clone version', 'error');
        } finally {
            setCloningVersion(null);
        }
    }, [cloningVersion, cloneVideo, video, showToast, cloneSettings, formState.isDirty, handleSave]);

    const handleRestore = useCallback(() => {
        if (versionState.viewingVersion !== 'draft' && typeof versionState.viewingVersion === 'number') {
            versionState.restoreVersion(versionState.viewingVersion);
            showToast(`Restored to v.${versionState.viewingVersion}`, 'success');
        }
    }, [versionState, showToast]);

    const handleAddLanguage = useCallback(async (code: string, customName?: string, customFlag?: string) => {
        localization.addLanguage(code, customName, customFlag);
        if (customName && user && currentChannel) {
            const existing = currentChannel.customLanguages || [];
            if (!existing.some(l => l.code === code)) {
                const updated = [...existing, { code, name: customName, flag: customFlag || '' }];
                try {
                    await ChannelService.updateChannel(user.uid, currentChannel.id, { customLanguages: updated });
                    setCurrentChannel({ ...currentChannel, customLanguages: updated });
                } catch (e) {
                    console.error('Failed to save language', e);
                }
            }
        }
    }, [localization, user, currentChannel, setCurrentChannel]);

    const handleDeleteCustomLanguage = useCallback(async (code: string) => {
        if (!user || !currentChannel) return;
        const updated = (currentChannel.customLanguages || []).filter(l => l.code !== code);
        try {
            await ChannelService.updateChannel(user.uid, currentChannel.id, { customLanguages: updated });
            setCurrentChannel({ ...currentChannel, customLanguages: updated });
            showToast(`Language "${code.toUpperCase()}" deleted`, 'success');
        } catch (e) {
            showToast('Failed to delete language', 'error');
        }
    }, [user, currentChannel, setCurrentChannel, showToast]);

    /**
     * Saves ONLY A/B test results to the server in the background.
     * 
     * This is a "quiet" save that:
     * - Does NOT create a draft or trigger version history
     * - Does NOT show a toast notification
     * - Updates the loaded snapshot so the sync logic doesn't revert the change
     * 
     * Used when the user updates watch time share data without modifying
     * the actual A/B test content (titles/thumbnails).
     */
    const handleSaveResultsOnly = useCallback(async (newResults: { titles: number[], thumbnails: number[] }) => {
        if (!user || !currentChannel || !video.id) return;
        try {
            // 1. Prepare updated history to include results in the active version's snapshot
            // This ensures results survive a page refresh when viewing that version
            let updatedHistory = [...(video.packagingHistory || [])];
            if (versionState.activeVersion !== 'draft') {
                updatedHistory = updatedHistory.map(v =>
                    v.versionNumber === versionState.activeVersion
                        ? {
                            ...v,
                            configurationSnapshot: {
                                ...v.configurationSnapshot,
                                abTestResults: newResults
                            }
                        }
                        : v
                );
            }

            // 2. Perform Update to Firestore
            await updateVideo({
                videoId: video.id,
                updates: {
                    abTestResults: newResults,
                    packagingHistory: updatedHistory
                }
            });

            // 3. Update local state to stay in sync
            // Update versionState history so it knows about the change immediately
            versionState.setPackagingHistory(updatedHistory);

            // Update the loaded snapshot's results so it stays in sync with what's on server
            // (even though results are ignored for dirty check, it's good practice)
            formState.setLoadedSnapshot(prev => ({
                ...prev,
                abTestResults: newResults
            }));
        } catch (error) {
            console.error('Failed to save results in background:', error);
            showToast('Failed to sync results with server', 'error');
        }
    }, [user, currentChannel, video.id, video.packagingHistory, versionState, updateVideo, formState, showToast]);

    // Auto-save metadata fields (publishedVideoId, videoRender, audioRender)
    // These fields don't belong to packaging versioning, so they save independently
    const handleSaveMetadata = useCallback(async (metadata: {
        publishedVideoId: string;
        videoRender: string;
        audioRender: string;
    }) => {
        if (!user || !currentChannel || !video.id) return;

        try {
            await updateVideo({
                videoId: video.id,
                updates: metadata
            });
        } catch (error) {
            console.error('Failed to auto-save metadata:', error);
            // Silent fail - don't show toast for auto-save
        }
    }, [user, currentChannel, video.id, updateVideo]);

    return {
        isSaving,
        cloningVersion,
        handleSave,
        handleSaveAsNewVersion,
        handleSaveResultsOnly,
        handleSaveMetadata,
        handleCancel,
        handleCloneFromVersion,
        handleRestore,
        handleAddLanguage,
        handleDeleteCustomLanguage
    };
};

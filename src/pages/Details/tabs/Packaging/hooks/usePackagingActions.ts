import { useState, useCallback } from 'react';
import { type VideoDetails, type CoverVersion } from '../../../../../core/utils/youtubeApi';
import type { PackagingVersion, ActivePeriod } from '../../../../../core/types/versioning';
import type { TrafficData, TrafficSnapshot } from '../../../../../core/types/traffic';
import { useUIStore } from '../../../../../core/stores/uiStore';
import { useVideos } from '../../../../../core/hooks/useVideos';
import { useAuth } from '../../../../../core/hooks/useAuth';
import { useChannelStore } from '../../../../../core/stores/channelStore';
import { useSettings } from '../../../../../core/hooks/useSettings';
import { ChannelService } from '../../../../../core/services/channelService';
import { deleteImageFromStorage } from '../../../../../core/services/storageService';
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
    onRequestSnapshot?: (versionNumber: number) => Promise<string | null | undefined>; // Returns snapshotId, null (skip), or undefined (cancel)
    trafficData?: TrafficData | null; // Traffic data for finding snapshots
}

export const usePackagingActions = ({
    video,
    versionState,
    localization,
    formState,
    abTesting,
    onRequestSnapshot,
    trafficData
}: UsePackagingActionsProps) => {
    const { user } = useAuth();
    const { currentChannel, setCurrentChannel } = useChannelStore();
    const { cloneSettings, generalSettings } = useSettings();
    const { updateVideo, cloneVideo } = useVideos(user?.uid || '', currentChannel?.id || '');
    const { showToast } = useUIStore();
    const [savingAction, setSavingAction] = useState<'draft' | 'version' | 'metadata' | null>(null);
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

        setSavingAction('draft');
        try {
            const payload = buildSavePayload();

            // Mark as draft -> switches sidebar to Draft
            const { updatedHistory: updatedPackagingHistory } = versionState.saveDraft();
            const versionPayload = versionState.getVersionsPayload();

            // Prepare for cleanup: identify images removed from coverHistory
            const removedImages = (video.coverHistory || [])
                .filter(old => !payload.coverHistory.some(curr => curr.url === old.url))
                .map(item => item.url);

            await updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    // Keep thumbnail in sync with customImage (use empty string if deliberately cleared)
                    thumbnail: payload.customImage,
                    // Version data
                    packagingHistory: updatedPackagingHistory,
                    currentPackagingVersion: versionPayload.currentPackagingVersion,
                    isDraft: true,
                    activeVersion: 'draft' // Ensure ACTIVE badge shows on draft
                },
                expectedRevision: video.packagingRevision
            });

            // Smart Cleanup: Delete removed images from storage IF they aren't in packaging history
            if (removedImages.length > 0) {
                const combinedPackagingHistory = updatedPackagingHistory;
                const currentImage = payload.customImage;

                removedImages.forEach(url => {
                    if (url && url.includes('firebasestorage.googleapis.com')) {
                        const isInUse = combinedPackagingHistory.some(v =>
                            v.configurationSnapshot?.coverImage === url ||
                            v.configurationSnapshot?.abTestVariants?.includes(url)
                        ) || currentImage === url;

                        if (!isInUse) {
                            console.log('[usePackagingActions] Safe Cleanup: Deleting unused file', url);
                            deleteImageFromStorage(url).catch(e => console.error(e));
                        }
                    }
                });
            }

            formState.updateSnapshotToCurrent();
            showToast('Saved as draft', 'success');
        } catch (error: unknown) {
            console.error('Failed to save video:', error);
            const err = error as Error;
            if (err?.message === 'VERSION_MISMATCH') {
                showToast('Data is out of sync. Please refresh the page.', 'error');
            } else {
                showToast('Failed to save video', 'error');
            }
        } finally {
            setSavingAction(null);
        }
    }, [user, currentChannel, video.id, buildSavePayload, versionState, updateVideo, formState, showToast, video.coverHistory, video.packagingRevision]);

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

        setSavingAction('version');
        try {
            const payload = buildSavePayload();
            let closingSnapshotId: string | null | undefined = null;

            let versionForSnapshot = versionState.activeVersion;

            // ... (rest of snapshot logic)
            // If we are in Draft mode, we need to find the "previous active version" to close its period.
            if (versionForSnapshot === 'draft' && versionState.packagingHistory.length > 0) {
                // Strategy 1: Find version with most recent active period start date
                const latestByDate = versionState.packagingHistory.reduce((best, current) => {
                    const currentStart = current.activePeriods?.reduce((max: number, p: ActivePeriod) =>
                        (p.startDate || 0) > (max || 0) ? (p.startDate || 0) : (max || 0)
                        , 0) || 0;

                    const bestStart = best?.activePeriods?.reduce((max: number, p: ActivePeriod) =>
                        (p.startDate || 0) > (max || 0) ? (p.startDate || 0) : (max || 0)
                        , 0) || 0;

                    return currentStart > bestStart ? current : best;
                }, null as typeof versionState.packagingHistory[0] | null);

                // Strategy 2: Fallback to max version number if no dates found
                if (latestByDate && (latestByDate.activePeriods?.length || 0) > 0) {
                    versionForSnapshot = latestByDate.versionNumber;
                } else {
                    const maxVersion = Math.max(...versionState.packagingHistory.map(v => v.versionNumber));
                    versionForSnapshot = maxVersion;
                }
            }

            // Request CSV snapshot - always offer to save current traffic state before versioning
            // Only proceed if we have a valid numeric version to snapshot against
            if (onRequestSnapshot && typeof versionForSnapshot === 'number') {
                // Returns string (snapshotId), null (skip), or undefined (cancel)
                closingSnapshotId = await onRequestSnapshot(versionForSnapshot);

                // If user cancelled the modal (undefined), stop everything
                if (closingSnapshotId === undefined) {
                    setSavingAction(null);
                    return;
                }
                // If returned null (Skip), we proceed with creation but closingSnapshotId remains null
            }

            // Create new version - this updates local state via reducer
            const { newVersion, updatedHistory: updatedPackagingHistory, currentPackagingVersion } = versionState.createVersion({
                title: payload.title,
                description: payload.description,
                tags: payload.tags,
                coverImage: formState.customImage || null,
                abTestTitles: abTesting.titles,
                abTestThumbnails: abTesting.thumbnails,
                abTestResults: abTesting.results,
                localizations: payload.localizations
            }, closingSnapshotId || null);

            // Prepare for cleanup: identify images removed from coverHistory
            const removedImages = (video.coverHistory || [])
                .filter(old => !payload.coverHistory.some(curr => curr.url === old.url))
                .map(item => item.url);

            // Update snapshot and show toast
            formState.updateSnapshotToCurrent();
            showToast(`Saved as v.${newVersion.versionNumber}`, 'success');

            // Save to Firestore in background
            updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    thumbnail: payload.customImage,
                    packagingHistory: updatedPackagingHistory,
                    currentPackagingVersion: currentPackagingVersion,
                    activeVersion: newVersion.versionNumber,
                    isDraft: false
                },
                expectedRevision: video.packagingRevision
            }).then(() => {
                // Smart Cleanup after successful server update
                if (removedImages.length > 0) {
                    removedImages.forEach(url => {
                        if (url && url.includes('firebasestorage.googleapis.com')) {
                            const isInUse = updatedPackagingHistory.some(v =>
                                v.configurationSnapshot?.coverImage === url ||
                                v.configurationSnapshot?.abTestVariants?.includes(url)
                            ) || payload.customImage === url;

                            if (!isInUse) {
                                console.log('[usePackagingActions] Safe Cleanup: Deleting unused file', url);
                                deleteImageFromStorage(url).catch(e => console.error(e));
                            }
                        }
                    });
                }
            }).catch(error => {
                console.error('Failed to create version:', error);
                if (error?.message === 'VERSION_MISMATCH') {
                    showToast('Data is out of sync. Please refresh the page.', 'error');
                } else {
                    showToast('Failed to save to server', 'error');
                }
            });
        } catch (error: unknown) {
            console.error('Failed to create version:', error);
            const err = error as Error;
            if (err?.message === 'VERSION_MISMATCH') {
                showToast('Data is out of sync. Please refresh the page.', 'error');
            } else {
                showToast('Failed to create version', 'error');
            }
        } finally {
            setSavingAction(null);
        }
    }, [user, currentChannel, video.id, buildSavePayload, versionState, updateVideo, formState, showToast, abTesting, onRequestSnapshot, video.coverHistory, video.packagingRevision]);

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

    const handleRestore = useCallback(async () => {
        if (versionState.viewingVersion !== 'draft' && typeof versionState.viewingVersion === 'number') {
            // Find closingSnapshotId to close current active period
            let closingSnapshotId: string | null = null;

            if (typeof versionState.activeVersion === 'number') {
                // PRIORITY 1: If onRequestSnapshot exists (for published videos), request CSV
                if (onRequestSnapshot) {
                    const snapshotResult = await onRequestSnapshot(versionState.activeVersion);

                    // If user cancelled (undefined), abort restore
                    if (snapshotResult === undefined) {
                        return;
                    }

                    closingSnapshotId = snapshotResult;
                }
                // PRIORITY 2: For unpublished videos, find latest snapshot of active version
                else if (trafficData?.snapshots) {
                    // Find snapshots for active version
                    const activeVersionSnapshots = trafficData.snapshots
                        .filter((s: TrafficSnapshot) => s.version === versionState.activeVersion)
                        .sort((a: TrafficSnapshot, b: TrafficSnapshot) => b.timestamp - a.timestamp); // Sort desc

                    // Take latest
                    if (activeVersionSnapshots.length > 0) {
                        closingSnapshotId = activeVersionSnapshots[0].id;
                    }
                }
            }

            versionState.restoreVersion(versionState.viewingVersion, closingSnapshotId);
            showToast(`Restored to v.${versionState.viewingVersion}`, 'success');
        }
    }, [versionState, showToast, onRequestSnapshot, trafficData]);

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
        } catch {
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
                    v.versionNumber === versionState.activeVersion && v.configurationSnapshot
                        ? {
                            ...v,
                            configurationSnapshot: {
                                ...v.configurationSnapshot,
                                abTestResults: newResults
                            }
                        }
                        : v
                ) as PackagingVersion[];
            }

            // 2. Perform Update to Firestore
            await updateVideo({
                videoId: video.id,
                updates: {
                    abTestResults: newResults,
                    packagingHistory: updatedHistory
                },
                expectedRevision: video.packagingRevision
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
    }, [user, currentChannel, video.id, video.packagingHistory, video.packagingRevision, versionState, updateVideo, formState, showToast]);

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
                updates: metadata,
                apiKey: generalSettings.apiKey, // Pass apiKey to enable fetch
                expectedRevision: video.packagingRevision
            });
        } catch (error) {
            console.error('Failed to auto-save metadata:', error);
            // Silent fail - don't show toast for auto-save
        }
    }, [user, currentChannel, video.id, video.packagingRevision, updateVideo, generalSettings.apiKey]);

    return {
        isSaving: savingAction === 'draft' || savingAction === 'version', // Backwards compatibility if needed, though we should prefer specific props
        isSavingDraft: savingAction === 'draft',
        isSavingNewVersion: savingAction === 'version',
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

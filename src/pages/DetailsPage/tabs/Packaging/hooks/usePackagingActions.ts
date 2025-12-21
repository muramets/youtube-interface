import { useState, useCallback } from 'react';
import { type VideoDetails, type CoverVersion } from '../../../../../utils/youtubeApi';
import { useUIStore } from '../../../../../stores/uiStore';
import { useVideos } from '../../../../../hooks/useVideos';
import { useAuth } from '../../../../../hooks/useAuth';
import { useChannelStore } from '../../../../../stores/channelStore';
import { ChannelService } from '../../../../../services/channelService';
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
}

export const usePackagingActions = ({
    video,
    versionState,
    localization,
    formState,
    abTesting
}: UsePackagingActionsProps) => {
    const { user } = useAuth();
    const { currentChannel, setCurrentChannel } = useChannelStore();
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

    const handleSaveAsNewVersion = useCallback(async () => {
        if (!user || !currentChannel || !video.id) return;
        setIsSaving(true);
        try {
            const payload = buildSavePayload();

            // Create new version in memory
            versionState.createVersion({
                title: payload.title,
                description: payload.description,
                tags: payload.tags,
                coverImage: formState.customImage || null,
                abTestTitles: abTesting.titles,
                abTestThumbnails: abTesting.thumbnails,
                abTestResults: abTesting.results,
                localizations: payload.localizations
            });

            const versionPayload = versionState.getVersionsPayload();
            const newVersionNum = versionPayload.packagingHistory.reduce((max, v) => v.versionNumber > max ? v.versionNumber : max, 1);

            await updateVideo({
                videoId: video.id,
                updates: {
                    ...payload,
                    packagingHistory: versionPayload.packagingHistory,
                    currentPackagingVersion: versionPayload.currentPackagingVersion,
                    isDraft: versionPayload.isDraft
                }
            });

            formState.updateSnapshotToCurrent();
            showToast(`Saved as v.${newVersionNum}`, 'success');
        } catch (error) {
            console.error('Failed to create version:', error);
            showToast('Failed to create version', 'error');
        } finally {
            setIsSaving(false);
        }
    }, [user, currentChannel, video.id, buildSavePayload, versionState, updateVideo, formState, showToast, abTesting]);

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
                cloneDurationSeconds: 24 * 60 * 60
            });
            showToast(`Cloned version v.${version.version}`, 'success');
        } catch {
            showToast('Failed to clone version', 'error');
        } finally {
            setCloningVersion(null);
        }
    }, [cloningVersion, cloneVideo, video, showToast]);

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

    return {
        isSaving,
        cloningVersion,
        handleSave,
        handleSaveAsNewVersion,
        handleCancel,
        handleCloneFromVersion,
        handleRestore,
        handleAddLanguage,
        handleDeleteCustomLanguage
    };
};

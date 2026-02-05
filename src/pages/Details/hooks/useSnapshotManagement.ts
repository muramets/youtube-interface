import { useCallback } from 'react';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import { TrafficService } from '../../../core/services/traffic';
import { parseTrafficCsv } from '../tabs/Traffic/utils/csvParser';
import { generateSnapshotId } from '../../../core/utils/snapshotUtils';
import { VersionService } from '../services/VersionService';
import type { User } from 'firebase/auth';
import type { Channel } from '../../../core/services/channelService';
import type { VersionState } from '../tabs/Packaging/types';
import type { TrafficHookState } from '../tabs/Traffic/hooks/useTrafficData';
import type { UseVideosResult } from '../../../core/hooks/useVideos';
import type { PackagingVersion } from '../../../core/types/versioning';

interface UseSnapshotManagementProps {
    video: VideoDetails;
    versions: VersionState;
    trafficState: TrafficHookState;
    user: User | null;
    currentChannel: Channel | null;
    updateVideo: UseVideosResult['updateVideo'];
    showToast: (message: string, type: 'success' | 'error') => void;
    setSelectedSnapshot: (id: string | null) => void;
    setActiveTab: (tab: 'packaging' | 'traffic') => void;
    selectedSnapshot: string | null;
    snapshotRequest: {
        isForCreateVersion: boolean;
        versionToRestore: number | null;
        resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
        versionNumber?: number;
        context?: 'create' | 'restore';
    };

    onOpenSnapshotRequest: (params: {
        versionToRestore: number | null;
        isForCreateVersion: boolean;
        resolveCallback?: ((snapshotId: string | null | undefined) => void) | null;
        versionNumber?: number;
        context?: 'create' | 'restore';
    }) => void;
    closeSnapshotModal: () => void;
}

/**
 * Хук для управления снапшотами трафика.
 * Извлекает логику из DetailsLayout для работы со снапшотами.
 */
export const useSnapshotManagement = ({
    video,
    versions,
    trafficState,
    user,
    currentChannel,
    updateVideo,
    showToast,
    setSelectedSnapshot,
    setActiveTab,
    selectedSnapshot,
    snapshotRequest,
    onOpenSnapshotRequest,
    closeSnapshotModal
}: UseSnapshotManagementProps) => {

    /**
     * Запрос снапшота при создании новой версии.
     * Возвращает Promise с snapshotId или null.
     */
    const handleRequestSnapshot = useCallback(async (versionNumber: number): Promise<string | null | undefined> => {
        // Skip snapshot request for the very first version (v.1)
        // or for unpublished videos (auto-clears traffic).
        if (versionNumber === 1 || !video.publishedVideoId) {
            console.log('[useSnapshotManagement] Skipping snapshot for v.1 or unpublished video');
            if (user?.uid && currentChannel?.id && video.id) {
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);
                await trafficState.refetch();
            }
            return null;
        }

        // Для опубликованных видео показываем modal
        // (Promise будет resolved через handleSnapshotUpload или handleSkipSnapshot)
        return new Promise<string | null | undefined>((resolve) => {
            onOpenSnapshotRequest({
                versionToRestore: null,
                isForCreateVersion: true,
                resolveCallback: (snapshotId) => resolve(snapshotId),
                versionNumber: versionNumber // Explicit version to prevent "v.draft"
            });
        });
    }, [video.publishedVideoId, video.id, user, currentChannel, trafficState, onOpenSnapshotRequest]);

    /**
     * Shared logic to restore a version references to a new snapshot
     */
    const performRestore = useCallback(async (snapshotId: string) => {
        if (!user || !currentChannel || !video.id) return;

        // RESTORE_VERSION: Use synchronized history from restoreVersion
        if (!snapshotRequest.versionToRestore) return;

        const { updatedHistory } = versions.restoreVersion(snapshotRequest.versionToRestore, snapshotId || null);

        // Get snapshot for field restoration
        const versionData = updatedHistory.find(
            (v: PackagingVersion) => v.versionNumber === snapshotRequest.versionToRestore
        );
        const snapshot = versionData?.configurationSnapshot;

        if (!snapshot) {
            showToast('Version data not found', 'error');
            return;
        }

        // Prepare restoration data using VersionService
        const restoreData = VersionService.prepareRestoreVersionData(
            snapshotRequest.versionToRestore,
            snapshot
        );

        // Save to Firestore with unified history
        await updateVideo({
            videoId: video.id,
            updates: {
                packagingHistory: updatedHistory,
                isDraft: false,
                activeVersion: snapshotRequest.versionToRestore,
                ...restoreData
            }
        });

        // FIX: Refresh traffic data to show the new snapshot in sidebar immediately
        await trafficState.refetch();

        closeSnapshotModal();
        showToast(snapshotId
            ? `Snapshot saved & restored to v.${snapshotRequest.versionToRestore}`
            : `Restored to v.${snapshotRequest.versionToRestore}`,
            'success'
        );
    }, [user, currentChannel, video.id, versions, snapshotRequest, showToast, updateVideo, trafficState, closeSnapshotModal]);

    /**
     * Обработчик загрузки снапшота из modal
     */
    const handleSnapshotUpload = useCallback(async (file: File) => {
        if (!user?.uid || !currentChannel?.id) return;

        try {
            // Парсим CSV
            const { sources, totalRow } = await parseTrafficCsv(file);
            const timestamp = Date.now();

            // Determine correct version number
            // 1. Prefer explicit versionNumber passed in request (handles Restore context correctly)
            // 2. Fallbck to activeVersion logic for Create context
            let versionNum = snapshotRequest.versionNumber;

            if (versionNum === undefined) {
                versionNum = snapshotRequest.isForCreateVersion
                    ? (versions.activeVersion === 'draft' ? 0 : (versions.activeVersion || 1)) + 1
                    : (versions.activeVersion as number);
            }

            // Ensure versionNum is a valid number
            if (typeof versionNum !== 'number') {
                console.error('[useSnapshotManagement] Invalid versionNum:', versionNum);
                return;
            }

            const snapshotId = generateSnapshotId(timestamp, versionNum);

            // Создаем снапшот
            await TrafficService.createVersionSnapshot(
                user.uid,
                currentChannel.id,
                video.id,
                versionNum,
                sources,
                totalRow,
                file
            );

            // Для CREATE_VERSION: очищаем текущие данные
            if (snapshotRequest.isForCreateVersion) {
                console.log('[useSnapshotManagement] Clearing traffic data for new version');
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);
                await trafficState.refetch();

                // Resolve callback
                snapshotRequest.resolveCallback?.(snapshotId);
                closeSnapshotModal();
                return;
            }

            // RESTORE_VERSION: Proceed to restore logic
            await performRestore(snapshotId);

        } catch (err) {
            console.error('Failed to save snapshot:', err);
            showToast('Failed to save snapshot', 'error');
        }
    }, [user, currentChannel, video.id, versions, snapshotRequest, showToast, trafficState, closeSnapshotModal, performRestore]);

    /**
     * Обработчик пропуска снапшота
     */
    const handleSkipSnapshot = useCallback(async () => {
        if (snapshotRequest.isForCreateVersion) {
            // CREATE_VERSION skips handled via resolveCallback(null)
            if (user?.uid && currentChannel?.id && video.id) {
                console.log('[useSnapshotManagement] handleSkipSnapshot -> clearing data for new version');
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);
                await trafficState.refetch();
            }

            snapshotRequest.resolveCallback?.(null);
            closeSnapshotModal();
            return;
        }

        // RESTORE_VERSION with skip: create snapshot from current data first
        if (!user?.uid || !currentChannel?.id || !snapshotRequest.versionToRestore) {
            snapshotRequest.resolveCallback?.(null);
            closeSnapshotModal();
            return;
        }

        try {
            const currentData = trafficState.trafficData;
            // First save current state as a snapshot before restoring
            // Create snapshot and get ID
            const newSnapshotId = await TrafficService.createVersionSnapshot(
                user.uid,
                currentChannel.id,
                video.id,
                versions.activeVersion as number,
                currentData?.sources || [],
                currentData?.totalRow
            );

            if (newSnapshotId) {
                await performRestore(newSnapshotId);
            }
        } catch (err) {
            console.error('Failed to create snapshot:', err);
            showToast('Failed to create snapshot', 'error');
        }
    }, [user, currentChannel, video.id, versions, trafficState, snapshotRequest, showToast, closeSnapshotModal, performRestore]);

    /**
     * Обработчик клика на снапшот в sidebar
     */
    const handleSnapshotClick = useCallback((snapshotId: string) => {
        setSelectedSnapshot(snapshotId);
        setActiveTab('traffic');
    }, [setSelectedSnapshot, setActiveTab]);

    /**
     * Обработчик удаления снапшота
     */
    // Granular dependencies for stability
    const trafficSnapshots = trafficState.trafficData?.snapshots;
    const deleteSnapshotHandler = trafficState.handleDeleteSnapshot;

    const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
        const isDeletingActive = selectedSnapshot === snapshotId;

        // Удаляем через trafficState
        await deleteSnapshotHandler(snapshotId);

        // Если удалили активный снапшот, переключаемся на предыдущий
        if (isDeletingActive) {
            const allSnapshots = trafficSnapshots || [];
            const sortedSnapshots = [...allSnapshots]
                .filter(s => s.id !== snapshotId)
                .sort((a, b) => b.timestamp - a.timestamp);

            if (sortedSnapshots.length > 0) {
                setSelectedSnapshot(sortedSnapshots[0].id);
            } else {
                setSelectedSnapshot(null);
                setActiveTab('traffic');
            }
        }
    }, [selectedSnapshot, trafficSnapshots, deleteSnapshotHandler, setSelectedSnapshot, setActiveTab]);

    return {
        handleRequestSnapshot,
        handleSnapshotUpload,
        handleSkipSnapshot,
        handleSnapshotClick,
        handleDeleteSnapshot
    };
};

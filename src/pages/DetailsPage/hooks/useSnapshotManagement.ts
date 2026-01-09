import { useCallback } from 'react';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import { TrafficService } from '../../../core/services/traffic';
import { parseTrafficCsv } from '../tabs/Traffic/utils/csvParser';
import { generateSnapshotId } from '../../../core/utils/snapshotUtils';
import { VersionService } from '../services/VersionService';

interface UseSnapshotManagementProps {
    video: VideoDetails;
    versions: any;
    trafficState: any;
    user: any;
    currentChannel: any;
    updateVideo: any;
    showToast: (message: string, type: 'success' | 'error') => void;
    setSelectedSnapshot: (id: string | null) => void;
    setActiveTab: (tab: 'packaging' | 'traffic') => void;
    selectedSnapshot: string | null;
    snapshotRequest: {
        isForCreateVersion: boolean;
        versionToRestore: number | null;
        resolveCallback: ((snapshotId: string | null | undefined) => void) | null;
    };
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
    closeSnapshotModal
}: UseSnapshotManagementProps) => {

    /**
     * Запрос снапшота при создании новой версии.
     * Возвращает Promise с snapshotId или null.
     */
    const handleRequestSnapshot = useCallback(async (_versionNumber: number): Promise<string | null | undefined> => {
        // Для неопубликованных видео пропускаем modal, но очищаем traffic
        if (!video.publishedVideoId) {
            console.log('[useSnapshotManagement] Video unpublished, auto-skipping snapshot and clearing traffic');
            if (user?.uid && currentChannel?.id && video.id) {
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);
                await trafficState.refetch();
            }
            return null;
        }

        // Для опубликованных видео показываем modal
        // (Promise будет resolved через handleSnapshotUpload или handleSkipSnapshot)
        return new Promise<string | null | undefined>((_resolve) => {
            // Этот callback будет вызван из родительского компонента
            // через openSnapshotRequest с resolveCallback
        });
    }, [video.publishedVideoId, video.id, user, currentChannel, trafficState]);

    /**
     * Обработчик загрузки снапшота из modal
     */
    const handleSnapshotUpload = useCallback(async (file: File) => {
        if (!user?.uid || !currentChannel?.id) return;

        try {
            // Парсим CSV
            const { sources, totalRow } = await parseTrafficCsv(file);
            const timestamp = Date.now();
            const versionNum = snapshotRequest.isForCreateVersion
                ? (versions.activeVersion === 'draft' ? 0 : (versions.activeVersion || 1)) + 1
                : (versions.activeVersion as number);

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

            // Для RESTORE_VERSION: восстанавливаем версию
            if (!snapshotRequest.versionToRestore) return;

            versions.restoreVersion(snapshotRequest.versionToRestore, snapshotId);

            // Получаем snapshot для восстановления данных
            const versionData = versions.packagingHistory.find(
                (v: any) => v.versionNumber === snapshotRequest.versionToRestore
            );
            const snapshot = versionData?.configurationSnapshot;

            if (!snapshot) {
                showToast('Version data not found', 'error');
                return;
            }

            // Обновляем историю
            const updatedHistory = versions.packagingHistory.map((v: any) =>
                v.versionNumber === snapshotRequest.versionToRestore
                    ? { ...v, endDate: Date.now() }
                    : v
            );

            // Используем VersionService для подготовки данных восстановления
            const restoreData = VersionService.prepareRestoreVersionData(
                snapshotRequest.versionToRestore,
                snapshot
            );

            // Сохраняем в Firestore
            await updateVideo({
                videoId: video.id,
                updates: {
                    packagingHistory: updatedHistory,
                    isDraft: false,
                    ...restoreData
                }
            });

            closeSnapshotModal();
            showToast(`Snapshot saved & restored to v.${snapshotRequest.versionToRestore}`, 'success');
        } catch (err) {
            console.error('Failed to save snapshot:', err);
            showToast('Failed to save snapshot', 'error');
        }
    }, [user, currentChannel, video.id, versions, snapshotRequest, showToast, updateVideo, trafficState, closeSnapshotModal]);

    /**
     * Обработчик пропуска снапшота
     */
    const handleSkipSnapshot = useCallback(async () => {
        if (snapshotRequest.isForCreateVersion) {
            // Для CREATE_VERSION: очищаем данные даже если пропустили
            if (user?.uid && currentChannel?.id && video.id) {
                console.log('[useSnapshotManagement] handleSkipSnapshot -> clearing data for new version');
                await TrafficService.clearCurrentTrafficData(user.uid, currentChannel.id, video.id);
                await trafficState.refetch();
            }

            // Resolve с null (пропущено)
            snapshotRequest.resolveCallback?.(null);
            closeSnapshotModal();
            return;
        }

        // Для RESTORE_VERSION: используем текущие данные как снапшот
        if (!user?.uid || !currentChannel?.id || !snapshotRequest.versionToRestore) {
            snapshotRequest.resolveCallback?.(null);
            closeSnapshotModal();
            return;
        }

        try {
            const currentData = trafficState.trafficData;
            await TrafficService.createVersionSnapshot(
                user.uid,
                currentChannel.id,
                video.id,
                versions.activeVersion as number,
                currentData?.sources || [],
                currentData?.totalRow
            );

            versions.restoreVersion(snapshotRequest.versionToRestore);

            const versionData = versions.packagingHistory.find(
                (v: any) => v.versionNumber === snapshotRequest.versionToRestore
            );
            const snapshot = versionData?.configurationSnapshot;

            if (!snapshot) {
                showToast('Version data not found', 'error');
                return;
            }

            const updatedHistory = versions.packagingHistory.map((v: any) =>
                v.versionNumber === snapshotRequest.versionToRestore
                    ? { ...v, endDate: Date.now() }
                    : v
            );

            const restoreData = VersionService.prepareRestoreVersionData(
                snapshotRequest.versionToRestore,
                snapshot
            );

            await updateVideo({
                videoId: video.id,
                updates: {
                    packagingHistory: updatedHistory,
                    isDraft: false,
                    ...restoreData
                }
            });

            closeSnapshotModal();
            showToast(`Restored to v.${snapshotRequest.versionToRestore}`, 'success');
        } catch (err) {
            console.error('Failed to create snapshot:', err);
            showToast('Failed to create snapshot', 'error');
        }
    }, [user, currentChannel, video.id, versions, trafficState, snapshotRequest, showToast, updateVideo, closeSnapshotModal]);

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
    const handleDeleteSnapshot = useCallback(async (snapshotId: string) => {
        const isDeletingActive = selectedSnapshot === snapshotId;

        // Удаляем через trafficState
        await trafficState.handleDeleteSnapshot(snapshotId);

        // Если удалили активный снапшот, переключаемся на предыдущий
        if (isDeletingActive) {
            const allSnapshots = trafficState.trafficData?.snapshots || [];
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
    }, [selectedSnapshot, trafficState, setSelectedSnapshot, setActiveTab]);

    return {
        handleRequestSnapshot,
        handleSnapshotUpload,
        handleSkipSnapshot,
        handleSnapshotClick,
        handleDeleteSnapshot
    };
};

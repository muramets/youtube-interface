import { useCallback } from 'react';
import type { VideoDetails } from '../../../core/utils/youtubeApi';
import { VersionService } from '../services/VersionService';

interface UseVersionManagementProps {
    versions: any; // usePackagingVersions return type
    isFormDirty: boolean;
    video: VideoDetails;
    user: any;
    currentChannel: any;
    updateVideo: any;
    showToast: (message: string, type: 'success' | 'error') => void;
    setSelectedSnapshot: (id: string | null) => void;
    activeTab: 'packaging' | 'traffic';
    selectedSnapshot: string | null;
    onOpenSwitchConfirm: (targetVersion: number | 'draft') => void;
    onOpenDeleteConfirm: (versionNumber: number) => void;
    onOpenSnapshotRequest: (params: { versionToRestore: number; isForCreateVersion: boolean }) => void;
}

/**
 * Хук для управления версиями (переключение, удаление, восстановление).
 * Извлекает бизнес-логику из DetailsLayout.
 */
export const useVersionManagement = ({
    versions,
    isFormDirty,
    video,
    user,
    currentChannel,
    updateVideo,
    showToast,
    setSelectedSnapshot,
    activeTab,
    selectedSnapshot,
    onOpenSwitchConfirm,
    onOpenDeleteConfirm,
    onOpenSnapshotRequest
}: UseVersionManagementProps) => {

    /**
     * Обработчик клика на версию в sidebar
     */
    const handleVersionClick = useCallback((versionNumber: number | 'draft') => {
        // Разрешаем кликать на текущую версию для очистки selected snapshot
        if (versionNumber === versions.viewingVersion) {
            if (activeTab === 'traffic' && selectedSnapshot) {
                setSelectedSnapshot(null);
            }
            return;
        }

        if (isFormDirty) {
            // Если есть несохраненные изменения → показываем confirmation
            onOpenSwitchConfirm(versionNumber);
        } else {
            // Очищаем selected snapshot
            setSelectedSnapshot(null);
            // Переключаем версию
            versions.switchToVersion(versionNumber);
        }
    }, [versions, isFormDirty, activeTab, selectedSnapshot, setSelectedSnapshot, onOpenSwitchConfirm]);

    /**
     * Подтверждение переключения версии (после discard changes)
     */
    const confirmSwitch = useCallback((targetVersion: number | 'draft') => {
        setSelectedSnapshot(null);
        versions.switchToVersion(targetVersion);
    }, [versions, setSelectedSnapshot]);

    /**
     * Обработчик удаления версии
     */
    const handleDeleteVersion = useCallback((versionNumber: number) => {
        onOpenDeleteConfirm(versionNumber);
    }, [onOpenDeleteConfirm]);

    /**
     * Подтверждение удаления версии
     */
    const confirmDelete = useCallback(async (versionNumber: number) => {
        // Используем VersionService для расчета данных
        const deleteData = VersionService.calculateDeleteVersionData(
            versionNumber,
            versions.packagingHistory,
            versions.activeVersion
        );

        // Мгновенное обновление UI
        versions.deleteVersion(versionNumber);
        versions.setCurrentVersionNumber(deleteData.newCurrentVersion);
        versions.setHasDraft(deleteData.willHaveDraft);

        showToast(`Version ${versionNumber} deleted`, 'success');

        // Сохранение в Firestore
        if (user?.uid && currentChannel?.id && video.id) {
            updateVideo({
                videoId: video.id,
                updates: {
                    ...deleteData.rollbackUpdates,
                    packagingHistory: deleteData.updatedHistory,
                    currentPackagingVersion: deleteData.newCurrentVersion,
                    isDraft: deleteData.willHaveDraft
                }
            }).catch((error: Error) => {
                console.error('Failed to save deletion to Firestore:', error);
                showToast('Failed to save deletion', 'error');
            });
        }
    }, [versions, video, user, currentChannel, updateVideo, showToast]);

    /**
     * Обработчик восстановления версии
     */
    const handleRestoreVersion = useCallback(async (versionToRestore: number) => {
        const isPublished = !!video.publishedVideoId;

        if (isPublished) {
            // Для опубликованных видео показываем snapshot modal
            onOpenSnapshotRequest({ versionToRestore, isForCreateVersion: false });
        } else {
            // Для неопубликованных восстанавливаем напрямую
            versions.restoreVersion(versionToRestore);

            if (user?.uid && currentChannel?.id && video.id) {
                try {
                    const versionData = versions.packagingHistory.find(
                        (v: any) => v.versionNumber === versionToRestore
                    );
                    const snapshot = versionData?.configurationSnapshot;

                    if (!snapshot) {
                        showToast('Version data not found', 'error');
                        return;
                    }

                    const updatedHistory = versions.packagingHistory.map((v: any) =>
                        v.versionNumber === versionToRestore
                            ? { ...v, endDate: Date.now() }
                            : v
                    );

                    const restoreData = VersionService.prepareRestoreVersionData(
                        versionToRestore,
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

                    showToast(`Restored to v.${versionToRestore}`, 'success');
                } catch (error) {
                    console.error('Failed to save restoration to Firestore:', error);
                    showToast('Failed to save restoration', 'error');
                }
            }
        }
    }, [video, versions, user, currentChannel, updateVideo, showToast, onOpenSnapshotRequest]);

    return {
        handleVersionClick,
        confirmSwitch,
        handleDeleteVersion,
        confirmDelete,
        handleRestoreVersion
    };
};

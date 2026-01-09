import type { VideoDetails, PackagingVersion } from '../../../core/utils/youtubeApi';

/**
 * Сервис для работы с версиями packaging.
 * Содержит общую бизнес-логику, используемую в нескольких местах.
 */
export const VersionService = {
    /**
     * Вычисляет, есть ли draft (изменения относительно последней сохраненной версии).
     * 
     * Логика:
     * - Если нет версий → draft существует (новое видео)
     * - Если есть версии → сравниваем текущие данные с последней версией
     * 
     * @param video - Текущие данные видео
     * @param packagingHistory - История версий
     * @returns true если есть несохраненные изменения
     */
    computeDraftState(
        video: VideoDetails,
        packagingHistory: PackagingVersion[]
    ): boolean {
        // Если нет версий, мы в состоянии "draft v.1"
        if (packagingHistory.length === 0) return true;

        // Находим последнюю версию
        const latestVersion = packagingHistory.reduce((max, v) =>
            v.versionNumber > max.versionNumber ? v : max, packagingHistory[0]);

        const snapshot = latestVersion.configurationSnapshot;
        if (!snapshot) return true; // Если нет snapshot, считаем draft

        // Сравниваем текущие данные видео с последней версией
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
    },

    /**
     * Рассчитывает данные для удаления версии.
     * 
     * @param versionToDelete - Номер версии для удаления
     * @param packagingHistory - Текущая история версий
     * @param activeVersion - Текущая активная версия
     * @returns Обновленные данные после удаления
     */
    calculateDeleteVersionData(
        versionToDelete: number,
        packagingHistory: PackagingVersion[],
        activeVersion: number | 'draft'
    ): {
        updatedHistory: PackagingVersion[];
        newCurrentVersion: number;
        rollbackUpdates: Partial<VideoDetails>;
        willHaveDraft: boolean;
    } {
        const isActiveDeleted = activeVersion === versionToDelete;

        // Фильтруем историю
        const updatedHistory = packagingHistory.filter(
            v => v.versionNumber !== versionToDelete
        );

        // Вычисляем новую текущую версию
        const newCurrentVersion = updatedHistory.length === 0
            ? 1
            : Math.max(...updatedHistory.map(v => v.versionNumber)) + 1;

        // Если удалили активную версию, откатываем данные к предыдущей
        let rollbackUpdates: Partial<VideoDetails> = {};
        if (isActiveDeleted && updatedHistory.length > 0) {
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

        return {
            updatedHistory,
            newCurrentVersion,
            rollbackUpdates,
            willHaveDraft
        };
    },

    /**
     * Унифицированная логика восстановления версии.
     * Используется в 3 местах: handleRestoreVersion, handleSnapshotUpload, handleSkipSnapshot.
     * 
     * @param params - Параметры восстановления
     * @returns Данные для обновления видео
     */
    prepareRestoreVersionData(
        versionNumber: number,
        snapshot: PackagingVersion['configurationSnapshot']
    ): Partial<VideoDetails> {
        if (!snapshot) {
            throw new Error('Snapshot is required for restore operation');
        }
        return {
            title: snapshot.title,
            description: snapshot.description,
            tags: snapshot.tags,
            customImage: snapshot.coverImage || '',
            thumbnail: snapshot.coverImage || '',
            abTestTitles: snapshot.abTestTitles || [],
            abTestThumbnails: snapshot.abTestThumbnails || [],
            abTestResults: snapshot.abTestResults || { titles: [], thumbnails: [] },
            localizations: snapshot.localizations || {},
            activeVersion: versionNumber
        };
    }
};

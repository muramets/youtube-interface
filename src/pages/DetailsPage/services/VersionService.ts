import type { VideoDetails } from '../../../core/utils/youtubeApi';
import type { PackagingVersion } from '../../../core/types/versioning';

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
        versionsToDelete: number[],
        packagingHistory: PackagingVersion[],
        activeVersion: number | 'draft'
    ): {
        updatedHistory: PackagingVersion[];
        newCurrentVersion: number;
        rollbackUpdates: Partial<VideoDetails>;
        willHaveDraft: boolean;
        newActiveVersion?: number;
    } {
        const isActiveDeleted = typeof activeVersion === 'number' && versionsToDelete.includes(activeVersion);

        // Фильтруем историю
        const remaining = packagingHistory.filter(
            v => !versionsToDelete.includes(v.versionNumber)
        );

        // Determine the new active version after deletion
        let newActive: number | 'draft' = 'draft';
        if (isActiveDeleted && remaining.length > 0) {
            // Find the version that was active most recently (based on endDate of its latest period)
            const sortedByRecency = [...remaining].sort((a, b) => {
                const aEnd = a.activePeriods?.[0]?.endDate || a.endDate || 0;
                const bEnd = b.activePeriods?.[0]?.endDate || b.endDate || 0;
                return bEnd - aEnd;
            });
            newActive = sortedByRecency[0].versionNumber;
        } else if (!isActiveDeleted) {
            newActive = activeVersion;
        }

        // Sanitize history and manage active periods
        const updatedHistory = remaining.map(v => {
            if (v.versionNumber === newActive && typeof newActive === 'number') {
                return VersionService.addNewActivePeriod(VersionService.closeAllPeriods(v));
            }
            return VersionService.closeAllPeriods(v);
        });


        // Вычисляем новую текущую версию
        const newCurrentVersion = updatedHistory.length === 0
            ? 1
            : Math.max(...updatedHistory.map(v => v.versionNumber)) + 1;

        // Если удалили активную версию, откатываем данные к предыдущей
        let rollbackUpdates: Partial<VideoDetails> = {};
        let newActiveVersion: number | undefined;

        if (isActiveDeleted && updatedHistory.length > 0) {
            // Reuse the recency-based logic from above for rollback determination
            const sortedByRecency = [...remaining].sort((a, b) => {
                const aEnd = a.activePeriods?.[0]?.endDate || a.endDate || 0;
                const bEnd = b.activePeriods?.[0]?.endDate || b.endDate || 0;
                return bEnd - aEnd;
            });
            const latestRemaining = updatedHistory.find(v => v.versionNumber === sortedByRecency[0].versionNumber) || updatedHistory[0];

            newActiveVersion = latestRemaining.versionNumber;

            const snapshot = latestRemaining.configurationSnapshot;
            if (snapshot) {
                rollbackUpdates = {
                    title: snapshot.title || '',
                    description: snapshot.description || '',
                    tags: snapshot.tags || [],
                    customImage: snapshot.coverImage || '',
                    thumbnail: snapshot.coverImage || '',
                    abTestTitles: snapshot.abTestTitles || [],
                    abTestThumbnails: snapshot.abTestThumbnails || [],
                    abTestResults: snapshot.abTestResults || { titles: [], thumbnails: [] },
                    localizations: snapshot.localizations || {},
                    activeVersion: newActiveVersion // IMPORTANT: Persist the new active version
                };
            }
        } else if (!isActiveDeleted) {
            // If we didn't delete the active version, keep the current active version
            newActiveVersion = typeof activeVersion === 'number' ? activeVersion : undefined;
        }

        const willHaveDraft = updatedHistory.length === 0;

        return {
            updatedHistory,
            newCurrentVersion,
            rollbackUpdates,
            willHaveDraft,
            newActiveVersion
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
    },

    /**
     * BUSINESS LOGIC: Period Management Helpers
     */
    ensureActivePeriods(version: PackagingVersion): PackagingVersion {
        const rawPeriods = (version.activePeriods && version.activePeriods.length > 0)
            ? version.activePeriods
            : [{
                startDate: version.startDate,
                endDate: (version.endDate === undefined || version.endDate === null) ? null : version.endDate,
                closingSnapshotId: null
            }];

        const sanitizedPeriods = rawPeriods.map(p => ({
            ...p,
            endDate: (p.endDate === undefined || p.endDate === null) ? null : p.endDate,
            closingSnapshotId: (p.closingSnapshotId === undefined || p.closingSnapshotId === null) ? null : p.closingSnapshotId
        }));

        return {
            ...version,
            endDate: (version.endDate === undefined || version.endDate === null) ? null : version.endDate,
            activePeriods: sanitizedPeriods
        };
    },

    closeAllPeriods(version: PackagingVersion, closingSnapshotId?: string | null): PackagingVersion {
        const now = Date.now();
        const versionWithPeriods = VersionService.ensureActivePeriods(version);
        const periods = versionWithPeriods.activePeriods!;

        const hasOpen = periods.some(p => p.endDate === null || p.endDate === undefined);
        if (!hasOpen) return versionWithPeriods;

        const updatedPeriods = periods.map(p =>
            (p.endDate === null || p.endDate === undefined)
                ? { ...p, endDate: now, closingSnapshotId: closingSnapshotId || null }
                : p
        );

        return {
            ...versionWithPeriods,
            endDate: now,
            activePeriods: updatedPeriods
        };
    },

    addNewActivePeriod(version: PackagingVersion): PackagingVersion {
        const now = Date.now();
        const versionWithPeriods = VersionService.ensureActivePeriods(version);
        const periods = versionWithPeriods.activePeriods!;

        const newPeriod = {
            startDate: now,
            endDate: null,
            closingSnapshotId: null
        };

        return {
            ...versionWithPeriods,
            startDate: now,
            endDate: null,
            activePeriods: [newPeriod, ...periods]
        };
    }
};


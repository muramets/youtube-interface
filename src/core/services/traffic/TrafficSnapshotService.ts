import type { TrafficData, TrafficSource, TrafficSnapshot } from '../../types/traffic';
import { generateSnapshotId } from '../../utils/snapshotUtils';
import { uploadCsvSnapshot, downloadCsvSnapshot, deleteCsvSnapshot } from '../storageService';
import { TrafficDataService } from './TrafficDataService';
import { logger } from '../../utils/logger';

/**
 * Сервис для управления снапшотами трафика.
 * Использует гибридное хранилище: метаданные в Firestore, CSV в Cloud Storage.
 */
export const TrafficSnapshotService = {
    /**
     * Создает снапшот версии с ГИБРИДНЫМ ХРАНИЛИЩЕМ.
     */
    async create(
        userId: string,
        channelId: string,
        videoId: string,
        version: number,
        sources: TrafficSource[],
        totalRow?: TrafficSource,
        csvFile?: File
    ): Promise<string> {
        const currentData = await TrafficDataService.fetch(userId, channelId, videoId);
        const timestamp = Date.now();
        const snapshotId = generateSnapshotId(timestamp, version);

        // Вычисляем сводную статистику
        const totalViews = sources.reduce((sum, s) => sum + (s.views || 0), 0);
        const totalWatchTime = sources.reduce((sum, s) => sum + (s.watchTimeHours || 0), 0);
        const topSource = sources.reduce((max, s) =>
            (s.views || 0) > (max.views || 0) ? s : max,
            sources[0]
        );

        let storagePath: string | undefined;

        if (csvFile) {
            try {
                const uploadResult = await uploadCsvSnapshot(
                    userId,
                    channelId,
                    videoId,
                    snapshotId,
                    csvFile
                );
                storagePath = uploadResult.storagePath;
            } catch (error) {
                logger.error('Failed to upload CSV to Storage', {
                    component: 'TrafficSnapshotService',
                    snapshotId,
                    error
                });
                throw new Error('FAILED_TO_UPLOAD_SNAPSHOT');
            }
        } else {
            // If no CSV file provided, we cannot create a valid snapshot in the new system
            logger.error('No CSV file provided for snapshot', {
                component: 'TrafficSnapshotService',
                snapshotId
            });
            throw new Error('CSV_FILE_REQUIRED');
        }

        // Создаем метаданные снапшота
        const snapshot: TrafficSnapshot = {
            id: snapshotId,
            version,
            timestamp,
            createdAt: new Date().toISOString(),

            // Поля гибридного хранилища
            storagePath,
            summary: {
                totalViews,
                totalWatchTime,
                sourcesCount: sources.length,
                topSource: topSource?.sourceTitle
            }
            // LEGACY REMOVED: No longer saving sources/totalRow to Firestore
        };

        const updated: TrafficData = {
            lastUpdated: Date.now(),
            sources: sources, // Обновляем sources до последних
            groups: currentData?.groups || [],
            totalRow: totalRow || currentData?.totalRow,
            snapshots: [...(currentData?.snapshots || []), snapshot]
        };

        await TrafficDataService.save(userId, channelId, videoId, updated);

        logger.info('Traffic snapshot created', {
            component: 'TrafficSnapshotService',
            snapshotId,
            version,
            hasStoragePath: !!storagePath,
            sourcesCount: sources.length
        });

        return snapshotId;
    },

    /**
     * Получает sources для конкретной исторической версии из снапшота.
     * 
     * ГИБРИДНОЕ ХРАНИЛИЩЕ:
     * - Загружает CSV из Storage и парсит
     */
    async getVersionSources(
        version: number,
        snapshots: TrafficSnapshot[],
        periodStart?: number,
        periodEnd?: number | null
    ): Promise<{ sources: TrafficSource[]; totalRow?: TrafficSource }> {
        // Находим снапшоты для этой версии
        let versionSnapshots = snapshots.filter(s => s.version === version);

        // Если указан временной диапазон (для Restored версий), 
        // берем ПОСЛЕДНИЙ (LIFO) снапшот внутри этого диапазона
        if (periodStart !== undefined) {
            versionSnapshots = versionSnapshots.filter(s => {
                // Add 5s buffer to start and end as well to handle millisecond-level offsets between client events
                const matchesStart = s.timestamp >= (periodStart - 5000);
                const matchesEnd = periodEnd ? s.timestamp <= (periodEnd + 5000) : true;

                return matchesStart && matchesEnd;
            });
        }

        // Берем самый свежий из подходящих
        const snapshot = versionSnapshots[versionSnapshots.length - 1];

        if (!snapshot) return { sources: [] };

        // LEGACY REMOVED: Removed check for snapshot.sources (Firestore storage)

        // Гибрид: sources в Cloud Storage
        if (snapshot.storagePath) {
            try {
                const { parseTrafficCsv } = await import('../../../pages/DetailsPage/tabs/Traffic/utils/csvParser');

                const blob = await downloadCsvSnapshot(snapshot.storagePath);
                const file = new File([blob], 'snapshot.csv', { type: 'text/csv' });
                const { sources, totalRow } = await parseTrafficCsv(file);

                return { sources, totalRow };
            } catch (error) {
                logger.error('Failed to load snapshot from Storage', {
                    component: 'TrafficSnapshotService',
                    snapshotId: snapshot.id,
                    storagePath: snapshot.storagePath,
                    error
                });
                return { sources: [] };
            }
        }

        logger.warn('Snapshot missing storagePath', {
            component: 'TrafficSnapshotService',
            snapshotId: snapshot.id,
            version
        });

        return { sources: [] };
    },

    /**
     * Удаляет последний снапшот трафика.
     * Реализует стратегию "UNDO": откатывает данные к предыдущему снапшоту.
     * 
     * NOTE: UI позволяет удалять только последний снапшот (см. TrafficNav.tsx L240)
     */
    async delete(
        userId: string,
        channelId: string,
        videoId: string,
        snapshotId: string
    ): Promise<void> {
        // 1. Получаем текущие данные
        const currentData = await TrafficDataService.fetch(userId, channelId, videoId);
        if (!currentData) return;

        // 2. Находим снапшот для удаления
        const snapshotIndex = currentData.snapshots.findIndex(s => s.id === snapshotId);
        if (snapshotIndex === -1) return;

        const snapshot = currentData.snapshots[snapshotIndex];

        // 3. Удаляем CSV из Cloud Storage (если существует)
        if (snapshot.storagePath) {
            try {
                await deleteCsvSnapshot(snapshot.storagePath);
            } catch (error) {
                console.error('Failed to delete CSV from Storage:', error);
                // Продолжаем удаление из Firestore даже если удаление из Storage не удалось
            }
        }

        // 4. UNDO: Откатываемся к предыдущему снапшоту
        const previousSnapshot = currentData.snapshots[snapshotIndex - 1];
        let updated: TrafficData;

        if (previousSnapshot) {
            // Откатываемся к данным предыдущего снапшота
            const { sources: prevSources, totalRow: prevTotalRow } = await this.getVersionSources(previousSnapshot.version, currentData.snapshots);

            updated = {
                ...currentData,
                lastUpdated: previousSnapshot.timestamp,
                sources: prevSources,
                totalRow: prevTotalRow,
                snapshots: currentData.snapshots.filter(s => s.id !== snapshotId)
            };
        } else {
            // Нет предыдущего снапшота -> Сбрасываем в пустое состояние
            updated = {
                ...currentData,
                lastUpdated: Date.now(),
                sources: [],
                totalRow: undefined,
                snapshots: []
            };
        }

        await TrafficDataService.save(userId, channelId, videoId, updated);
    }
};

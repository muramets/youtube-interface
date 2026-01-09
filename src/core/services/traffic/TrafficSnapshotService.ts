import type { TrafficData, TrafficSource, TrafficSnapshot } from '../../types/traffic';
import { generateSnapshotId } from '../../utils/snapshotUtils';
import { uploadCsvSnapshot, downloadCsvSnapshot, deleteCsvSnapshot } from '../storageService';
import { TrafficDataService } from './TrafficDataService';

/**
 * Сервис для управления снапшотами трафика.
 * Использует гибридное хранилище: метаданные в Firestore, CSV в Cloud Storage.
 */
export const TrafficSnapshotService = {
    /**
     * Создает снапшот версии с ГИБРИДНЫМ ХРАНИЛИЩЕМ.
     * 
     * ГИБРИДНЫЙ ПОДХОД:
     * 1. Загружает CSV файл в Cloud Storage
     * 2. Вычисляет сводную статистику
     * 3. Сохраняет метаданные + сводку в Firestore (НЕ полные sources)
     * 
     * Преимущества:
     * - Нет лимита Firestore в 1MB на документ
     * - Быстрые запросы (только метаданные)
     * - Дешевле хранение
     * - Оригинальный CSV сохранен
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

        // Загружаем CSV в Cloud Storage если файл предоставлен
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
                console.error('Failed to upload CSV to Storage:', error);
                // Продолжаем без storage path (сохраним sources в Firestore как fallback)
            }
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
            },

            // Legacy: включаем sources только если загрузка CSV не удалась
            ...(storagePath ? {} : { sources, totalRow })
        };

        const updated: TrafficData = {
            lastUpdated: Date.now(),
            sources: sources, // Обновляем sources до последних
            groups: currentData?.groups || [],
            totalRow: totalRow || currentData?.totalRow,
            snapshots: [...(currentData?.snapshots || []), snapshot]
        };

        await TrafficDataService.save(userId, channelId, videoId, updated);
        return snapshotId;
    },

    /**
     * Получает sources для конкретной исторической версии из снапшота.
     * 
     * ГИБРИДНОЕ ХРАНИЛИЩЕ:
     * - Если у снапшота есть storagePath: загружает CSV из Storage и парсит
     * - Если у снапшота есть sources: возвращает напрямую (legacy)
     */
    async getVersionSources(
        version: number,
        snapshots: TrafficSnapshot[]
    ): Promise<TrafficSource[]> {
        // Находим ВСЕ снапшоты для этой версии и берем ПОСЛЕДНИЙ (самый свежий)
        const versionSnapshots = snapshots.filter(s => s.version === version);
        const snapshot = versionSnapshots[versionSnapshots.length - 1];

        if (!snapshot) return [];

        // Legacy: sources хранятся в Firestore
        if (snapshot.sources) {
            return snapshot.sources;
        }

        // Гибрид: sources в Cloud Storage
        if (snapshot.storagePath) {
            try {
                const { parseTrafficCsv } = await import('../../../pages/DetailsPage/tabs/Traffic/utils/csvParser');

                const blob = await downloadCsvSnapshot(snapshot.storagePath);
                const file = new File([blob], 'snapshot.csv', { type: 'text/csv' });
                const { sources } = await parseTrafficCsv(file);

                return sources;
            } catch (error) {
                console.error('Failed to load snapshot from Storage:', error);
                return [];
            }
        }

        return [];
    },

    /**
     * Удаляет снапшот трафика.
     * Реализует стратегию "Undo":
     * - Если удаляется ПОСЛЕДНИЙ снапшот -> Откатывает основные данные к предыдущему снапшоту
     * - Если удаляется ИСТОРИЧЕСКИЙ снапшот -> Просто удаляет запись (данные остаются текущими)
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
        const isLatest = snapshotIndex === currentData.snapshots.length - 1;

        // 3. Удаляем CSV из Cloud Storage (если существует)
        if (snapshot.storagePath) {
            try {
                await deleteCsvSnapshot(snapshot.storagePath);
            } catch (error) {
                console.error('Failed to delete CSV from Storage:', error);
                // Продолжаем удаление из Firestore даже если удаление из Storage не удалось
            }
        }

        // 4. Подготавливаем обновленные данные
        let updated: TrafficData;

        if (isLatest) {
            // СТРАТЕГИЯ UNDO: Откатываемся к предыдущему снапшоту
            const previousSnapshot = currentData.snapshots[snapshotIndex - 1];

            if (previousSnapshot) {
                // Откатываемся к данным предыдущего снапшота
                const prevSources = await this.getVersionSources(previousSnapshot.version, currentData.snapshots);

                updated = {
                    ...currentData,
                    lastUpdated: previousSnapshot.timestamp,
                    sources: prevSources,
                    totalRow: previousSnapshot.totalRow,
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
        } else {
            // СТРАТЕГИЯ PRUNING: Просто удаляем запись, оставляем текущие данные
            updated = {
                ...currentData,
                snapshots: currentData.snapshots.filter(s => s.id !== snapshotId)
            };
        }

        await TrafficDataService.save(userId, channelId, videoId, updated);
    }
};

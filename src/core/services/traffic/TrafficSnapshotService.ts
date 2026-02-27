import type { TrafficData, TrafficSource, TrafficSnapshot } from '../../types/traffic';
import { generateSnapshotId } from '../../utils/snapshotUtils';
import { uploadCsvSnapshot, downloadCsvSnapshot, deleteCsvSnapshot } from '../storageService';
import { TrafficDataService } from './TrafficDataService';
import { logger, snapshotLogger } from '../../utils/logger';

/**
 * Сервис для управления снапшотами трафика.
 * Архитектура:
 * - Метаданные (размер < 1MB) -> Firestore
 * - Полные данные (CSV) -> Cloud Storage
 */
export const TrafficSnapshotService = {
    /**
     * Создает снапшот версии.
     * Обязательно загружает CSV в Cloud Storage.
     */
    async create(
        userId: string,
        channelId: string,
        videoId: string,
        version: number,
        sources: TrafficSource[],
        totalRow?: TrafficSource,
        csvFile?: File,
        publishDate?: number
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
                topSource: topSource?.sourceTitle,
                // Cache totalRow metrics for delta calculations
                totalImpressions: totalRow?.impressions,
                totalCtr: totalRow?.ctr
            },

            // Auto-calculate active period:
            // start = previous snapshot's timestamp (any version) OR publishDate OR this timestamp
            // end = this snapshot's timestamp
            activeDate: this.calculateActiveDate(timestamp, currentData?.snapshots || [], publishDate),
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
                const { parseTrafficCsv } = await import('../../../pages/Details/tabs/Traffic/utils/csvParser');

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
                throw error;
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
     * Updates an existing snapshot.
     * Used for in-place enrichment/repair without creating new history entries.
     */
    async update(
        userId: string,
        channelId: string,
        videoId: string,
        snapshotId: string,
        sources: TrafficSource[],
        totalRow?: TrafficSource,
        csvFile?: File
    ): Promise<void> {
        logger.info('Starting snapshot update', {
            component: 'TrafficSnapshotService',
            snapshotId,
            sourcesCount: sources.length,
            hasTotalRow: !!totalRow,
            hasCsvFile: !!csvFile
        });

        const currentData = await TrafficDataService.fetch(userId, channelId, videoId);
        if (!currentData) throw new Error('DATA_NOT_FOUND');

        const snapshotIndex = currentData.snapshots.findIndex(s => s.id === snapshotId);
        if (snapshotIndex === -1) throw new Error('SNAPSHOT_NOT_FOUND');

        const snapshot = currentData.snapshots[snapshotIndex];

        // 1. Upload new CSV (overwrite or new path)
        let storagePath = snapshot.storagePath;
        if (csvFile) {
            try {
                // If we have an existing path, we can potentially overwrite it or just upload new
                // To be safe and avoid caching issues, we'll upload as a new file (same ID logic though)
                const uploadResult = await uploadCsvSnapshot(
                    userId,
                    channelId,
                    videoId,
                    snapshotId,
                    csvFile
                );
                storagePath = uploadResult.storagePath;

                logger.debug('CSV uploaded during update', {
                    component: 'TrafficSnapshotService',
                    snapshotId,
                    storagePath
                });
            } catch (error) {
                logger.error('Failed to update CSV in Storage', { error });
                throw new Error('FAILED_TO_UPLOAD_SNAPSHOT');
            }
        }

        // 2. Update Metadata
        const totalViews = sources.reduce((sum, s) => sum + (s.views || 0), 0);
        const totalWatchTime = sources.reduce((sum, s) => sum + (s.watchTimeHours || 0), 0);
        const topSource = sources.reduce((max, s) =>
            (s.views || 0) > (max.views || 0) ? s : max,
            sources[0]
        );

        const updatedSnapshot: TrafficSnapshot = {
            ...snapshot,
            storagePath,
            summary: {
                totalViews,
                totalWatchTime,
                sourcesCount: sources.length,
                topSource: topSource?.sourceTitle,
                // Cache totalRow metrics for delta calculations
                totalImpressions: totalRow?.impressions,
                totalCtr: totalRow?.ctr
            }
        };

        const newSnapshots = [...currentData.snapshots];
        newSnapshots[snapshotIndex] = updatedSnapshot;

        const updatedData: TrafficData = {
            ...currentData,
            lastUpdated: Date.now(),
            snapshots: newSnapshots,
            // Also update current/preview data if this snapshot is the active/latest one
            // Ideally TrafficTab reloads using onDataRestored, but good to keep consistency
            sources: snapshotIndex === newSnapshots.length - 1 ? sources : currentData.sources,
            totalRow: snapshotIndex === newSnapshots.length - 1 ? (totalRow || currentData.totalRow) : currentData.totalRow
        };

        await TrafficDataService.save(userId, channelId, videoId, updatedData);

        logger.info('Traffic snapshot updated', {
            component: 'TrafficSnapshotService',
            snapshotId
        });
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
    ): Promise<TrafficData | null> {
        // 1. Получаем текущие данные
        const currentData = await TrafficDataService.fetch(userId, channelId, videoId);
        if (!currentData) return null;

        // 2. Находим снапшот для удаления
        const snapshotIndex = currentData.snapshots.findIndex(s => s.id === snapshotId);
        if (snapshotIndex === -1) return currentData;

        const snapshot = currentData.snapshots[snapshotIndex];

        // 3. Удаляем CSV из Cloud Storage (если существует)
        if (snapshot.storagePath) {
            try {
                await deleteCsvSnapshot(snapshot.storagePath);
            } catch (error) {
                snapshotLogger.error('Failed to delete CSV from Storage', {
                    component: 'TrafficSnapshotService',
                    snapshotId,
                    storagePath: snapshot.storagePath,
                    error
                });
            }
        }

        // 4. Update Snapshot List
        const updatedSnapshots = currentData.snapshots.filter(s => s.id !== snapshotId);

        let updated: TrafficData;

        // 5. Always Revert Current State to the "New" Latest
        const newLatestSnapshot = updatedSnapshots[updatedSnapshots.length - 1];

        if (newLatestSnapshot) {
            // Откатываемся к данным предыдущего (теперь последнего) снапшота
            let prevSources: TrafficSource[] = [];
            let prevTotalRow: TrafficSource | undefined;

            try {
                // Pass updatedSnapshots so getVersionSources doesn't pick up the deleted one
                const result = await this.getVersionSources(newLatestSnapshot.version, updatedSnapshots);
                prevSources = result.sources;
                prevTotalRow = result.totalRow;
            } catch (err) {
                snapshotLogger.warn('Failed to restore previous snapshot data during deletion', {
                    component: 'TrafficSnapshotService',
                    snapshotId: newLatestSnapshot.id,
                    error: err
                });
            }

            updated = {
                ...currentData,
                lastUpdated: newLatestSnapshot.timestamp,
                sources: prevSources,
                totalRow: prevTotalRow,
                snapshots: updatedSnapshots
            };
        } else {
            // Нет снапшотов -> Сбрасываем в пустое состояние
            updated = {
                ...currentData,
                lastUpdated: Date.now(),
                sources: [],
                totalRow: undefined,
                snapshots: []
            };
        }

        await TrafficDataService.save(userId, channelId, videoId, updated);
        return updated;
    },

    /**
     * Updates only metadata fields (label, activeDate) on a snapshot.
     * Lightweight operation — no CSV re-upload, no summary recalculation.
     */
    async updateMetadata(
        userId: string,
        channelId: string,
        videoId: string,
        snapshotId: string,
        metadata: { label?: string; activeDate?: { start: number; end: number } | null; version?: number }
    ): Promise<void> {
        const currentData = await TrafficDataService.fetch(userId, channelId, videoId);
        if (!currentData) throw new Error('DATA_NOT_FOUND');

        const snapshotIndex = currentData.snapshots.findIndex(s => s.id === snapshotId);
        if (snapshotIndex === -1) throw new Error('SNAPSHOT_NOT_FOUND');

        const snapshot = currentData.snapshots[snapshotIndex];
        const updatedSnapshot = { ...snapshot };

        // Apply metadata changes
        if (metadata.label !== undefined) {
            if (metadata.label) {
                updatedSnapshot.label = metadata.label;
            } else {
                delete updatedSnapshot.label;
            }
        }
        if (metadata.activeDate !== undefined) {
            if (metadata.activeDate) {
                updatedSnapshot.activeDate = metadata.activeDate;
            } else {
                delete updatedSnapshot.activeDate;
            }
        }
        if (metadata.version !== undefined) {
            updatedSnapshot.version = metadata.version;
        }

        const newSnapshots = [...currentData.snapshots];
        newSnapshots[snapshotIndex] = updatedSnapshot;

        await TrafficDataService.save(userId, channelId, videoId, {
            ...currentData,
            snapshots: newSnapshots
        });

        logger.info('Snapshot metadata updated', {
            component: 'TrafficSnapshotService',
            snapshotId,
            hasLabel: !!updatedSnapshot.label,
            hasActiveDate: !!updatedSnapshot.activeDate
        });
    },

    /**
     * Auto-calculate activeDate for a new snapshot.
     * start = previous snapshot's timestamp OR publishDate OR this snapshot's timestamp
     * end = this snapshot's timestamp
     */
    calculateActiveDate(
        timestamp: number,
        existingSnapshots: TrafficSnapshot[],
        publishDate?: number
    ): { start: number; end: number } {
        // Find the most recent snapshot before this one (any version)
        const prevSnapshot = existingSnapshots
            .filter(s => s.timestamp < timestamp)
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        const start = prevSnapshot?.timestamp ?? publishDate ?? timestamp;
        return { start, end: timestamp };
    },

    /**
     * Backfill activeDate for existing snapshots that don't have it.
     * Called lazily on first render. Calculates within each version group.
     */
    backfillActiveDates(
        snapshots: TrafficSnapshot[],
        publishDate?: number
    ): TrafficSnapshot[] {
        if (snapshots.every(s => s.activeDate)) return snapshots; // All filled

        const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
        return sorted.map((snap, idx) => {
            if (snap.activeDate) return snap;

            const prevSnapshot = sorted
                .slice(0, idx)
                .filter(s => s.timestamp < snap.timestamp)
                .pop();

            const start = prevSnapshot?.timestamp ?? publishDate ?? snap.timestamp;
            return { ...snap, activeDate: { start, end: snap.timestamp } };
        });
    }
};

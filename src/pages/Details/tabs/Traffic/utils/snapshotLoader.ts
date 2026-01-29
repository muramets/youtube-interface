import type { TrafficSnapshot, TrafficSource } from '../../../../../core/types/traffic';
import { logger } from '../../../../../core/utils/logger';

/**
 * Загружает источники трафика из снапшота.
 * Поддерживает гибридное хранилище (CSV в Cloud Storage).
 * 
 * @param snapshot - Снапшот для загрузки
 * @returns Promise с объектом { sources, totalRow }
 */
export const loadSnapshotSources = async (snapshot: TrafficSnapshot): Promise<{ sources: TrafficSource[]; totalRow?: TrafficSource }> => {
    // Приоритет 1: Загрузка из Cloud Storage (новый подход)
    if (snapshot.storagePath) {
        try {
            const { downloadCsvSnapshot } = await import('../../../../../core/services/storageService');
            const { parseTrafficCsv } = await import('./csvParser');

            const blob = await downloadCsvSnapshot(snapshot.storagePath);
            const file = new File([blob], 'snapshot.csv', { type: 'text/csv' });
            const { sources, totalRow } = await parseTrafficCsv(file);



            return { sources, totalRow };
        } catch (error) {
            logger.error('Failed to load snapshot from Storage', {
                component: 'snapshotLoader',
                snapshotId: snapshot.id,
                storagePath: snapshot.storagePath,
                error
            });
            throw error;
        }
    }

    // LEGACY REMOVED: No longer checking snapshot.sources

    logger.warn('Snapshot missing storagePath', {
        component: 'snapshotLoader',
        snapshotId: snapshot.id,
        version: snapshot.version
    });

    // Fallback: пустой массив
    return { sources: [] };
};

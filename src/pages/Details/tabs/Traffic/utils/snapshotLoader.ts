import type { TrafficSnapshot, TrafficSource } from '../../../../../core/types/traffic';
import { downloadCsvSnapshot } from '../../../../../core/services/storageService';
import { parseTrafficCsv } from './csvParser';
import { snapshotCache } from './snapshotCache';
import { logger } from '../../../../../core/utils/logger';

/**
 * Загружает источники трафика из снапшота.
 * Поддерживает гибридное хранилище (CSV в Cloud Storage).
 * 
 * Optimizations:
 * - Static imports (no dynamic import overhead)
 * - In-memory LRU cache (snapshots are immutable)
 * 
 * @param snapshot - Снапшот для загрузки
 * @returns Promise с объектом { sources, totalRow }
 */
export const loadSnapshotSources = async (snapshot: TrafficSnapshot): Promise<{ sources: TrafficSource[]; totalRow?: TrafficSource }> => {
    // Приоритет 1: Загрузка из Cloud Storage (новый подход)
    if (snapshot.storagePath) {
        // Check in-memory cache first (snapshots are immutable)
        const cached = snapshotCache.get(snapshot.storagePath);
        if (cached) {
            return cached;
        }

        try {
            const blob = await downloadCsvSnapshot(snapshot.storagePath);
            const file = new File([blob], 'snapshot.csv', { type: 'text/csv' });
            const { sources, totalRow } = await parseTrafficCsv(file);

            // Store in cache for future access
            snapshotCache.set(snapshot.storagePath, { sources, totalRow });

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

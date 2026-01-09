import type { TrafficSnapshot, TrafficSource } from '../../../../../core/types/traffic';

/**
 * Загружает источники трафика из снапшота.
 * Поддерживает гибридное хранилище:
 * - Если есть storagePath: загружает CSV из Cloud Storage
 * - Если есть sources: возвращает напрямую (legacy)
 * 
 * @param snapshot - Снапшот для загрузки
 * @returns Promise с массивом источников трафика
 * 
 * @example
 * const sources = await loadSnapshotSources(snapshot);
 */
export const loadSnapshotSources = async (snapshot: TrafficSnapshot): Promise<TrafficSource[]> => {
    // Приоритет 1: Загрузка из Cloud Storage (новый подход)
    if (snapshot.storagePath) {
        const { downloadCsvSnapshot } = await import('../../../../../core/services/storageService');
        const { parseTrafficCsv } = await import('./csvParser');

        const blob = await downloadCsvSnapshot(snapshot.storagePath);
        const file = new File([blob], 'snapshot.csv', { type: 'text/csv' });
        const { sources } = await parseTrafficCsv(file);

        return sources;
    }

    // Приоритет 2: Legacy - данные в Firestore
    if (snapshot.sources) {
        return snapshot.sources;
    }

    // Fallback: пустой массив
    return [];
};

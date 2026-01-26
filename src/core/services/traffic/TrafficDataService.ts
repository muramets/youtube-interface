import { db } from '../../../config/firebase';
import { doc, setDoc, deleteField, getDocFromServer } from 'firebase/firestore';
import type { TrafficData, TrafficSource } from '../../types/traffic';

/**
 * Сервис для работы с основными данными трафика.
 * Отвечает за загрузку, сохранение и слияние данных.
 */
export const TrafficDataService = {
    /**
     * Gets the document reference for the main traffic data
     */
    getMainDocRef(userId: string, channelId: string, videoId: string) {
        return doc(db, `users/${userId}/channels/${channelId}/videos/${videoId}/traffic/main`);
    },

    /**
     * Загружает данные трафика для видео
     */
    async fetch(userId: string, channelId: string, videoId: string): Promise<TrafficData | null> {
        const path = `users/${userId}/channels/${channelId}/videos/${videoId}/traffic/main`;
        try {
            const docRef = doc(db, path);
            // Use getDocFromServer to ensure we don't get stale cached data
            const snapshot = await getDocFromServer(docRef);
            if (snapshot.exists()) {
                const data = snapshot.data() as TrafficData;
                // Ensure array existence for older data
                return {
                    ...data,
                    snapshots: data.snapshots || []
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching traffic data:', error);
            throw error;
        }
    },

    /**
     * Сохраняет/перезаписывает данные трафика
     */
    async save(userId: string, channelId: string, videoId: string, data: TrafficData): Promise<void> {
        const path = `users/${userId}/channels/${channelId}/videos/${videoId}/traffic/main`;
        try {
            const docRef = doc(db, path);
            // Sanitize data to remove any undefined fields that Firestore rejects
            const sanitizedData = TrafficDataService.sanitize(data);
            await setDoc(docRef, sanitizedData, { merge: true });
        } catch (error) {
            console.error('Error saving traffic data:', error);
            throw error;
        }
    },

    /**
     * Объединяет новые CSV данные с существующими.
     * - sources: новые данные становятся источником истины
     * - groups: сохраняются из существующих данных
     * - snapshots: сохраняются из существующих данных
     */
    merge(
        currentData: TrafficData | null,
        newSources: TrafficSource[],
        newTotalRow?: TrafficSource
    ): TrafficData {
        const now = Date.now();
        console.log('[TrafficDataService] merge:', {
            newSourcesLen: newSources.length,
            currentSnapshotsLen: currentData?.snapshots?.length
        });

        const merged: TrafficData = {
            ...currentData,
            lastUpdated: now,
            sources: newSources,
            totalRow: newTotalRow || currentData?.totalRow,
            snapshots: currentData?.snapshots || []
        } as TrafficData;

        return merged;
    },

    /**
     * Очищает текущие данные трафика (sources и totalRow).
     * Используется при начале новой версии.
     * Сохраняет историю снапшотов.
     */
    async clear(userId: string, channelId: string, videoId: string): Promise<void> {
        console.log('[TrafficDataService] clear called');
        const currentData = await TrafficDataService.fetch(userId, channelId, videoId);

        const path = `users/${userId}/channels/${channelId}/videos/${videoId}/traffic/main`;
        const docRef = doc(db, path);
        try {
            await setDoc(docRef, {
                lastUpdated: Date.now(),
                sources: [],
                totalRow: deleteField(),
                snapshots: currentData?.snapshots || [],
                groups: currentData?.groups || []
            }, { merge: true });
            console.log('[TrafficDataService] Data cleared successfully');
        } catch (e) {
            console.error('[TrafficDataService] Failed to clear data:', e);
            throw e;
        }
    },

    /**
     * Обновляет snapshots (для packaging snapshot preservation).
     * Используется при удалении версии упаковки с traffic данными.
     */
    /**
     * Обновляет snapshots (для packaging snapshot preservation).
     * Используется при удалении версии упаковки с traffic данными.
     */
    async updateSnapshots(userId: string, channelId: string, videoId: string, snapshots: Array<unknown>): Promise<void> {
        const currentData = await TrafficDataService.fetch(userId, channelId, videoId);
        if (!currentData) return;

        const path = `users/${userId}/channels/${channelId}/videos/${videoId}/traffic/main`;
        const docRef = doc(db, path);

        try {
            // FIX: Sanitize snapshots to remove undefined fields (like abTestResults)
            const sanitizedSnapshots = TrafficDataService.sanitize(snapshots);

            await setDoc(docRef, {
                ...currentData,
                snapshots: sanitizedSnapshots,
                lastUpdated: Date.now()
            }, { merge: true });
        } catch (error) {
            console.error('Error updating snapshots:', error);
            throw error;
        }
    },

    /**
     * Санитизирует данные для Firestore, удаляя undefined значения
     */
    sanitize<T>(data: T): T {
        const json = JSON.parse(JSON.stringify(data));
        // Remove undefined/null if they still exist for some reason
        const clean = (obj: any): any => {
            if (typeof obj !== 'object' || obj === null) return obj;

            Object.keys(obj).forEach(key => {
                if (obj[key] === undefined) {
                    delete obj[key];
                } else if (obj[key] !== null && typeof obj[key] === 'object') {
                    clean(obj[key]);
                }
            });
            return obj;
        };
        return clean(json);
    }
};

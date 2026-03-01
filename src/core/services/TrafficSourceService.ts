// =============================================================================
// Traffic Source Service
//
// Firestore operations for Traffic Source data (aggregate traffic metrics).
// Mirrors TrafficDataService pattern but stores data under a separate path.
//
// Firestore path: users/{uid}/channels/{channelId}/videos/{videoId}/trafficSource/main
// =============================================================================

import { db } from '../../config/firebase';
import { doc, setDoc, getDocFromServer } from 'firebase/firestore';
import type { TrafficSourceData, TrafficSourceSnapshot, TrafficSourceMetric } from '../types/trafficSource';
import { uploadTrafficSourceCsv } from './storageService';
import { generateAutoLabel } from '../../pages/Details/tabs/TrafficSource/utils/autoLabel';

/**
 * Sanitize data for Firestore — remove undefined values.
 */
function sanitize<T>(data: T): T {
    return JSON.parse(JSON.stringify(data)) as T;
}

export const TrafficSourceService = {
    /**
     * Firestore document reference for traffic source data.
     */
    getDocRef(userId: string, channelId: string, videoId: string) {
        return doc(db, `users/${userId}/channels/${channelId}/videos/${videoId}/trafficSource/main`);
    },

    /**
     * Fetch traffic source data from Firestore.
     */
    async fetch(userId: string, channelId: string, videoId: string): Promise<TrafficSourceData | null> {
        try {
            const docRef = this.getDocRef(userId, channelId, videoId);
            const snapshot = await getDocFromServer(docRef);
            if (snapshot.exists()) {
                const data = snapshot.data() as TrafficSourceData;
                return {
                    ...data,
                    snapshots: data.snapshots || [],
                };
            }
            return null;
        } catch (error) {
            console.error('[TrafficSourceService] Error fetching:', error);
            throw error;
        }
    },

    /**
     * Save traffic source data to Firestore.
     */
    async save(userId: string, channelId: string, videoId: string, data: TrafficSourceData): Promise<void> {
        try {
            const docRef = this.getDocRef(userId, channelId, videoId);
            await setDoc(docRef, sanitize(data), { merge: true });
        } catch (error) {
            console.error('[TrafficSourceService] Error saving:', error);
            throw error;
        }
    },

    /**
     * Create a new snapshot: upload CSV to Cloud Storage, then update Firestore metadata.
     *
     * @param _metrics - Parsed CSV data (for summary cache — currently unused, reserved for future)
     * @param totalRow - Total row from CSV
     * @param file - Original CSV file to upload
     * @param publishedAt - Video publish date (for auto-label)
     * @returns The new snapshot ID
     */
    async createSnapshot(
        userId: string,
        channelId: string,
        videoId: string,
        _metrics: TrafficSourceMetric[],
        totalRow: TrafficSourceMetric | undefined,
        file: File,
        publishedAt?: string
    ): Promise<string> {
        const now = Date.now();
        const snapshotId = `ts_${now}`;  // "ts_" prefix to distinguish from traffic snapshots


        // 1. Upload CSV to Cloud Storage
        const { storagePath } = await uploadTrafficSourceCsv(userId, channelId, videoId, snapshotId, file);


        // 2. Create snapshot metadata (storagePath comes from actual upload, not manual construction)
        const snapshot: TrafficSourceSnapshot = {
            id: snapshotId,
            timestamp: now,
            autoLabel: generateAutoLabel(publishedAt, now),
            storagePath,
            totalViews: totalRow?.views,
            totalImpressions: totalRow?.impressions,
            totalCtr: totalRow?.ctr,
        };

        // 3. Fetch current data and append snapshot
        const currentData = await this.fetch(userId, channelId, videoId);
        const updatedData: TrafficSourceData = {
            lastUpdated: now,
            snapshots: [...(currentData?.snapshots || []), snapshot],
        };

        // 4. Save to Firestore
        await this.save(userId, channelId, videoId, updatedData);


        return snapshotId;
    },

    /**
     * Delete a snapshot: remove from Firestore metadata.
     * Note: Cloud Storage cleanup could be handled by a Cloud Function.
     */
    async deleteSnapshot(
        userId: string,
        channelId: string,
        videoId: string,
        snapshotId: string
    ): Promise<TrafficSourceData | null> {
        const currentData = await this.fetch(userId, channelId, videoId);
        if (!currentData) return null;

        const updatedData: TrafficSourceData = {
            lastUpdated: Date.now(),
            snapshots: currentData.snapshots.filter((s: TrafficSourceSnapshot) => s.id !== snapshotId),
        };

        await this.save(userId, channelId, videoId, updatedData);
        return updatedData;
    },

    /**
     * Update snapshot metadata (label rename).
     */
    async updateSnapshotMetadata(
        userId: string,
        channelId: string,
        videoId: string,
        snapshotId: string,
        metadata: { label?: string }
    ): Promise<void> {
        const currentData = await this.fetch(userId, channelId, videoId);
        if (!currentData) return;

        const updatedSnapshots = currentData.snapshots.map((s: TrafficSourceSnapshot) => {
            if (s.id !== snapshotId) return s;
            const updated = { ...s };
            if (metadata.label !== undefined) {
                if (metadata.label) {
                    updated.label = metadata.label;
                } else {
                    delete updated.label;
                }
            }
            return updated;
        });

        await this.save(userId, channelId, videoId, {
            ...currentData,
            snapshots: updatedSnapshots,
            lastUpdated: Date.now(),
        });
    },
};

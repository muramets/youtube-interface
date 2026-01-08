import { db } from '../../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { TrafficData, TrafficSource, TrafficSnapshot } from '../types/traffic';
import { generateSnapshotId } from '../utils/snapshotUtils';
import { uploadCsvSnapshot } from './storageService';



export const TrafficService = {
    /**
     * Get traffic data for a video
     */
    async fetchTrafficData(userId: string, channelId: string, videoId: string): Promise<TrafficData | null> {
        const path = `users/${userId}/channels/${channelId}/videos/${videoId}/traffic/main`;
        try {
            const docRef = doc(db, path);
            const snapshot = await getDoc(docRef);
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
     * Save/Overwrite traffic data
     */
    async saveTrafficData(userId: string, channelId: string, videoId: string, data: TrafficData): Promise<void> {
        const path = `users/${userId}/channels/${channelId}/videos/${videoId}/traffic/main`;
        try {
            const docRef = doc(db, path);
            await setDoc(docRef, data, { merge: true });
        } catch (error) {
            console.error('Error saving traffic data:', error);
            throw error;
        }
    },

    /**
     * Merges new CSV data with existing data.
     * - source: "Lifetime" CSV logic implies new data IS the source of truth for totals.
     * - groups: MUST be preserved from existing data.
     * - snapshots: MUST be preserved.
     */
    mergeTrafficData(
        currentData: TrafficData | null,
        newSources: TrafficSource[],
        newTotalRow?: TrafficSource
    ): TrafficData {
        const now = Date.now();

        // If no prior data, just return new
        if (!currentData) {
            return {
                lastUpdated: now,
                sources: newSources,
                groups: [],
                totalRow: newTotalRow,
                snapshots: []
            };
        }

        // Logic:
        // 1. New Sources replace old sources (because CSV is lifetime/cumulative)
        // 2. BUT we might want to keep groups.
        // Groups are ID-based. If a videoId in a group no longer exists in new Sources, 
        // we should probably keep it in the group just in case (or clean it up? user said "ungrouped" if group deleted, not inverse).
        // Let's keep group definitions as-is.

        return {
            ...currentData,
            lastUpdated: now,
            sources: newSources,
            totalRow: newTotalRow || currentData.totalRow,
            // Groups and snapshots are preserved
        };
    },


    /**
     * Create a version snapshot with HYBRID STORAGE.
     * 
     * HYBRID APPROACH:
     * 1. Upload CSV file to Cloud Storage
     * 2. Calculate summary statistics
     * 3. Save metadata + summary to Firestore (NOT full sources)
     * 
     * Benefits:
     * - No Firestore 1MB document limit
     * - Faster queries (metadata only)
     * - Cheaper storage costs
     * - Original CSV preserved
     * 
     * @param userId - User ID
     * @param channelId - Channel ID
     * @param videoId - Video ID
     * @param version - Packaging version number
     * @param sources - Traffic sources from CSV
     * @param totalRow - Total row from CSV
     * @param csvFile - Original CSV file to upload to Storage
     */
    async createVersionSnapshot(
        userId: string,
        channelId: string,
        videoId: string,
        version: number,
        sources: TrafficSource[],
        totalRow?: TrafficSource,
        csvFile?: File
    ): Promise<void> {
        const currentData = await this.fetchTrafficData(userId, channelId, videoId);
        const timestamp = Date.now();
        const snapshotId = generateSnapshotId(timestamp, version);

        // Calculate summary statistics
        const totalViews = sources.reduce((sum, s) => sum + (s.views || 0), 0);
        const totalWatchTime = sources.reduce((sum, s) => sum + (s.watchTimeHours || 0), 0);
        const topSource = sources.reduce((max, s) =>
            (s.views || 0) > (max.views || 0) ? s : max,
            sources[0]
        );

        let storagePath: string | undefined;

        // Upload CSV to Cloud Storage if file provided
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
                // Continue without storage path (will save sources to Firestore as fallback)
            }
        }

        // Create snapshot metadata
        const snapshot: TrafficSnapshot = {
            id: snapshotId,
            version,
            timestamp,
            createdAt: new Date().toISOString(),

            // Hybrid storage fields
            storagePath,
            summary: {
                totalViews,
                totalWatchTime,
                sourcesCount: sources.length,
                topSource: topSource?.sourceTitle
            },

            // Legacy: Only include sources if CSV upload failed
            ...(storagePath ? {} : { sources, totalRow })
        };

        const updated: TrafficData = {
            lastUpdated: Date.now(),
            sources: currentData?.sources || [],
            groups: currentData?.groups || [],
            totalRow: currentData?.totalRow,
            snapshots: [...(currentData?.snapshots || []), snapshot]
        };

        await this.saveTrafficData(userId, channelId, videoId, updated);
    },

    /**
     * Calculate traffic delta for a specific version.
     * Subtracts previous snapshot from current data to show only new traffic.
     */
    calculateVersionDelta(
        currentSources: TrafficSource[],
        version: number,
        snapshots: TrafficSnapshot[]
    ): TrafficSource[] {
        // Find snapshot for previous version
        const prevSnapshot = snapshots.find(s => s.version === version - 1);
        if (!prevSnapshot || !prevSnapshot.sources) return currentSources; // No previous data or data in Storage

        // Create map of previous views
        const prevViews = new Map<string, number>();
        prevSnapshot.sources.forEach(s => {
            if (s.videoId) {
                prevViews.set(s.videoId, s.views);
            }
        });

        // Calculate delta for each source
        return currentSources.map(source => {
            if (!source.videoId) return source;

            const prevCount = prevViews.get(source.videoId) || 0;
            const delta = Math.max(0, source.views - prevCount);

            return {
                ...source,
                views: delta
            };
        });
    },

    /**
     * Get sources for a specific historical version from snapshot.
     * 
     * HYBRID STORAGE:
     * - If snapshot has storagePath: download CSV from Storage and parse
     * - If snapshot has sources: return directly (legacy)
     * 
     * @param version - Version number to get sources for
     * @param snapshots - Array of snapshots
     * @returns Traffic sources for the version
     */
    async getVersionSources(
        version: number,
        snapshots: TrafficSnapshot[]
    ): Promise<TrafficSource[]> {
        const snapshot = snapshots.find(s => s.version === version);
        if (!snapshot) return [];

        // Legacy: sources stored in Firestore
        if (snapshot.sources) {
            return snapshot.sources;
        }

        // Hybrid: sources in Cloud Storage
        if (snapshot.storagePath) {
            try {
                const { downloadCsvSnapshot } = await import('./storageService');
                const { parseTrafficCsv } = await import('../utils/csvParser');

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
    }
};

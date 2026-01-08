import { db } from '../../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { TrafficData, TrafficSource, TrafficGroup, TrafficSnapshot } from '../types/traffic';

const COLLECTION_PATH = 'users/{userId}/channels/{channelId}/videos/{videoId}/traffic';
const DOC_ID = 'main'; // Single document strategy per video for simplicity

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
     * Creates a snapshot of traffic data when packaging version changes.
     * Called from DetailsLayout when user saves new packaging version.
     */
    async createVersionSnapshot(
        userId: string,
        channelId: string,
        videoId: string,
        version: number,
        sources: TrafficSource[],
        totalRow?: TrafficSource
    ): Promise<void> {
        const currentData = await this.fetchTrafficData(userId, channelId, videoId);
        const timestamp = Date.now();

        const snapshot: TrafficSnapshot = {
            id: `snap_${timestamp}_v${version}`,
            version,
            timestamp,
            createdAt: new Date().toISOString(),
            sources: sources,
            totalRow
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
        if (!prevSnapshot) return currentSources; // No previous data, return all

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
     */
    getVersionSources(
        version: number,
        snapshots: TrafficSnapshot[]
    ): TrafficSource[] {
        const snapshot = snapshots.find(s => s.version === version);
        return snapshot?.sources || [];
    }
};

// =============================================================================
// Traffic Source Snapshot Loader
//
// Downloads Traffic Source CSV from Cloud Storage and parses it.
// Mirrors the pattern from Traffic/utils/snapshotLoader.ts.
// =============================================================================

import type { TrafficSourceSnapshot, TrafficSourceMetric } from '../../../../../core/types/trafficSource';
import { downloadCsvSnapshot } from '../../../../../core/services/storageService';
import { parseTrafficSourceCsv } from './trafficSourceParser';
import { logger } from '../../../../../core/utils/logger';

// Simple in-memory cache for immutable snapshots
const cache = new Map<string, { metrics: TrafficSourceMetric[]; totalRow?: TrafficSourceMetric }>();
const MAX_CACHE_SIZE = 20;

/**
 * Load Traffic Source metrics from a snapshot.
 * Downloads CSV from Cloud Storage, parses it, and caches the result.
 */
export const loadTrafficSourceSnapshot = async (
    snapshot: TrafficSourceSnapshot
): Promise<{ metrics: TrafficSourceMetric[]; totalRow?: TrafficSourceMetric }> => {
    if (!snapshot.storagePath) {
        logger.warn('TrafficSource snapshot missing storagePath', {
            component: 'trafficSourceSnapshotLoader',
            snapshotId: snapshot.id,
        });
        return { metrics: [] };
    }

    // Check cache first (snapshots are immutable)
    const cached = cache.get(snapshot.storagePath);
    if (cached) return cached;

    try {
        const blob = await downloadCsvSnapshot(snapshot.storagePath);
        const file = new File([blob], 'snapshot.csv', { type: 'text/csv' });
        const result = await parseTrafficSourceCsv(file);

        // Evict oldest if cache is full
        if (cache.size >= MAX_CACHE_SIZE) {
            const firstKey = cache.keys().next().value;
            if (firstKey) cache.delete(firstKey);
        }

        cache.set(snapshot.storagePath, result);
        return result;
    } catch (error) {
        // Handle missing CSV gracefully (stale snapshot or failed upload)
        const isNotFound = error instanceof Error &&
            (error.message.includes('object-not-found') || error.message.includes('404'));

        if (isNotFound) {
            logger.warn('TrafficSource snapshot CSV not found in Storage (stale?)', {
                component: 'trafficSourceSnapshotLoader',
                snapshotId: snapshot.id,
                storagePath: snapshot.storagePath,
            });
            return { metrics: [] };
        }

        logger.error('Failed to load TrafficSource snapshot', {
            component: 'trafficSourceSnapshotLoader',
            snapshotId: snapshot.id,
            storagePath: snapshot.storagePath,
            error,
        });
        throw error;
    }
};

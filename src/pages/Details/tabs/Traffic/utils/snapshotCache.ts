import type { TrafficSource } from '../../../../../core/types/traffic';

interface CacheEntry {
    sources: TrafficSource[];
    totalRow?: TrafficSource;
    accessedAt: number;
}

const MAX_CACHE_SIZE = 10;
const cache = new Map<string, CacheEntry>();

/**
 * In-memory LRU cache for parsed snapshot CSV data.
 * 
 * Snapshots are IMMUTABLE — once created, their CSV never changes.
 * This makes caching safe with no invalidation concerns (except deletion).
 * 
 * Key: storagePath (unique per snapshot CSV file)
 * Value: parsed { sources, totalRow }
 */
export const snapshotCache = {
    get(storagePath: string): { sources: TrafficSource[]; totalRow?: TrafficSource } | null {
        const entry = cache.get(storagePath);
        if (!entry) return null;

        // Update access time for LRU
        entry.accessedAt = Date.now();
        return { sources: entry.sources, totalRow: entry.totalRow };
    },

    set(storagePath: string, data: { sources: TrafficSource[]; totalRow?: TrafficSource }): void {
        // Evict least-recently-used if at capacity
        if (cache.size >= MAX_CACHE_SIZE && !cache.has(storagePath)) {
            let oldestKey: string | null = null;
            let oldestTime = Infinity;

            for (const [key, entry] of cache) {
                if (entry.accessedAt < oldestTime) {
                    oldestTime = entry.accessedAt;
                    oldestKey = key;
                }
            }

            if (oldestKey) cache.delete(oldestKey);
        }

        cache.set(storagePath, {
            sources: data.sources,
            totalRow: data.totalRow,
            accessedAt: Date.now()
        });
    },

    /** Remove a specific entry (e.g., after snapshot deletion) */
    invalidate(storagePath: string): void {
        cache.delete(storagePath);
    },

    /** Clear entire cache */
    clear(): void {
        cache.clear();
    },

    get size(): number {
        return cache.size;
    }
};

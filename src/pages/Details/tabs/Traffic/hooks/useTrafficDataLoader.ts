import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TrafficData, TrafficSource, TrafficSnapshot, TrafficGroup } from '../../../../../core/types/traffic';
import { TrafficService } from '../../../../../core/services/traffic';
import { loadSnapshotSources } from '../utils/snapshotLoader';
import { logger } from '../../../../../core/utils/logger';

interface UseTrafficDataLoaderProps {
    trafficData: TrafficData | null;
    viewingVersion?: number | 'draft';
    viewMode: 'cumulative' | 'delta';
    selectedSnapshot?: string | null;
    groups?: TrafficGroup[];
}

export interface TrashMetrics {
    impressions: number;
    views: number;
}

export interface MetricDelta {
    previous: number;
    current: number;
    delta: number;
}

export interface DeltaContext {
    impressions?: MetricDelta;
    views?: MetricDelta;
    isIncomplete?: boolean;
}

/**
 * Hook for loading and displaying traffic data.
 * 
 * Simplified loading priorities:
 * 1. Specific snapshot selected → load that snapshot's CSV
 * 2. Version selected → load latest snapshot for that version
 */
export const useTrafficDataLoader = ({
    trafficData,
    viewingVersion,
    viewMode,
    selectedSnapshot,
    groups = []
}: UseTrafficDataLoaderProps) => {
    const [displayedSources, _setDisplayedSources] = useState<TrafficSource[]>([]);

    // Stable setter to prevent unnecessary re-renders (especially [] -> [])
    const setDisplayedSources = useCallback((newSources: TrafficSource[]) => {
        _setDisplayedSources(prev => {
            if (prev === newSources) return prev;
            if (prev.length === 0 && newSources.length === 0) return prev;
            return newSources;
        });
    }, []);

    const [actualTotalRow, setActualTotalRow] = useState<TrafficSource | undefined>(undefined);
    const [trashMetrics, setTrashMetrics] = useState<TrashMetrics>({ impressions: 0, views: 0 });
    const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const lastLoadedKeyRef = useRef<string | null>(null);
    const lastLoadContextRef = useRef<{ snapshotId?: string | null; viewMode?: string, versionKey?: string } | null>(null);

    // Synchronous load-pending detection
    const currentLoadKey = `${selectedSnapshot || ''}-${viewingVersion}-${viewMode}-${trafficData?.lastUpdated}-${trafficData?.snapshots?.length}`;
    const isLoadPending = currentLoadKey !== lastLoadedKeyRef.current;

    // Context for Delta Mode (Previous -> Current)
    const [deltaContext, setDeltaContext] = useState<DeltaContext | undefined>(undefined);

    // Business Logic: Identify Trash videos
    const trashGroup = useMemo(() => groups.find(g => g.name.trim().toLowerCase() === 'trash'), [groups]);
    const trashVideoIds = useMemo(() => new Set(trashGroup?.videoIds || []), [trashGroup?.videoIds]);

    const calculateTrashMetrics = useCallback((sources: TrafficSource[]): TrashMetrics => {
        let trashImpressions = 0;
        let trashViews = 0;

        sources.forEach(s => {
            if (s.videoId && trashVideoIds.has(s.videoId)) {
                trashImpressions += (s.impressions || 0);
                trashViews += (s.views || 0);
            }
        });

        return { impressions: trashImpressions, views: trashViews };
    }, [trashVideoIds]);

    const retry = useCallback(() => {
        logger.info('User initiated retry for traffic data loading', { component: 'useTrafficDataLoader' });
        setError(null);
        lastLoadedKeyRef.current = null;
        setActualTotalRow(undefined);
        setRetryCount(prev => prev + 1);
    }, []);

    useEffect(() => {
        const loadData = async () => {
            const loadKey = `${selectedSnapshot || ''}-${viewingVersion}-${viewMode}-${trafficData?.lastUpdated}-${trafficData?.snapshots?.length}`;

            if (loadKey === lastLoadedKeyRef.current && displayedSources.length > 0) {
                return;
            }

            const currentContext = {
                snapshotId: selectedSnapshot,
                viewMode,
                versionKey: `${viewingVersion}`
            };

            const isSoftUpdate = lastLoadContextRef.current &&
                lastLoadContextRef.current.snapshotId === currentContext.snapshotId &&
                lastLoadContextRef.current.viewMode === currentContext.viewMode &&
                lastLoadContextRef.current.versionKey === currentContext.versionKey &&
                displayedSources.length > 0;

            setError(null);

            if (!trafficData?.sources) {
                setDisplayedSources([]);
                setActualTotalRow(undefined);
                setTrashMetrics({ impressions: 0, views: 0 });
                lastLoadedKeyRef.current = loadKey;
                lastLoadContextRef.current = currentContext;
                return;
            }

            // Priority 1: Specific snapshot selected
            if (selectedSnapshot) {
                if (!isSoftUpdate) setIsLoadingSnapshot(true);
                try {
                    const snapshot = trafficData.snapshots?.find((s: TrafficSnapshot) => s.id === selectedSnapshot);
                    if (snapshot) {
                        if (viewMode === 'delta') {
                            const result = await loadDeltaParallel(snapshot, trafficData.snapshots || []);
                            if (result) {
                                setDisplayedSources(result.sources);
                                setActualTotalRow(result.totalRow);
                                setDeltaContext(result.deltaContext);
                            } else {
                                setDisplayedSources([]);
                                setActualTotalRow(undefined);
                                setDeltaContext(undefined);
                            }
                        } else {
                            const { sources: currentSources, totalRow: currentTotal } = await loadSnapshotSources(snapshot);
                            setDisplayedSources(currentSources);
                            setActualTotalRow(currentTotal || trafficData.totalRow);
                            setDeltaContext(undefined);
                        }
                        lastLoadedKeyRef.current = loadKey;
                        lastLoadContextRef.current = currentContext;
                    } else {
                        setDisplayedSources([]);
                        setActualTotalRow(undefined);
                        setTrashMetrics({ impressions: 0, views: 0 });
                        lastLoadedKeyRef.current = loadKey;
                        lastLoadContextRef.current = currentContext;
                    }
                } catch (err) {
                    logger.error('Failed to load snapshot', { component: 'useTrafficDataLoader', error: err, selectedSnapshot });
                    setError(err instanceof Error ? err : new Error('Unknown error loading snapshot'));
                    setDisplayedSources([]);
                    setActualTotalRow(undefined);
                } finally {
                    if (!isSoftUpdate) setIsLoadingSnapshot(false);
                }
                return;
            }

            // Priority 2: Version view — load latest snapshot for this version
            const versionSnapshots = (trafficData.snapshots || [])
                .filter((s: TrafficSnapshot) => s.version === viewingVersion)
                .sort((a, b) => b.timestamp - a.timestamp);

            if (versionSnapshots.length > 0) {
                if (!isSoftUpdate) setIsLoadingSnapshot(true);
                try {
                    const latestSnap = versionSnapshots[0];

                    if (viewMode === 'delta') {
                        const result = await loadDeltaParallel(latestSnap, trafficData.snapshots || []);
                        if (result) {
                            setDisplayedSources(result.sources);
                            setActualTotalRow(result.totalRow);
                            setDeltaContext(result.deltaContext);
                        } else {
                            setDisplayedSources([]);
                            setActualTotalRow(undefined);
                            setDeltaContext(undefined);
                        }
                    } else {
                        const { sources, totalRow: currentTotal } = await TrafficService.getVersionSources(
                            viewingVersion as number,
                            trafficData.snapshots || []
                        );
                        setDisplayedSources(sources);
                        setActualTotalRow(currentTotal || trafficData.totalRow);
                        setDeltaContext(undefined);
                    }
                    lastLoadedKeyRef.current = loadKey;
                    lastLoadContextRef.current = currentContext;
                } catch (err) {
                    logger.error('Failed to load version sources', { component: 'useTrafficDataLoader', error: err, viewingVersion });
                    setError(err instanceof Error ? err : new Error('Unknown error loading version'));
                    setDisplayedSources(trafficData.sources || []);
                    setActualTotalRow(trafficData.totalRow);
                } finally {
                    if (!isSoftUpdate) setIsLoadingSnapshot(false);
                }
                return;
            }

            // Fallback: no snapshots for this version
            setDisplayedSources([]);
            setActualTotalRow(undefined);
            setDeltaContext(undefined);
            lastLoadedKeyRef.current = loadKey;
            lastLoadContextRef.current = currentContext;
        };

        loadData();
    }, [
        selectedSnapshot,
        viewingVersion,
        viewMode,
        retryCount,
        trafficData?.lastUpdated,
        trafficData?.snapshots,
        trafficData?.sources,
        trafficData?.totalRow,
        displayedSources.length,
        setDisplayedSources
    ]);

    // Separate Effect for Trash Metrics to prevent Loading Loop
    useEffect(() => {
        if (displayedSources.length > 0) {
            const metrics = calculateTrashMetrics(displayedSources);
            setTrashMetrics((prev) => {
                if (prev.impressions === metrics.impressions && prev.views === metrics.views) return prev;
                return metrics;
            });
        }
    }, [displayedSources, calculateTrashMetrics]);

    return useMemo(() => ({
        displayedSources,
        actualTotalRow,
        trashMetrics,
        isLoadingSnapshot: isLoadingSnapshot || isLoadPending,
        error,
        retry,
        deltaContext
    }), [displayedSources, actualTotalRow, trashMetrics, isLoadingSnapshot, isLoadPending, error, deltaContext, retry]);
};

/**
 * Find the previous snapshot in the global timeline for delta calculation.
 * Searches across ALL versions, sorted by timestamp.
 * Returns null if no previous snapshot exists.
 */
export const findPreviousSnapshot = (
    currentSnapshotId: string,
    snapshots: TrafficSnapshot[]
): TrafficSnapshot | null => {
    const sortedSnapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const currentIndex = sortedSnapshots.findIndex(s => s.id === currentSnapshotId);
    if (currentIndex <= 0) return null;
    return sortedSnapshots[currentIndex - 1];
};

/**
 * Helper function to calculate delta between snapshots.
 */
const calculateSnapshotDelta = (
    currentSources: TrafficSource[],
    currentTotal: TrafficSource | undefined,
    prevSources: TrafficSource[],
    prevTotal: TrafficSource | undefined
): { sources: TrafficSource[], totalRow?: TrafficSource, deltaContext?: DeltaContext } => {
    if (prevSources.length === 0) {
        return { sources: [], totalRow: undefined };
    }

    const prevData = new Map<string, { views: number; impressions: number, watchTime: number }>();
    prevSources.forEach(s => {
        if (s.videoId) {
            prevData.set(s.videoId, {
                views: s.views || 0,
                impressions: s.impressions || 0,
                watchTime: s.watchTimeHours || 0
            });
        }
    });

    const sources = currentSources
        .map(source => {
            if (!source.videoId) return source;
            const prev = prevData.get(source.videoId) || { views: 0, impressions: 0, watchTime: 0 };

            const viewsDelta = Math.max(0, source.views - prev.views);
            const impressionsDelta = Math.max(0, (source.impressions || 0) - prev.impressions);
            const watchTimeDelta = Math.max(0, (source.watchTimeHours || 0) - prev.watchTime);

            const ctrDelta = impressionsDelta > 0 ? (viewsDelta / impressionsDelta) * 100 : 0;

            return {
                ...source,
                views: viewsDelta,
                impressions: impressionsDelta,
                watchTimeHours: watchTimeDelta,
                ctr: parseFloat(ctrDelta.toFixed(2))
            };
        })
        .filter(source => !source.videoId || source.views > 0 || source.impressions > 0);

    let totalRow: TrafficSource | undefined = currentTotal;
    let deltaContext: DeltaContext | undefined = undefined;

    if (currentTotal && prevTotal) {
        const viewsDelta = Math.max(0, currentTotal.views - prevTotal.views);
        const impressionsDelta = Math.max(0, (currentTotal.impressions || 0) - (prevTotal.impressions || 0));
        const watchTimeDelta = Math.max(0, (currentTotal.watchTimeHours || 0) - (prevTotal.watchTimeHours || 0));
        const ctrDelta = impressionsDelta > 0 ? (viewsDelta / impressionsDelta) * 100 : 0;

        totalRow = {
            ...currentTotal,
            views: viewsDelta,
            impressions: impressionsDelta,
            watchTimeHours: watchTimeDelta,
            ctr: parseFloat(ctrDelta.toFixed(2))
        };

        deltaContext = {
            impressions: {
                previous: prevTotal.impressions || 0,
                current: currentTotal.impressions || 0,
                delta: impressionsDelta
            },
            views: {
                previous: prevTotal.views || 0,
                current: currentTotal.views || 0,
                delta: viewsDelta
            }
        };
    } else {
        deltaContext = {
            isIncomplete: true
        };
        logger.warn('Missing total row for delta context calculation', {
            component: 'useTrafficDataLoader',
            hasCurrentTotal: !!currentTotal,
            hasPrevTotal: !!prevTotal
        });
    }

    return { sources, totalRow, deltaContext };
};

/**
 * Helper: Build prevTotal from snapshot summary cache (avoids CSV download just for totals).
 */
const buildCachedPrevTotal = (prevSnapshot: TrafficSnapshot): TrafficSource | undefined => {
    if (prevSnapshot.summary?.totalImpressions === undefined) return undefined;
    return {
        sourceType: '',
        sourceTitle: 'Total',
        videoId: null,
        impressions: prevSnapshot.summary.totalImpressions,
        ctr: prevSnapshot.summary.totalCtr ?? 0,
        views: prevSnapshot.summary.totalViews,
        avgViewDuration: '',
        watchTimeHours: prevSnapshot.summary.totalWatchTime
    };
};

/**
 * Load current + previous snapshot sources in parallel for delta mode.
 */
const loadDeltaParallel = async (
    currentSnapshot: TrafficSnapshot,
    allSnapshots: TrafficSnapshot[]
): Promise<{ sources: TrafficSource[], totalRow?: TrafficSource, deltaContext?: DeltaContext } | null> => {
    const prevSnapshot = findPreviousSnapshot(currentSnapshot.id, allSnapshots);
    if (!prevSnapshot) return null;

    const [currentResult, prevResult] = await Promise.all([
        loadSnapshotSources(currentSnapshot),
        loadSnapshotSources(prevSnapshot)
    ]);

    if (currentResult.sources.length === 0) return null;

    const prevTotal = buildCachedPrevTotal(prevSnapshot) ?? prevResult.totalRow;

    return calculateSnapshotDelta(
        currentResult.sources,
        currentResult.totalRow,
        prevResult.sources,
        prevTotal
    );
};

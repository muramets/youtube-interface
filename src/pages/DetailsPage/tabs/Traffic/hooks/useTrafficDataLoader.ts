import { useState, useEffect, useRef } from 'react';
import type { TrafficData, TrafficSource, TrafficSnapshot, TrafficGroup } from '../../../../../core/types/traffic';
import type { PackagingVersion, ActivePeriod } from '../../../../../core/types/versioning';
import { TrafficService } from '../../../../../core/services/traffic';
import { loadSnapshotSources } from '../utils/snapshotLoader';
import { logger } from '../../../../../core/utils/logger';

interface UseTrafficDataLoaderProps {
    trafficData: TrafficData | null;
    viewingVersion?: number | 'draft';
    viewingPeriodIndex?: number;
    activeVersion: number;
    viewMode: 'cumulative' | 'delta';
    selectedSnapshot?: string | null;
    packagingHistory: PackagingVersion[];
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
 */
export const useTrafficDataLoader = ({
    trafficData,
    viewingVersion,
    viewingPeriodIndex,
    activeVersion,
    viewMode,
    selectedSnapshot,
    packagingHistory = [],
    groups = []
}: UseTrafficDataLoaderProps) => {
    const [displayedSources, setDisplayedSources] = useState<TrafficSource[]>([]);
    const [actualTotalRow, setActualTotalRow] = useState<TrafficSource | undefined>(undefined);
    const [trashMetrics, setTrashMetrics] = useState<TrashMetrics>({ impressions: 0, views: 0 });
    const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const lastLoadedKeyRef = useRef<string | null>(null);
    const lastLoadContextRef = useRef<{ snapshotId?: string | null; viewMode?: string, versionKey?: string } | null>(null);

    // Context for Delta Mode (Previous -> Current)
    const [deltaContext, setDeltaContext] = useState<DeltaContext | undefined>(undefined);

    // Business Logic: Identify Trash videos
    const trashGroup = groups.find(g => g.name.trim().toLowerCase() === 'trash');
    const trashVideoIds = new Set(trashGroup?.videoIds || []);

    const calculateTrashMetrics = (sources: TrafficSource[]): TrashMetrics => {
        let trashImpressions = 0;
        let trashViews = 0;

        sources.forEach(s => {
            if (s.videoId && trashVideoIds.has(s.videoId)) {
                trashImpressions += (s.impressions || 0);
                trashViews += (s.views || 0);
            }
        });

        return { impressions: trashImpressions, views: trashViews };
    };

    const retry = () => {
        logger.info('User initiated retry for traffic data loading', { component: 'useTrafficDataLoader' });
        setError(null);
        lastLoadedKeyRef.current = null;
        setActualTotalRow(undefined);
        setRetryCount(prev => prev + 1);
    };

    useEffect(() => {
        const loadData = async () => {
            const loadKey = `${selectedSnapshot || ''}-${viewingVersion}-${viewingPeriodIndex}-${viewMode}-${trashVideoIds.size}-${trafficData?.lastUpdated}-${trafficData?.snapshots?.length}`;

            if (loadKey === lastLoadedKeyRef.current && displayedSources.length > 0) {
                // IMPORTANT: If groups changed but loadKey didn't (size same), we still might need to recalculate trashMetrics
                // because calculateTrashMetrics depends on trashVideoIds closure.
                // But usually size changes when assignments change for Trash.
                return;
            }

            // Determine if this is a "soft update" (only trash metrics/context changed)
            // or a "hard update" (snapshot switched, version switched, etc.)
            const currentContext = {
                snapshotId: selectedSnapshot,
                viewMode,
                versionKey: `${viewingVersion}-${viewingPeriodIndex}`
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
                return;
            }

            // Priority 1: Specific snapshot selected
            if (selectedSnapshot) {
                if (!isSoftUpdate) setIsLoadingSnapshot(true);
                try {
                    const snapshot = trafficData.snapshots?.find((s: TrafficSnapshot) => s.id === selectedSnapshot);
                    if (snapshot) {
                        let { sources: currentSources, totalRow: currentTotal } = await loadSnapshotSources(snapshot);

                        if (viewMode === 'delta' && currentSources.length > 0) {
                            const result = await calculateSnapshotDelta(
                                currentSources,
                                currentTotal,
                                selectedSnapshot,
                                trafficData.snapshots || [],
                                trashVideoIds
                            );

                            // For Delta mode, trash metrics MUST be calculated from DELTA sources
                            setTrashMetrics(calculateTrashMetrics(result.sources));
                            setDisplayedSources(result.sources);
                            setActualTotalRow(result.totalRow);
                            setDeltaContext(result.deltaContext);
                        } else {
                            // Cumulative mode
                            setTrashMetrics(calculateTrashMetrics(currentSources));
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

            // Priority 2: Active version
            if (viewingVersion === 'draft' || viewingVersion === activeVersion) {
                const versionSnapshots = (trafficData.snapshots || []).filter(
                    (s: TrafficSnapshot) => s.version === viewingVersion
                );

                if (versionSnapshots.length > 0) {
                    if (!isSoftUpdate) setIsLoadingSnapshot(true);
                    try {
                        const versionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
                        let targetPeriodIndex = viewingPeriodIndex;

                        if (targetPeriodIndex === undefined && versionData?.activePeriods) {
                            const openPeriodIndex = versionData.activePeriods.findIndex((p: ActivePeriod) => !p.endDate);
                            targetPeriodIndex = openPeriodIndex !== -1 ? openPeriodIndex : 0;
                        }

                        const finalIndex = targetPeriodIndex ?? 0;
                        const period = versionData?.activePeriods?.[finalIndex];
                        const periodStart = period?.startDate ?? Date.now();
                        const periodEnd = (finalIndex === 0) ? null : period?.endDate;

                        const periodSnapshots = versionSnapshots.filter(s =>
                            s.timestamp >= periodStart && (!periodEnd || s.timestamp <= periodEnd)
                        ).sort((a, b) => b.timestamp - a.timestamp);

                        if (viewMode === 'delta' && periodSnapshots.length > 0) {
                            const latestSnap = periodSnapshots[0];
                            let { sources: currentSources, totalRow: currentTotal } = await loadSnapshotSources(latestSnap);

                            const result = await calculateSnapshotDelta(
                                currentSources,
                                currentTotal,
                                latestSnap.id,
                                trafficData.snapshots || [],
                                trashVideoIds
                            );

                            setTrashMetrics(calculateTrashMetrics(result.sources));
                            setDisplayedSources(result.sources);
                            setActualTotalRow(result.totalRow);
                            setDeltaContext(result.deltaContext);
                        } else {
                            let { sources, totalRow: currentTotal } = await TrafficService.getVersionSources(
                                viewingVersion as number,
                                trafficData.snapshots || [],
                                periodStart,
                                periodEnd
                            );

                            setTrashMetrics(calculateTrashMetrics(sources));
                            setDisplayedSources(sources);
                            setActualTotalRow(currentTotal || trafficData.totalRow);
                            setDeltaContext(undefined);
                        }
                        lastLoadedKeyRef.current = loadKey;
                        lastLoadContextRef.current = currentContext;
                    } catch (err) {
                        logger.error('Failed to load active version sources', { component: 'useTrafficDataLoader', error: err, viewingVersion });
                        setError(err instanceof Error ? err : new Error('Unknown error loading active version'));
                        setDisplayedSources(trafficData.sources || []);
                        setActualTotalRow(trafficData.totalRow);
                    } finally {
                        if (!isSoftUpdate) setIsLoadingSnapshot(false);
                    }
                    return;
                }
            }

            // Priority 3: Historical Version
            if (!isSoftUpdate) setIsLoadingSnapshot(true);
            try {
                const versionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
                const finalIndex = viewingPeriodIndex || 0;
                const period = versionData?.activePeriods?.[finalIndex];
                const periodStart = period?.startDate;
                const periodEnd = (finalIndex === 0) ? null : period?.endDate;

                const versionSnapshots = (trafficData.snapshots || []).filter(
                    (s: TrafficSnapshot) => s.version === viewingVersion
                );

                const periodSnapshots = versionSnapshots.filter(s =>
                    (periodStart === undefined || s.timestamp >= periodStart) &&
                    (!periodEnd || s.timestamp <= periodEnd)
                ).sort((a, b) => b.timestamp - a.timestamp);

                if (viewMode === 'delta' && periodSnapshots.length > 0) {
                    const latestSnap = periodSnapshots[0];
                    let { sources: currentSources, totalRow: currentTotal } = await loadSnapshotSources(latestSnap);

                    const result = await calculateSnapshotDelta(
                        currentSources,
                        currentTotal,
                        latestSnap.id,
                        trafficData.snapshots || [],
                        trashVideoIds
                    );

                    setTrashMetrics(calculateTrashMetrics(result.sources));
                    setDisplayedSources(result.sources);
                    setActualTotalRow(result.totalRow);
                    setDeltaContext(result.deltaContext);
                } else {
                    let { sources, totalRow: currentTotal } = await TrafficService.getVersionSources(
                        viewingVersion as number,
                        trafficData.snapshots || [],
                        periodStart,
                        periodEnd
                    );

                    setTrashMetrics(calculateTrashMetrics(sources));
                    setDisplayedSources(sources);
                    setActualTotalRow(currentTotal || trafficData.totalRow);
                    setDeltaContext(undefined);
                }
                lastLoadedKeyRef.current = loadKey;
                lastLoadContextRef.current = currentContext;
            } catch (err) {
                logger.error('Failed to load historical version sources', { component: 'useTrafficDataLoader', error: err, viewingVersion });
                setError(err instanceof Error ? err : new Error('Unknown error loading historical version'));
                setDisplayedSources([]);
                setActualTotalRow(undefined);
            } finally {
                if (!isSoftUpdate) setIsLoadingSnapshot(false);
            }
        };

        loadData();
    }, [trafficData, viewingVersion, viewingPeriodIndex, activeVersion, viewMode, selectedSnapshot, packagingHistory, retryCount, trashVideoIds.size]);

    return { displayedSources, actualTotalRow, trashMetrics, isLoadingSnapshot, error, retry, deltaContext };
};

/**
 * Helper function to calculate delta between snapshots.
 */
const calculateSnapshotDelta = async (
    currentSources: TrafficSource[],
    currentTotal: TrafficSource | undefined,
    currentSnapshotId: string,
    snapshots: TrafficSnapshot[],
    _trashVideoIds: Set<string> = new Set()
): Promise<{ sources: TrafficSource[], totalRow?: TrafficSource, deltaContext?: DeltaContext }> => {
    const sortedSnapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const currentIndex = sortedSnapshots.findIndex(s => s.id === currentSnapshotId);

    if (currentIndex <= 0) {
        return { sources: [], totalRow: undefined };
    }

    const prevSnapshot = sortedSnapshots[currentIndex - 1];
    const { sources: prevSources, totalRow: prevTotal } = await loadSnapshotSources(prevSnapshot);

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

    // Ensure we have both totals to calculate context
    if (currentTotal && prevTotal) {
        // Calculate Total Delta
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

        // Populate Delta Context for Tooltip
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
        // Explicitly signal that we cannot calculate context due to missing Total row
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

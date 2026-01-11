import { useState, useEffect } from 'react';
import type { TrafficData, TrafficSource, TrafficSnapshot } from '../../../../../core/types/traffic';
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
    packagingHistory: PackagingVersion[]; // CHANGED: strict type instead of any[]
}

/**
 * Хук для загрузки и отображения данных трафика.
 * Управляет сложной логикой загрузки снапшотов и расчета дельты.
 * 
 * Приоритеты загрузки:
 * 1. Конкретный снапшот (если selectedSnapshot указан)
 * 2. Активная версия (с загрузкой из последнего снапшота)
 * 3. Историческая версия
 */
export const useTrafficDataLoader = ({
    trafficData,
    viewingVersion,
    viewingPeriodIndex,
    activeVersion,
    viewMode,
    selectedSnapshot,
    packagingHistory = []
}: UseTrafficDataLoaderProps) => {
    const [displayedSources, setDisplayedSources] = useState<TrafficSource[]>([]);
    const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);

    // BUSINESS LOGIC: Error Handling & Recovery
    // Stores any error encountered during the data loading process.
    // retryCount is used as a dependency to force re-execution of the effect when user clicks Retry.
    const [error, setError] = useState<Error | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    const retry = () => {
        logger.info('User initiated retry for traffic data loading', { component: 'useTrafficDataLoader' });
        setError(null);
        setRetryCount(prev => prev + 1);
    };

    useEffect(() => {
        const loadData = async () => {
            // Reset error at start of new load attempt
            setError(null);

            logger.debug('Traffic data loader triggered', {
                component: 'useTrafficDataLoader',
                viewingVersion,
                activeVersion,
                selectedSnapshot,
                dataSourcesLen: trafficData?.sources?.length,
                snapshotsLen: trafficData?.snapshots?.length,
                retryCount
            });

            if (!trafficData?.sources) {
                logger.debug('No sources in trafficData, setting empty', { component: 'useTrafficDataLoader' });
                setDisplayedSources([]);
                return;
            }

            // Приоритет 1: Конкретный снапшот выбран
            if (selectedSnapshot) {
                logger.debug('Loading specific snapshot', { component: 'useTrafficDataLoader', selectedSnapshot });
                setIsLoadingSnapshot(true);
                try {
                    const snapshot = trafficData.snapshots?.find((s: TrafficSnapshot) => s.id === selectedSnapshot);
                    if (snapshot) {
                        // Загружаем текущий снапшот
                        let { sources: currentSources } = await loadSnapshotSources(snapshot);

                        // Применяем Delta mode если включен
                        if (viewMode === 'delta' && currentSources.length > 0) {
                            currentSources = await calculateSnapshotDelta(
                                currentSources,
                                selectedSnapshot,
                                trafficData.snapshots || []
                            );
                        }

                        setDisplayedSources(currentSources);
                    } else {
                        setDisplayedSources([]);
                    }
                } catch (error) {
                    logger.error('Failed to load snapshot', { component: 'useTrafficDataLoader', error, selectedSnapshot });
                    setError(error instanceof Error ? error : new Error('Unknown error'));
                    setDisplayedSources([]);
                } finally {
                    setIsLoadingSnapshot(false);
                }
                return;
            }

            // Приоритет 2: Активная версия (draft или текущая)
            if (viewingVersion === 'draft' || viewingVersion === activeVersion) {
                const versionSnapshots = (trafficData.snapshots || []).filter(
                    (s: TrafficSnapshot) => s.version === viewingVersion
                );

                // Если есть снапшоты, загружаем из последнего для точности
                if (versionSnapshots.length > 0) {
                    logger.debug('Active version has snapshots, loading latest', { component: 'useTrafficDataLoader', viewingVersion, snapshotCount: versionSnapshots.length });
                    setIsLoadingSnapshot(true);
                    try {
                        // Resolve specific period dates
                        // SMART SELECTION: If viewingPeriodIndex is undefined, find the ACTIVE period (no endDate)
                        // or the one with the latest startDate to handle legacy data ordering.
                        const versionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
                        let targetPeriodIndex = viewingPeriodIndex;

                        if (targetPeriodIndex === undefined && versionData?.activePeriods) {
                            // 1. Try to find open period (no endDate)
                            const openPeriodIndex = versionData.activePeriods.findIndex((p: ActivePeriod) => !p.endDate);
                            if (openPeriodIndex !== -1) {
                                versionData.activePeriods[openPeriodIndex].endDate = Date.now();
                                targetPeriodIndex = openPeriodIndex;
                            } else {
                                // 2. If all closed, find the Latest one by startDate
                                let maxStart = -1;
                                let maxIdx = 0;
                                versionData.activePeriods.forEach((p: ActivePeriod, idx: number) => {
                                    if (p.startDate > maxStart) {
                                        maxStart = p.startDate;
                                        maxIdx = idx;
                                    }
                                });
                                targetPeriodIndex = maxIdx;
                            }
                        }

                        // Fallback to 0 if still undefined (shouldn't happen if activePeriods exists)
                        const finalIndex = targetPeriodIndex ?? 0;
                        const period = versionData?.activePeriods?.[finalIndex];
                        const periodStart = period?.startDate ?? Date.now();

                        // FIX: If viewing the LATEST period (index 0), ignore the end date.
                        // This allows snapshots uploaded AFTER the version became inactive.
                        const isLatestPeriod = finalIndex === 0;
                        const periodEnd = isLatestPeriod ? null : period?.endDate;

                        const { sources } = await TrafficService.getVersionSources(
                            viewingVersion as number,
                            trafficData.snapshots || [],
                            periodStart,
                            periodEnd
                        );
                        logger.debug('Loaded sources from latest snapshot', { component: 'useTrafficDataLoader', viewingVersion, sourcesCount: sources.length });

                        if (viewMode === 'delta') {
                            const allSnapshots = trafficData.snapshots || [];
                            // 0. Setup: Sort all snapshots for accurate timestamp checks
                            const sortedGlobal = [...allSnapshots].sort((a: TrafficSnapshot, b: TrafficSnapshot) => b.timestamp - a.timestamp);

                            // 1. Candidate A: Local Predecessor (Previous Period of SAME version)
                            let localPredecessorSource: TrafficSource[] = [];
                            let localPredecessorTimestamp = 0;

                            const nextIndex = finalIndex + 1;
                            const prevPeriod = versionData?.activePeriods?.[nextIndex];
                            if (prevPeriod) {
                                const { sources: lpSource } = await TrafficService.getVersionSources(
                                    viewingVersion as number,
                                    allSnapshots,
                                    prevPeriod.startDate,
                                    prevPeriod.endDate
                                );
                                localPredecessorSource = lpSource;
                                // Find the actual snapshot used for accurate timestamp comparison
                                const localSnap = sortedGlobal.find(s =>
                                    s.version === viewingVersion &&
                                    s.timestamp >= prevPeriod.startDate &&
                                    (!prevPeriod.endDate || s.timestamp <= prevPeriod.endDate)
                                );
                                localPredecessorTimestamp = localSnap?.timestamp || 0;
                            }

                            // 2. Candidate B: Global Predecessor (Latest snapshot of ANY OTHER version strictly before current)
                            let globalPredecessorSource: TrafficSource[] = [];
                            let globalPredecessorTimestamp = 0;

                            // Scope currentSnapshot to VIEWING VERSION AND PERIOD
                            // CRITICAL: Use snapshot from the CURRENT PERIOD, not the latest snapshot of the version
                            const currentSnapshot = selectedSnapshot
                                ? allSnapshots.find(s => s.id === selectedSnapshot)
                                : sortedGlobal.find(s =>
                                    s.version === viewingVersion &&
                                    s.timestamp >= periodStart &&
                                    (!periodEnd || s.timestamp <= periodEnd)
                                ) || null;

                            const referenceTimestamp = currentSnapshot ? currentSnapshot.timestamp : Date.now();
                            logger.debug('Active version reference timestamp', { component: 'useTrafficDataLoader', referenceTimestamp, currentSnapshotId: currentSnapshot?.id, periodStart, periodEnd });

                            const globalSnap = sortedGlobal.find(s =>
                                s.timestamp < referenceTimestamp && s.version !== viewingVersion
                            );

                            if (globalSnap) {
                                globalPredecessorTimestamp = globalSnap.timestamp;
                            }

                            // 3. Decision: Pick the NEWER predecessor
                            let baselineSources: TrafficSource[] = [];

                            // If Global is strictly newer than Local (and exists), use it
                            if (globalPredecessorTimestamp > localPredecessorTimestamp) {
                                if (globalSnap) {
                                    logger.debug('Using global predecessor (newer)', { component: 'useTrafficDataLoader', snapshotId: globalSnap.id, globalTimestamp: globalSnap.timestamp, localTimestamp: localPredecessorTimestamp });
                                    const { sources: gpSource } = await loadSnapshotSources(globalSnap);
                                    globalPredecessorSource = gpSource;
                                    baselineSources = globalPredecessorSource;
                                }
                            } else {
                                // Local is newer or equal, OR Global doesn't exist
                                if (localPredecessorSource.length > 0) {
                                    logger.debug('Using local predecessor (newer/equal)', { component: 'useTrafficDataLoader', localTimestamp: localPredecessorTimestamp, globalTimestamp: globalPredecessorTimestamp });
                                    baselineSources = localPredecessorSource;
                                } else if (globalSnap) {
                                    // Fallback: Local was empty/invalid, try Global
                                    logger.debug('Local empty, fallback to global', { component: 'useTrafficDataLoader', snapshotId: globalSnap.id });
                                    const { sources: gpSource } = await loadSnapshotSources(globalSnap);
                                    globalPredecessorSource = gpSource;
                                    baselineSources = globalPredecessorSource;
                                }
                            }

                            // 4. Calculate Delta
                            if (baselineSources.length > 0) {
                                const delta = TrafficService.calculateSourcesDelta(sources, baselineSources);
                                setDisplayedSources(delta);
                            } else {
                                logger.debug('No baseline found (first version)', { component: 'useTrafficDataLoader', viewingVersion });
                                setDisplayedSources([]); // Empty state
                            }
                        } else {
                            setDisplayedSources(sources);
                        }
                    } catch (error) {
                        logger.error('Failed to load version sources', { component: 'useTrafficDataLoader', error, viewingVersion });
                        setError(error instanceof Error ? error : new Error('Unknown error loading active version'));
                        // Fallback к sources если загрузка снапшота не удалась (legacy behavior preserved but tracked as error)
                        setDisplayedSources(trafficData.sources || []);
                    } finally {
                        setIsLoadingSnapshot(false);
                    }
                } else {
                    // No snapshots for active version → show EMPTY STATE
                    logger.debug('No snapshots for active version, showing empty', { component: 'useTrafficDataLoader', viewingVersion });
                    setDisplayedSources([]);
                }
            } else {
                // Priority 3: Historical Version
                logger.debug('Loading historical version', { component: 'useTrafficDataLoader', viewingVersion, viewingPeriodIndex });
                setIsLoadingSnapshot(true);
                try {
                    // Resolve specific period dates for historical version
                    const versionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
                    const finalIndex = viewingPeriodIndex || 0;
                    const period = versionData?.activePeriods?.[finalIndex];
                    const periodStart = period?.startDate;

                    // FIX: If viewing the LATEST period (index 0), ignore the end date.
                    const isLatestPeriod = finalIndex === 0;
                    const periodEnd = isLatestPeriod ? null : period?.endDate;

                    const { sources } = await TrafficService.getVersionSources(
                        viewingVersion as number,
                        trafficData.snapshots || [],
                        periodStart,
                        periodEnd
                    );
                    logger.debug('Loaded historical sources', { component: 'useTrafficDataLoader', viewingVersion, sourcesCount: sources.length });

                    if (viewMode === 'delta') {
                        const allSnapshots = trafficData.snapshots || [];
                        const sortedGlobal = [...allSnapshots].sort((a: TrafficSnapshot, b: TrafficSnapshot) => b.timestamp - a.timestamp);

                        // 1. Candidate A: Local Predecessor
                        let localPredecessorSource: TrafficSource[] = [];
                        let localPredecessorTimestamp = 0;

                        const nextIndex = finalIndex + 1;
                        const prevPeriod = versionData?.activePeriods?.[nextIndex];
                        if (prevPeriod) {
                            const { sources: lpSource } = await TrafficService.getVersionSources(
                                viewingVersion as number,
                                allSnapshots,
                                prevPeriod.startDate,
                                prevPeriod.endDate
                            );
                            localPredecessorSource = lpSource;
                            const localSnap = sortedGlobal.find(s =>
                                s.version === viewingVersion &&
                                s.timestamp >= prevPeriod.startDate &&
                                (!prevPeriod.endDate || s.timestamp <= prevPeriod.endDate)
                            );
                            localPredecessorTimestamp = localSnap?.timestamp || 0;
                        }

                        // 2. Candidate B: Global Predecessor
                        let globalPredecessorSource: TrafficSource[] = [];
                        let globalPredecessorTimestamp = 0;

                        // FIX: Scope currentSnapshot to VIEWING VERSION
                        const currentSnapshot = selectedSnapshot
                            ? allSnapshots.find(s => s.id === selectedSnapshot)
                            : (sortedGlobal.find(s => s.version === viewingVersion) || null);

                        const referenceTimestamp = currentSnapshot ? currentSnapshot.timestamp : Date.now();
                        logger.debug('Historical version reference timestamp', { component: 'useTrafficDataLoader', referenceTimestamp, currentSnapshotId: currentSnapshot?.id });

                        const globalSnap = sortedGlobal.find(s =>
                            s.timestamp < referenceTimestamp && s.version !== viewingVersion
                        );

                        if (globalSnap) {
                            globalPredecessorTimestamp = globalSnap.timestamp;
                        }

                        // 3. Decision
                        let baselineSources: TrafficSource[] = [];

                        if (globalPredecessorTimestamp > localPredecessorTimestamp) {
                            if (globalSnap) {
                                logger.debug('Using global predecessor (historical/newer)', { component: 'useTrafficDataLoader', snapshotId: globalSnap.id, globalTimestamp: globalSnap.timestamp, localTimestamp: localPredecessorTimestamp });
                                const { sources: gpSource } = await loadSnapshotSources(globalSnap);
                                globalPredecessorSource = gpSource;
                                baselineSources = globalPredecessorSource;
                            }
                        } else {
                            if (localPredecessorSource.length > 0) {
                                logger.debug('Using local predecessor (historical/newer)', { component: 'useTrafficDataLoader', localTimestamp: localPredecessorTimestamp, globalTimestamp: globalPredecessorTimestamp });
                                baselineSources = localPredecessorSource;
                            } else if (globalSnap) {
                                logger.debug('Local empty, fallback to global (historical)', { component: 'useTrafficDataLoader', snapshotId: globalSnap.id });
                                const { sources: gpSource } = await loadSnapshotSources(globalSnap);
                                globalPredecessorSource = gpSource;
                                baselineSources = globalPredecessorSource;
                            }
                        }

                        if (baselineSources.length > 0) {
                            const delta = TrafficService.calculateSourcesDelta(sources, baselineSources);
                            setDisplayedSources(delta);
                        } else {
                            logger.debug('No baseline found for historical version', { component: 'useTrafficDataLoader', viewingVersion });
                            setDisplayedSources([]);
                        }
                    } else {
                        setDisplayedSources(sources);
                    }
                } catch (error) {
                    logger.error('Failed to load historical version sources', { component: 'useTrafficDataLoader', error, viewingVersion });
                    setError(error instanceof Error ? error : new Error('Unknown error loading historical version'));
                    setDisplayedSources([]);
                } finally {
                    setIsLoadingSnapshot(false);
                }
            }
        };

        loadData();
    }, [trafficData, viewingVersion, viewingPeriodIndex, activeVersion, viewMode, selectedSnapshot, packagingHistory, retryCount]);

    return { displayedSources, isLoadingSnapshot, error, retry };
};

/**
 * Вспомогательная функция для расчета дельты между снапшотами
 */
const calculateSnapshotDelta = async (
    currentSources: TrafficSource[],
    currentSnapshotId: string,
    snapshots: TrafficSnapshot[]
): Promise<TrafficSource[]> => {
    // Сортируем снапшоты по времени для правильного поиска предыдущего
    const sortedSnapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const currentIndex = sortedSnapshots.findIndex((s: TrafficSnapshot) => s.id === currentSnapshotId);

    if (currentIndex <= 0) {
        // Это первый снапшот, дельта = пустой массив для показа Empty State
        return [];
    }

    const prevSnapshot = sortedSnapshots[currentIndex - 1];

    const { sources: prevSources } = await loadSnapshotSources(prevSnapshot);

    if (prevSources.length === 0) {
        // This is the first snapshot -> return empty array to trigger Empty State
        return [];
    }

    // Создаем Map для быстрого поиска предыдущих значений
    const prevData = new Map<string, { views: number; impressions: number; watchTime: number }>();
    prevSources.forEach((s: TrafficSource) => {
        if (s.videoId) {
            prevData.set(s.videoId, {
                views: s.views || 0,
                impressions: s.impressions || 0,
                watchTime: s.watchTimeHours || 0
            });
        }
    });

    // Вычисляем дельту
    return currentSources
        .map((source: TrafficSource) => {
            if (!source.videoId) return source;

            const prev = prevData.get(source.videoId) || { views: 0, impressions: 0, watchTime: 0 };

            const viewsDelta = Math.max(0, source.views - prev.views);
            const impressionsDelta = Math.max(0, (source.impressions || 0) - prev.impressions);
            const watchTimeDelta = Math.max(0, (source.watchTimeHours || 0) - prev.watchTime);

            // Пересчитываем CTR на основе дельты
            const ctrDelta = impressionsDelta > 0 ? (viewsDelta / impressionsDelta) * 100 : 0;

            return {
                ...source,
                views: viewsDelta,
                impressions: impressionsDelta,
                watchTimeHours: watchTimeDelta,
                ctr: parseFloat(ctrDelta.toFixed(2))
            };
        })
        // Фильтруем источники без новой активности в Delta mode
        .filter((source: TrafficSource) => !source.videoId || source.views > 0 || source.impressions > 0);
};

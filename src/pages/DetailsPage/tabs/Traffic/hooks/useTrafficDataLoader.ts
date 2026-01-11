import { useState, useEffect } from 'react';
import type { TrafficData, TrafficSource } from '../../../../../core/types/traffic';
import { TrafficService } from '../../../../../core/services/traffic';
import { loadSnapshotSources } from '../utils/snapshotLoader';

interface UseTrafficDataLoaderProps {
    trafficData: TrafficData | null;
    viewingVersion?: number | 'draft';
    viewingPeriodIndex?: number;
    activeVersion: number;
    viewMode: 'cumulative' | 'delta';
    selectedSnapshot?: string | null;
    packagingHistory?: any[];
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

    useEffect(() => {
        const loadData = async () => {
            console.log('[useTrafficDataLoader] loadData triggered:', {
                viewingVersion,
                activeVersion,
                selectedSnapshot,
                dataSourcesLen: trafficData?.sources?.length,
                snapshotsLen: trafficData?.snapshots?.length
            });

            if (!trafficData?.sources) {
                console.log('[useTrafficDataLoader] No sources in trafficData, setting empty');
                setDisplayedSources([]);
                return;
            }

            // Приоритет 1: Конкретный снапшот выбран
            if (selectedSnapshot) {
                console.log('[useTrafficDataLoader] Loading specific snapshot:', selectedSnapshot);
                setIsLoadingSnapshot(true);
                try {
                    const snapshot = trafficData.snapshots?.find((s: any) => s.id === selectedSnapshot);
                    if (snapshot) {
                        // Загружаем текущий снапшот
                        let currentSources = await loadSnapshotSources(snapshot);

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
                    console.error('Failed to load snapshot:', error);
                    setDisplayedSources([]);
                } finally {
                    setIsLoadingSnapshot(false);
                }
                return;
            }

            // Приоритет 2: Активная версия (draft или текущая)
            if (viewingVersion === 'draft' || viewingVersion === activeVersion) {
                const versionSnapshots = (trafficData.snapshots || []).filter(
                    (s: any) => s.version === viewingVersion
                );

                // Если есть снапшоты, загружаем из последнего для точности
                if (versionSnapshots.length > 0) {
                    console.log('[useTrafficDataLoader] Active version has snapshots, loading LATEST snapshot');
                    setIsLoadingSnapshot(true);
                    try {
                        // Resolve specific period dates
                        // SMART SELECTION: If viewingPeriodIndex is undefined, find the ACTIVE period (no endDate)
                        // SMART SELECTION: If viewingPeriodIndex is undefined, find the ACTIVE period (no endDate)
                        // or the one with the latest startDate to handle legacy data ordering ([Old, New] vs [New, Old])
                        const versionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
                        let targetPeriodIndex = viewingPeriodIndex;

                        if (targetPeriodIndex === undefined && versionData?.activePeriods) {
                            // 1. Try to find open period (no endDate)
                            const openPeriodIndex = versionData.activePeriods.findIndex((p: any) => !p.endDate);
                            if (openPeriodIndex !== -1) {
                                versionData.activePeriods[openPeriodIndex].endDate = Date.now();
                                targetPeriodIndex = openPeriodIndex;
                            } else {
                                // 2. If all closed, find the Latest one by startDate
                                let maxStart = -1;
                                let maxIdx = 0;
                                versionData.activePeriods.forEach((p: any, idx: number) => {
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
                        const periodStart = period?.startDate;

                        // FIX: If viewing the LATEST period (index 0), ignore the end date.
                        // This allows snapshots uploaded AFTER the version became inactive (e.g. via "Save Traffic Snapshot" modal)
                        // to still be visible.
                        const isLatestPeriod = finalIndex === 0;
                        const periodEnd = isLatestPeriod ? null : period?.endDate;

                        const sources = await TrafficService.getVersionSources(
                            viewingVersion as number,
                            trafficData.snapshots || [],
                            periodStart,
                            periodEnd
                        );
                        console.log('[useTrafficDataLoader] Loaded formatted sources from latest snapshot:', sources);

                        if (viewMode === 'delta') {
                            let prevSources: TrafficSource[] = [];

                            // Smart Delta: 
                            // activePeriods are sorted DESCENDING (Newest First).
                            // So "Previous Period" (older) is at index + 1.
                            const nextIndex = finalIndex + 1;
                            const prevPeriod = versionData?.activePeriods?.[nextIndex];

                            if (prevPeriod) {
                                prevSources = await TrafficService.getVersionSources(
                                    viewingVersion as number,
                                    trafficData.snapshots || [],
                                    prevPeriod.startDate,
                                    prevPeriod.endDate
                                );
                            }

                            // If no older period found, check GLOBAL history
                            if (prevSources.length === 0) {
                                // GLOBAL TIME-BASED DIFF:
                                // Find the latest snapshot in the ENTIRE history that occurred BEFORE the current period start.
                                // This handles restored versions correctly (comparing V.1 Restored vs V.3).
                                const allSnapshots = trafficData.snapshots || [];
                                const sortedGlobal = [...allSnapshots].sort((a: any, b: any) => a.timestamp - b.timestamp);

                                // Find the latest snapshot strictly before periodStart
                                // (periodStart is the start of the ACTIVE period for this version)
                                const globalPredecessor = sortedGlobal.reverse().find((s: any) => s.timestamp < (periodStart || 0));

                                if (globalPredecessor) {
                                    console.log('[useTrafficDataLoader] Found global predecessor:', globalPredecessor.id);
                                    const predSources = await loadSnapshotSources(globalPredecessor);
                                    const delta = TrafficService.calculateSourcesDelta(sources, predSources);
                                    setDisplayedSources(delta);
                                } else {
                                    // Truly first version ever -> Empty UI ("First Version")
                                    setDisplayedSources([]);
                                }
                            } else {
                                // Normal Case: Compare with previous period of same version
                                const delta = TrafficService.calculateSourcesDelta(sources, prevSources);
                                setDisplayedSources(delta);
                            }
                        } else {
                            setDisplayedSources(sources);
                        }
                    } catch (error) {
                        console.error('Failed to load version sources:', error);
                        // Fallback к sources если загрузка снапшота не удалась
                        setDisplayedSources(trafficData.sources || []);
                    } finally {
                        setIsLoadingSnapshot(false);
                    }
                } else {
                    // No snapshots for active version → show EMPTY STATE
                    // NOTE: Do NOT use trafficData.sources - they may be from a different version!
                    console.log('[useTrafficDataLoader] No snapshots for active version, showing empty state');
                    setDisplayedSources([]);
                }
            } else {
                // Приоритет 3: Историческая версия
                console.log('[useTrafficDataLoader] Loading historical version:', viewingVersion);
                setIsLoadingSnapshot(true);
                try {
                    // Resolve specific period dates for historical version
                    const versionData = packagingHistory.find(v => v.versionNumber === viewingVersion);
                    const finalIndex = viewingPeriodIndex || 0;
                    const period = versionData?.activePeriods?.[finalIndex];
                    const periodStart = period?.startDate;

                    // FIX: If viewing the LATEST period (index 0), ignore the end date.
                    // This ensures manually uploaded snapshots for historical versions are visible.
                    const isLatestPeriod = finalIndex === 0;
                    const periodEnd = isLatestPeriod ? null : period?.endDate;

                    const sources = await TrafficService.getVersionSources(
                        viewingVersion as number,
                        trafficData.snapshots || [],
                        periodStart,
                        periodEnd
                    );
                    console.log('[useTrafficDataLoader] Loaded historical sources:', sources);

                    if (viewMode === 'delta') {
                        let prevSources: TrafficSource[] = [];

                        // Smart Delta for History (Newest First -> Look at Next Index)
                        const nextIndex = finalIndex + 1;
                        const prevPeriod = versionData?.activePeriods?.[nextIndex];

                        if (prevPeriod) {
                            prevSources = await TrafficService.getVersionSources(
                                viewingVersion as number,
                                trafficData.snapshots || [],
                                prevPeriod.startDate,
                                prevPeriod.endDate
                            );
                        }

                        if (prevSources.length === 0) {
                            // GLOBAL TIME-BASED DIFF (For Historical Views):
                            const allSnapshots = trafficData.snapshots || [];
                            const sortedGlobal = [...allSnapshots].sort((a: any, b: any) => a.timestamp - b.timestamp);

                            const globalPredecessor = sortedGlobal.reverse().find((s: any) => s.timestamp < (periodStart || 0));

                            if (globalPredecessor) {
                                console.log('[useTrafficDataLoader] Found global predecessor (historical):', globalPredecessor.id);
                                const predSources = await loadSnapshotSources(globalPredecessor);
                                const delta = TrafficService.calculateSourcesDelta(sources, predSources);
                                setDisplayedSources(delta);
                            } else {
                                setDisplayedSources([]);
                            }
                        } else {
                            const delta = TrafficService.calculateSourcesDelta(sources, prevSources);
                            setDisplayedSources(delta);
                        }
                    } else {
                        setDisplayedSources(sources);
                    }
                } catch (error) {
                    console.error('Failed to load version sources:', error);
                    setDisplayedSources([]);
                } finally {
                    setIsLoadingSnapshot(false);
                }
            }
        };

        loadData();
    }, [trafficData, viewingVersion, viewingPeriodIndex, activeVersion, viewMode, selectedSnapshot, packagingHistory]);

    return { displayedSources, isLoadingSnapshot };
};

/**
 * Вспомогательная функция для расчета дельты между снапшотами
 */
const calculateSnapshotDelta = async (
    currentSources: TrafficSource[],
    currentSnapshotId: string,
    snapshots: any[]
): Promise<TrafficSource[]> => {
    // Сортируем снапшоты по времени для правильного поиска предыдущего
    const sortedSnapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const currentIndex = sortedSnapshots.findIndex((s: any) => s.id === currentSnapshotId);

    if (currentIndex <= 0) {
        // Это первый снапшот, дельта = пустой массив для показа Emtpy State
        return [];
    }

    const prevSnapshot = sortedSnapshots[currentIndex - 1];
    const prevSources = await loadSnapshotSources(prevSnapshot);

    if (prevSources.length === 0) {
        // This is the first snapshot -> return empty array to trigger Empty State
        // (Empty State will handle showing "First Snapshot" message/UI)
        return [];
    }

    // Создаем Map для быстрого поиска предыдущих значений
    const prevData = new Map<string, { views: number; impressions: number; watchTime: number }>();
    prevSources.forEach((s: any) => {
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
        .map((source: any) => {
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
        // Фильтруем источники без новых просмотров в Delta mode
        .filter((source: any) => !source.videoId || source.views > 0);
};

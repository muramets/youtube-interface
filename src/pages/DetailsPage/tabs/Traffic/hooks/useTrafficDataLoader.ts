import { useState, useEffect } from 'react';
import type { TrafficData, TrafficSource } from '../../../../../core/types/traffic';
import { TrafficService } from '../../../../../core/services/traffic';
import { loadSnapshotSources } from '../utils/snapshotLoader';

interface UseTrafficDataLoaderProps {
    trafficData: TrafficData | null;
    viewingVersion?: number | 'draft';
    activeVersion: number;
    viewMode: 'cumulative' | 'delta';
    selectedSnapshot?: string | null;
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
    activeVersion,
    viewMode,
    selectedSnapshot
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
                        const sources = await TrafficService.getVersionSources(
                            viewingVersion as number,
                            trafficData.snapshots || []
                        );
                        console.log('[useTrafficDataLoader] Loaded formatted sources from latest snapshot:', sources);

                        if (viewMode === 'delta') {
                            const delta = TrafficService.calculateVersionDelta(
                                sources,
                                activeVersion,
                                trafficData.snapshots || []
                            );
                            setDisplayedSources(delta);
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
                    // Нет снапшотов -> используем Working Copy (trafficData.sources)
                    console.log('[useTrafficDataLoader] No snapshots for active version, using trafficData.sources');
                    if (viewMode === 'delta') {
                        const delta = TrafficService.calculateVersionDelta(
                            trafficData.sources || [],
                            activeVersion,
                            trafficData.snapshots || []
                        );
                        setDisplayedSources(delta);
                    } else {
                        setDisplayedSources(trafficData.sources || []);
                    }
                }
            } else {
                // Приоритет 3: Историческая версия
                console.log('[useTrafficDataLoader] Loading historical version:', viewingVersion);
                setIsLoadingSnapshot(true);
                try {
                    const sources = await TrafficService.getVersionSources(
                        viewingVersion as number,
                        trafficData.snapshots || []
                    );
                    console.log('[useTrafficDataLoader] Loaded historical sources:', sources);
                    setDisplayedSources(sources);
                } catch (error) {
                    console.error('Failed to load version sources:', error);
                    setDisplayedSources([]);
                } finally {
                    setIsLoadingSnapshot(false);
                }
            }
        };

        loadData();
    }, [trafficData, viewingVersion, activeVersion, viewMode, selectedSnapshot]);

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
    // Находим предыдущий снапшот по timestamp
    const currentIndex = snapshots.findIndex((s: any) => s.id === currentSnapshotId);

    if (currentIndex <= 0) {
        // Это первый снапшот, дельта = все данные
        return currentSources;
    }

    const prevSnapshot = snapshots[currentIndex - 1];
    const prevSources = await loadSnapshotSources(prevSnapshot);

    if (prevSources.length === 0) {
        return currentSources;
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

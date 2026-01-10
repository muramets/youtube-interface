import type { TrafficSource, TrafficSnapshot } from '../../types/traffic';

/**
 * Сервис для расчета дельты трафика между версиями.
 * Вычисляет разницу в просмотрах, показах и времени просмотра.
 */
export const TrafficDeltaService = {
    /**
     * Вычисляет разницу между двумя наборами источников.
     * Generic метод для использования в разных контекстах.
     */
    calculateSourcesDelta(
        currentSources: TrafficSource[],
        prevSources: TrafficSource[]
    ): TrafficSource[] {
        if (prevSources.length === 0) {
            return currentSources;
        }

        // Создаем Map предыдущих данных для быстрого поиска
        const prevData = new Map<string, { views: number, impressions: number, watchTime: number }>();
        prevSources.forEach(s => {
            if (s.videoId) {
                prevData.set(s.videoId, {
                    views: s.views || 0,
                    impressions: s.impressions || 0,
                    watchTime: s.watchTimeHours || 0
                });
            }
        });

        // Вычисляем дельту для каждого источника
        return currentSources
            .map(source => {
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
            .filter(source => !source.videoId || source.views > 0);
    },

    /**
     * Рассчитывает дельту трафика для конкретной версии.
     * 
     * ЛОГИКА ПОИСКА ПРЕДЫДУЩИХ ДАННЫХ:
     * 1. Если указан closingSnapshotId (из activePeriods) → используем его (для восстановленных версий)
     * 2. Иначе ищем предыдущую версию по номеру (version - 1)
     * 
     * @param currentSources - Текущие источники трафика
     * @param version - Номер текущей версии
     * @param snapshots - Все доступные снапшоты
     * @param closingSnapshotId - ID снапшота, закрывшего предыдущий период (опционально)
     */
    async calculateVersionDelta(
        currentSources: TrafficSource[],
        version: number,
        snapshots: TrafficSnapshot[],
        closingSnapshotId?: string | null
    ): Promise<TrafficSource[]> {
        console.log('[TrafficDeltaService] calculateVersionDelta called:', {
            version,
            currentSourcesCount: currentSources.length,
            snapshotsCount: snapshots.length,
            closingSnapshotId,
            allVersions: snapshots.map(s => ({ id: s.id, version: s.version }))
        });

        let prevSources: TrafficSource[] = [];

        // ПРИОРИТЕТ 1: Используем closingSnapshotId если он указан (для восстановленных версий)
        if (closingSnapshotId) {
            console.log('[TrafficDeltaService] Using closingSnapshotId to find previous data:', closingSnapshotId);
            const closingSnapshot = snapshots.find(s => s.id === closingSnapshotId);

            if (closingSnapshot) {
                const { TrafficSnapshotService } = await import('./TrafficSnapshotService');
                prevSources = await TrafficSnapshotService.getVersionSources(
                    closingSnapshot.version,
                    snapshots,
                    closingSnapshot.timestamp,
                    closingSnapshot.timestamp
                );

                console.log('[TrafficDeltaService] Loaded sources from closingSnapshot:', {
                    snapshotId: closingSnapshotId,
                    snapshotVersion: closingSnapshot.version,
                    prevSourcesCount: prevSources.length
                });
            } else {
                console.warn('[TrafficDeltaService] closingSnapshotId not found in snapshots:', closingSnapshotId);
            }
        }

        // ПРИОРИТЕТ 2: Если не нашли через closingSnapshotId, ищем по номеру версии
        if (prevSources.length === 0) {
            // Находим предыдущую версию (максимальная версия < current)
            const previousVersions = snapshots
                .map(s => s.version)
                .filter(v => v < version)
                .sort((a, b) => b - a); // Descending

            const prevVersion = previousVersions[0];

            console.log('[TrafficDeltaService] Previous version search by number:', {
                requestedVersion: version,
                foundPreviousVersions: previousVersions,
                selectedPrevVersion: prevVersion
            });

            if (prevVersion === undefined) {
                console.log('[TrafficDeltaService] No previous version found, returning current sources as-is');
                return currentSources; // Нет предыдущих версий
            }

            // Загружаем данные предыдущей версии
            const { TrafficSnapshotService } = await import('./TrafficSnapshotService');
            prevSources = await TrafficSnapshotService.getVersionSources(prevVersion, snapshots);

            console.log('[TrafficDeltaService] Loaded previous version sources:', {
                prevVersion,
                prevSourcesCount: prevSources.length,
                prevVideoIds: prevSources.map(s => s.videoId).slice(0, 5)
            });
        }

        return this.calculateSourcesDelta(currentSources, prevSources);
    }
};
